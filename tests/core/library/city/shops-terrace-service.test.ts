import { describe, expect, it } from 'vitest';
import { ACT_S, SIP_S, cupOnTable, guestPoseAt, guestService, waiterTasks, type ServedGuest } from '../../../../src/core/library/city/shops/terrace-service';

const guest = (key: string, sitAt = 1000, stay = 45 * 60, table = 0, seat: 0 | 1 = 0): ServedGuest => ({ key, table, seat, sitAt, leaveAt: sitAt + stay });

describe('service en terrasse (revue du 2026-10-13 : déroulé complet)', () => {
  it('servi, plusieurs gorgées, paie avant de partir ; la tasse reste jusqu’au débarrassage', () => {
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const s = guestService(guest(k), 9);
      expect(s.served).toBeGreaterThan(s.sitAt);
      expect(s.sips.length, k).toBeGreaterThanOrEqual(4);
      for (const t of s.sips) {
        expect(t).toBeGreaterThan(s.served + ACT_S.bring);
        expect(t + SIP_S).toBeLessThan(s.pay);
      }
      for (let i = 1; i < s.sips.length; i++) expect(s.sips[i]! - s.sips[i - 1]!).toBeGreaterThan(SIP_S);
      expect(s.pay).toBeLessThan(s.leaveAt);
      expect(s.clear).toBeGreaterThan(s.sips[s.sips.length - 1]! + SIP_S);
      // Pas de tasse avant d'être servi ; sur la table entre les gorgées ; encore là après le départ, jusqu'au débarrassage.
      expect(cupOnTable(s, s.served - 1)).toBe(false);
      expect(cupOnTable(s, s.served + ACT_S.bring)).toBe(true);
      if (s.clear > s.leaveAt) expect(cupOnTable(s, s.leaveAt + 5)).toBe(true);
      expect(cupOnTable(s, s.clear + ACT_S.clear)).toBe(false);
    }
  });
  it('gorgée : prendre la tasse, la porter à la bouche, la reposer ; en main seulement pendant la gorgée', () => {
    const s = guestService(guest('x'), 3);
    const at = s.sips[0]!;
    expect(guestPoseAt(s, at + 0.3, 'pay-card')).toEqual({ arms: 'take', cup: false });
    expect(guestPoseAt(s, at + 2, 'pay-card')).toEqual({ arms: 'taste', cup: true });
    expect(cupOnTable(s, at + 2)).toBe(false);
    expect(guestPoseAt(s, at + 3.9, 'pay-card')).toEqual({ arms: 'take', cup: false });
    expect(cupOnTable(s, at + SIP_S + 0.1)).toBe(true);
    // Paiement : carte ou billets tendus pendant que le serveur est à la table.
    expect(guestPoseAt(s, s.pay + 1, 'pay-cash').arms).toBe('pay-cash');
  });
  it('le serveur : apporter, encaisser, débarrasser pour chaque convive ; un collègue seulement si le serveur est déjà dehors', () => {
    const services = [guestService(guest('a', 1000), 1), guestService(guest('b', 1000, 45 * 60, 1), 1), guestService(guest('c', 1300, 45 * 60, 2), 1)];
    const tasks = waiterTasks(services);
    for (const s of services) {
      const own = tasks.filter((t) => t.key === s.key).map((t) => t.kind).sort();
      expect(own).toEqual(['bring', 'clear', 'pay']);
    }
    for (let i = 1; i < tasks.length; i++) expect(tasks[i]!.at).toBeGreaterThanOrEqual(tasks[i - 1]!.at);
    // Deux tâches du même employé ne se chevauchent jamais (aller, geste, retour).
    for (const staff of [0, 1] as const) {
      const own = tasks.filter((t) => t.staff === staff);
      for (let i = 1; i < own.length; i++) expect(own[i]!.at - 6).toBeGreaterThanOrEqual(own[i - 1]!.at + own[i - 1]!.act + 6 - 1e-6);
    }
  });
  it('déterministe (même clé, même déroulé)', () => {
    expect(guestService(guest('k'), 5)).toEqual(guestService(guest('k'), 5));
  });
});
