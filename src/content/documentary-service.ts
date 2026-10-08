// src/content/documentary-service.ts
import type { AnomalyResult, IssueDraft } from '../core/anomalies/anomaly';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import type { DocumentaryRepo } from '../core/documentary/documentary-repo';
import { historyKindOf, mayBeHistory } from '../core/documentary/history-kinds';
import { buildFlagIssue, buildProposalIssue, parseYoutubeKey } from '../core/documentary/proposal';
import type { OembedResult, RelayResult } from '../core/documentary/relay-api';
import type { SubjectInfo } from '../core/documentary/subject';
import type { DocCandidate, DocSubject } from '../core/documentary/types';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { screenKindOf } from '../core/screen/screen-kinds';

export type DocView =
  | { status: 'none' }
  // `possible` : vidéos de pertinence moins sûre, montrées seulement derrière un lien.
  // `chosenId` : la vidéo que l'utilisateur a choisie pour cette carte (elle est alors la première de `candidates`).
  | { status: 'detail'; subject: DocSubject; candidates: DocCandidate[]; possible: DocCandidate[]; chosenId: string | null }
  // `busy` : le relais n'a pas pu chercher (plafond du jour, panne) ; on redemandera plus tard.
  | { status: 'empty'; subject: DocSubject; busy: boolean; possible: DocCandidate[] }
  | { status: 'error'; message: string };

export type DocumentaryServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  subject: (slug: string) => Promise<SubjectInfo | null>;
  selection: { forQid(qid: string): Promise<DocCandidate[]> };
  commons: { search(names: string[], subject: Pick<DocSubject, 'qid' | 'kind' | 'startYear' | 'endYear'>): Promise<DocCandidate[]> };
  relay: { search(subject: DocSubject): Promise<RelayResult>; oembed(key: string): Promise<OembedResult> };
  repo: Pick<DocumentaryRepo, 'proposals' | 'addProposal' | 'flagged' | 'addFlag' | 'choice' | 'setChoice' | 'clearChoice'>;
  // null : pas de jeton GitHub (propositions gardées chez l'utilisateur seulement).
  issues: { send(draft: IssueDraft): Promise<AnomalyResult> } | null;
  cache: Pick<TtlCache, 'getOrLoad'>;
  platform: () => string;
  profileName: () => string | null;
};

