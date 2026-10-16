// Tempo (BPM) de la piste en cours, pour régler la cadence des notes de musique. Rien n'est lu ni mesuré tant que `active` est faux
// (notes invisibles). La mesure est demandée une seule fois par piste (au changement d'`uri`), jamais à chaque rendu : une panne
// réseau n'est pas mémorisée par le service. Un résultat arrivé après un changement de piste n'est jamais rendu pour la nouvelle.
// `null` = tempo inconnu (pas encore mesuré, pas de service, mesure impossible) : l'appelant retombe sur 120 BPM.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getPlayerSource, getTempoService } from '../music-registry';

const noSubscribe = () => () => undefined;
const NONE = JSON.stringify(null);
const none = (): string => NONE;

export function useTrackTempo(active: boolean): number | null {
  const source = active ? getPlayerSource() : null;
  // Instantané primitif (uri, titre, artiste) : pas de rendu tant que la piste ne change pas.
  const snapshot = useSyncExternalStore(
    source ? source.subscribe : noSubscribe,
    source ? () => { const t = source.current().track; return JSON.stringify(t ? [t.uri, t.title, t.artist] : null); } : none,
  );
  const track = useMemo(() => {
    const t = JSON.parse(snapshot) as [string, string, string] | null;
    return t ? { uri: t[0], title: t[1], artist: t[2] } : null;
  }, [snapshot]);
  const uri = track?.uri ?? null;
  // Le résultat porte l'uri qu'il mesure : il ne vaut que pour cette piste.
  const [result, setResult] = useState<{ uri: string; bpm: number | null } | null>(null);

  useEffect(() => {
    if (!active || !track) return undefined;
    const service = getTempoService();
    if (!service) return undefined;
    let current = true;
    void service.tempo(track).then(
      (bpm) => { if (current) setResult({ uri: track.uri, bpm }); },
      () => { if (current) setResult({ uri: track.uri, bpm: null }); },
    );
    return () => { current = false; };
    // Une mesure par piste : titre et artiste de la même uri ne la relancent pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uri]);

  return active && result && uri !== null && result.uri === uri ? result.bpm : null;
}
