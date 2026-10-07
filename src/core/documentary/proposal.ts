// src/core/documentary/proposal.ts
export const PROPOSAL_LABEL = 'Proposition documentaire';
export const FLAG_LABEL = 'Documentaire non pertinent';

const KEY = /^[\w-]{11}$/;

// Clé de vidéo YouTube depuis un lien (watch, youtu.be, embed, shorts) ou la clé seule ; null sinon.
export function parseYoutubeKey(input: string): string | null {
  const text = input.trim();
  if (KEY.test(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  let key: string | null = null;
  if (host === 'youtu.be') key = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    key = url.searchParams.get('v') ?? (/^\/(?:embed|shorts)\/([\w-]{11})/.exec(url.pathname)?.[1] ?? null);
  }
  return key !== null && KEY.test(key) ? key : null;
}

export type ProposalInput = { qid: string; slug: string; cardTitle: string; key: string; videoTitle: string; channel: string; platform: string; name: string | null };

// Un « @pseudo » dans le texte notifierait un compte GitHub : on l'en empêche.
const defuse = (text: string): string => text.replace(/@/g, '@​');

function body(input: ProposalInput): string {
  const details = [
    `Carte : ${defuse(input.cardTitle)} (${input.slug})`,
    `Élément Wikidata : ${input.qid}`,
    `Vidéo : https://www.youtube.com/watch?v=${input.key}`,
    `Titre : ${defuse(input.videoTitle)}`,
    `Chaîne : ${defuse(input.channel)}`,
    `Plateforme : ${input.platform}`,
    `Signalé par : ${input.name ? defuse(input.name) : 'anonyme'}`,
  ];
  return details.map((line) => `- ${line}`).join('\n');
}

export const buildProposalIssue = (input: ProposalInput) => ({ title: `Documentaire proposé : ${defuse(input.cardTitle)}`, body: body(input), labels: [PROPOSAL_LABEL] });
export const buildFlagIssue = (input: ProposalInput) => ({ title: `Documentaire non pertinent : ${defuse(input.cardTitle)}`, body: body(input), labels: [FLAG_LABEL] });