export function createDocumentaryService(deps: DocumentaryServiceDeps) {
  const { collection, kinds, subject: subjectOf, selection, commons, relay, repo, issues, cache } = deps;

  // Un « jamais cherché » ne doit pas être confondu avec une panne : seule une réponse est mémorisée (le cache ne garde pas les exceptions).
  const cached = <T>(key: string, loader: () => Promise<T>): Promise<T> => cache.getOrLoad(key, loader);

  async function find(slug: string, subject: DocSubject): Promise<{ candidates: DocCandidate[]; possible: DocCandidate[]; busy: boolean }> {
    const curated = [...(await repo.proposals(slug)), ...(await cached(`doc-selection-v1-${subject.qid}`, () => selection.forQid(subject.qid)).catch(() => []))];
    if (curated.length > 0) return { candidates: curated, possible: [], busy: false };
    const archives = await cached(`doc-commons-v1-${subject.qid}`, () => commons.search(subject.names, subject)).catch((): DocCandidate[] => []);
    if (archives.length > 0) return { candidates: archives, possible: [], busy: false };
    try {
      const found = await cached(`doc-relay-v2-${subject.qid}`, async () => {
        const result = await relay.search(subject);
        if (result.status === 'busy') throw new Error('relais occupé');
        return { candidates: result.candidates, possible: result.possible };
      });
      return { ...found, busy: false };
    } catch {
      return { candidates: [], possible: [], busy: true };
    }
  }

  const draftInput = (slug: string, subject: DocSubject, cardTitle: string, key: string, videoTitle: string, channel: string) => ({
    qid: subject.qid, slug, cardTitle, key, videoTitle, channel, platform: deps.platform(), name: deps.profileName(),
  });

  return {
    // Ce que la fiche montre : rien (carte sans rapport), une liste de vidéos, une fiche vide (boutons de recherche) ou une erreur.
    async view(slug: string, _title: string): Promise<DocView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        const screen = screenKindOf(cardKinds);
        if (screen === 'film' || screen === 'series' || !mayBeHistory(cardKinds)) return { status: 'none' };
        const info = await cached(`doc-subject-v1-${slug}`, () => subjectOf(slug));
        if (!info) return { status: 'none' };
        const kind = historyKindOf(cardKinds, info.death);
        if (!kind) return { status: 'none' };
        const subject: DocSubject = { qid: info.qid, kind, names: info.names, startYear: kind === 'person' ? info.birth : info.start, endYear: kind === 'person' ? info.death : info.end };
        const hidden = new Set(await repo.flagged(slug));
        const { candidates, possible, busy } = await find(slug, subject);
        let shown = candidates.filter((candidate) => !hidden.has(candidate.id));
        let others = possible.filter((candidate) => !hidden.has(candidate.id));
        // Le choix de l'utilisateur passe avant tout, même s'il n'était qu'une vidéo « possible » ou si la recherche ne le renvoie plus.
        const chosen = await repo.choice(slug);
        if (chosen && !hidden.has(chosen.id)) {
          shown = [chosen, ...shown.filter((candidate) => candidate.id !== chosen.id)];
          others = others.filter((candidate) => candidate.id !== chosen.id);
        }
        return shown.length > 0
          ? { status: 'detail', subject, candidates: shown, possible: others, chosenId: chosen && !hidden.has(chosen.id) ? chosen.id : null }
          : { status: 'empty', subject, busy, possible: others };
      } catch {
        return { status: 'error', message: 'Le documentaire est indisponible pour le moment.' };
      }
    },

    // « Proposer un documentaire » : lien vérifié (existe, intégrable), gardé pour l'utilisateur tout de suite, signalé à GitHub si possible.
    async propose(slug: string, subject: DocSubject, cardTitle: string, link: string): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
      const key = parseYoutubeKey(link);
      if (!key) return { ok: false, error: 'Ce lien n’est pas une vidéo YouTube.' };
      const check = await relay.oembed(key).catch((): OembedResult => ({ ok: false, reason: 'busy' }));
      if (!check.ok) {
        const reasons = { 'not-found': 'Cette vidéo est introuvable.', 'not-embeddable': 'Cette vidéo ne peut pas être intégrée ailleurs que sur YouTube.', busy: 'Vérification impossible pour le moment, réessayez plus tard.' };
        return { ok: false, error: reasons[check.reason] };
      }
      await repo.addProposal(slug, { source: 'proposal', id: key, title: check.title, channel: check.channel, durationSec: null, language: null, description: '', url: `https://www.youtube.com/watch?v=${key}`, thumbUrl: `https://img.youtube.com/vi/${key}/hqdefault.jpg` });
      const sent = issues ? (await issues.send(buildProposalIssue(draftInput(slug, subject, cardTitle, key, check.title, check.channel)))).ok : false;
      return { ok: true, sent };
    },

    // « Choisir cette vidéo » : retenue pour la carte, chez l'utilisateur seulement ; elle sera la première à chaque ouverture.
    async choose(slug: string, candidate: DocCandidate): Promise<void> {
      await repo.setChoice(slug, candidate);
    },

    // « Revenir au choix automatique ».
    async clearChoice(slug: string): Promise<void> {
      await repo.clearChoice(slug);
    },

    // « Pas pertinent » : la vidéo disparaît de cette fiche chez l'utilisateur ; l'issue permet à l'auteur du projet de la retirer pour tous.
    async flag(slug: string, subject: DocSubject, cardTitle: string, candidate: DocCandidate): Promise<void> {
      await repo.addFlag(slug, candidate.id);
      if ((await repo.choice(slug))?.id === candidate.id) await repo.clearChoice(slug);
      if (issues) await issues.send(buildFlagIssue(draftInput(slug, subject, cardTitle, candidate.id, candidate.title, candidate.channel)));
    },
  };
}
export type DocumentaryService = ReturnType<typeof createDocumentaryService>;
