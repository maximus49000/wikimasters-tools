import { describe, expect, it } from 'vitest';
import { createTelemetry, type TelemetryDeps, type TelemetryScheduler } from '../../../src/core/telemetry/telemetry';

const ID = '123e4567-e89b-42d3-a456-426614174000';
type Sent = { platform: string; channel: string; version: string; events: { type: string; name: string; detail?: string; clientId?: string; fromVersion?: string }[] };

function setup(overrides: Partial<TelemetryDeps> = {}, saved: Record<string, string> = {}) {
  const data = new Map(Object.entries(saved));
  const sent: Sent[] = [];
  let clock = Date.UTC(2026, 9, 8, 10, 0, 0);
  const deps: TelemetryDeps = {
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    send: (body) => void sent.push(JSON.parse(body) as Sent),
    now: () => clock,
    newId: () => ID,
    platform: 'extension',
    channel: 'prod',
    version: '0.1.0+482',
    defaultEnabled: true,
    ...overrides,
  };
  const jobs: (() => void)[] = [];
  const hidden: (() => void)[] = [];
  const scheduler: TelemetryScheduler = { every: (run) => void jobs.push(run), onHide: (run) => void hidden.push(run) };
  return { telemetry: createTelemetry(deps), sent, data, jobs, hidden, scheduler, advanceDay: () => void (clock += 86400_000) };
}
const names = (sent: Sent[]) => sent.flatMap((b) => b.events.map((e) => e.name));

describe('track', () => {
  it('met en file puis envoie par lot avec l’identifiant d’installation', () => {
    const { telemetry, sent } = setup();
    telemetry.track('lecture-musique', 'spotify');
    telemetry.track('plein-ecran');
    expect(sent).toHaveLength(0);
    telemetry.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ platform: 'extension', channel: 'prod', version: '0.1.0+482' });
    expect(sent[0]!.events).toEqual([
      { type: 'action', name: 'lecture-musique', detail: 'spotify', clientId: ID },
      { type: 'action', name: 'plein-ecran', clientId: ID },
    ]);
  });
  it('envoie par lots de 50 au plus', () => {
    const { telemetry, sent } = setup();
    for (let i = 0; i < 120; i += 1) telemetry.track('plein-ecran');
    telemetry.flush();
    expect(sent.map((b) => b.events.length)).toEqual([50, 50, 20]);
  });
  it('réutilise l’identifiant mémorisé', () => {
    const { telemetry, sent } = setup({ newId: () => 'ne-doit-pas-servir' }, { 'wmt:clientId': ID });
    telemetry.track('plein-ecran');
    telemetry.flush();
    expect(sent[0]!.events[0]!.clientId).toBe(ID);
  });
});

describe('consentement', () => {
  it('désactivé : ni action ni active ni update, mais les erreurs partent sans identifiant', () => {
    const { telemetry, sent, scheduler } = setup({}, { 'wmt:usageStats': 'off', 'wmt:lastVersion': '0.1.0+400' });
    telemetry.start(scheduler);
    telemetry.track('plein-ecran');
    telemetry.reportError('api-429', 'spotify');
    telemetry.flush();
    expect(sent[0]!.events).toEqual([{ type: 'error', name: 'api-429', detail: 'spotify' }]);
  });
  it('couper la mesure vide les événements d’usage en attente mais garde les erreurs', () => {
    const { telemetry, sent } = setup();
    telemetry.track('plein-ecran');
    telemetry.reportError('js-erreur');
    telemetry.setEnabled(false);
    telemetry.flush();
    expect(names(sent)).toEqual(['js-erreur']);
  });
  it('le défaut vient de defaultEnabled, le choix de l’utilisateur le remplace', () => {
    expect(setup({ defaultEnabled: false }).telemetry.enabled()).toBe(false);
    const { telemetry, data } = setup({ defaultEnabled: false });
    telemetry.setEnabled(true);
    expect(data.get('wmt:usageStats')).toBe('on');
    expect(setup({ defaultEnabled: true }, { 'wmt:usageStats': 'off' }).telemetry.enabled()).toBe(false);
  });
  it('prévient les abonnés quand le réglage change', () => {
    const { telemetry } = setup();
    let calls = 0;
    telemetry.subscribe(() => (calls += 1));
    telemetry.setEnabled(false);
    telemetry.setEnabled(false);
    expect(calls).toBe(1);
  });
});

describe('start', () => {
  it('envoie un seul « jour-actif » par jour', () => {
    const { telemetry, sent, scheduler, advanceDay } = setup();
    telemetry.start(scheduler);
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).toEqual(['jour-actif']);
    advanceDay();
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).toEqual(['jour-actif', 'jour-actif']);
  });
  it('mise à jour : version génératrice → version ciblée, une fois', () => {
    const { telemetry, sent, scheduler, data } = setup({}, { 'wmt:lastVersion': '0.1.0+400' });
    telemetry.start(scheduler);
    telemetry.flush();
    const update = sent[0]!.events.find((e) => e.type === 'update')!;
    expect(update).toEqual({ type: 'update', name: 'maj-appliquee', clientId: ID, fromVersion: '0.1.0+400' });
    expect(sent[0]!.version).toBe('0.1.0+482');
    expect(data.get('wmt:lastVersion')).toBe('0.1.0+482');
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent).filter((n) => n === 'maj-appliquee')).toHaveLength(1);
  });
  it('premier lancement : pas de mise à jour', () => {
    const { telemetry, sent, scheduler } = setup();
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).toEqual(['jour-actif']);
  });
  it('mesure coupée : la version est tout de même mémorisée (pas de fausse mise à jour à la réactivation)', () => {
    const { telemetry, sent, scheduler, data } = setup({}, { 'wmt:usageStats': 'off', 'wmt:lastVersion': '0.1.0+400' });
    telemetry.start(scheduler);
    expect(data.get('wmt:lastVersion')).toBe('0.1.0+482');
    telemetry.setEnabled(true);
    telemetry.start(scheduler);
    telemetry.flush();
    expect(names(sent)).not.toContain('maj-appliquee');
  });
  it('planifie l’envoi périodique et à la fermeture', () => {
    const { telemetry, sent, scheduler, jobs, hidden } = setup();
    telemetry.start(scheduler);
    telemetry.track('plein-ecran');
    jobs[0]!();
    expect(names(sent)).toContain('plein-ecran');
    telemetry.track('plein-ecran');
    hidden[0]!();
    expect(names(sent).filter((n) => n === 'plein-ecran')).toHaveLength(2);
  });
});

describe('robustesse', () => {
  it('un stockage qui échoue ne casse rien', () => {
    const { telemetry } = setup({
      storage: {
        getItem: () => {
          throw new Error('x');
        },
        setItem: () => {
          throw new Error('x');
        },
      },
    });
    expect(() => {
      telemetry.track('plein-ecran');
      telemetry.setEnabled(false);
      telemetry.flush();
    }).not.toThrow();
  });
  it('plafonne les erreurs d’une session', () => {
    const { telemetry, sent } = setup();
    for (let i = 0; i < 100; i += 1) telemetry.reportError('js-erreur');
    telemetry.flush();
    expect(sent.flatMap((b) => b.events)).toHaveLength(30);
  });
});
