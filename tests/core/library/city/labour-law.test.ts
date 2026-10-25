import { describe, expect, it } from 'vitest'
import { checkLabourLaw, checkPaidLeave, LAW, type Shift } from '../../../../src/core/library/city/labour-law'

// Lundi 2 → dimanche 8 novembre 2026.
const ISOS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
const week = (f: (i: number) => Shift[]) => ISOS.map((iso, i) => ({ iso, shifts: f(i) }))

describe('checkLabourLaw', () => {
  it('semaine type de Karim (39 h, 5 × [[480, 714], [744, 978]]) : aucune erreur', () => {
    const d = week((i) => (i < 5 ? [[480, 714], [744, 978]] : []))
    expect(checkLabourLaw(d, false, 'Karim')).toEqual([])
  })
  it('10 h 30 effectives → erreur « travail effectif »', () => {
    const d = week((i) => (i === 1 ? [[420, 720], [750, 1080]] : []))
    expect(checkLabourLaw(d, false, 'Karim').join('|')).toContain('travail effectif')
  })
  it('service de 6 h 30 → erreur « sans pause »', () => {
    const d = week((i) => (i === 1 ? [[480, 870]] : []))
    expect(checkLabourLaw(d, false, 'Karim').join('|')).toContain('sans pause')
  })
  it('pause de 15 min → erreur', () => {
    const d = week((i) => (i === 1 ? [[480, 720], [735, 900]] : []))
    expect(checkLabourLaw(d, false, 'Karim').join('|')).toContain('pause < 20')
  })
  it('amplitude 11 h 30 continue → erreur, 11 h 30 coupée → aucune', () => {
    const d = week((i) => (i === 1 ? [[480, 720], [750, 1170]] : []))
    expect(checkLabourLaw(d, false, 'X').join('|')).toContain('amplitude')
    const c = week((i) => (i === 1 ? [[480, 720], [960, 1170]] : []))
    expect(checkLabourLaw(c, true, 'X')).toEqual([])
  })
  it('fin 22 h 30 puis reprise 9 h → erreur repos quotidien', () => {
    const d = week((i) => (i === 1 ? [[1080, 1350]] : i === 2 ? [[540, 780]] : []))
    expect(checkLabourLaw(d, false, 'X').join('|')).toContain('repos quotidien')
  })
  it('Sarah HCR mardi → samedi : aucune erreur (repos dimanche + lundi à cheval sur deux semaines)', () => {
    const d = week((i) => (i >= 1 && i <= 5 ? [[660, 870], [1110, 1350]] : []))
    expect(checkLabourLaw(d, true, 'Sarah')).toEqual([])
    // Deux semaines de suite : le repos du dimanche + lundi suffit à chaque semaine.
    const two = [...d, ...['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].map((iso, i) => ({ iso, shifts: (i >= 1 && i <= 5 ? [[660, 870], [1110, 1350]] : []) as Shift[] }))]
    expect(checkLabourLaw(two, true, 'Sarah')).toEqual([])
  })
  it('six jours de 8 h 30 → erreur 48 h', () => {
    const d = week((i) => (i < 6 ? [[480, 720], [750, 1020]] : []))
    expect(checkLabourLaw(d, false, 'X').join('|')).toContain('48 h')
  })
  it('sept jours travaillés → erreur repos hebdomadaire', () => {
    const d = week(() => [[480, 720], [750, 900]])
    expect(checkLabourLaw(d, false, 'X').join('|')).toContain('repos hebdomadaire')
  })
  it('LAW porte les valeurs du plan', () => {
    expect(LAW.weekMax).toBe(2880)
    expect(LAW.weeklyRest).toBe(2100)
  })
})

describe('checkPaidLeave', () => {
  const plan = (cp: number, rtt: number) => {
    const m = new Map<string, 'CP' | 'RTT'>()
    for (let i = 0; i < cp; i++) m.set(`c${i}`, 'CP')
    for (let i = 0; i < rtt; i++) m.set(`r${i}`, 'RTT')
    return m
  }
  it('24 CP → erreur, 25 → aucune', () => {
    expect(checkPaidLeave(plan(24, 0), 0, 'X')).toHaveLength(1)
    expect(checkPaidLeave(plan(25, 0), 0, 'X')).toEqual([])
  })
  it('RTT différents du contrat → erreur', () => {
    expect(checkPaidLeave(plan(25, 10), 11, 'X')).toHaveLength(1)
    expect(checkPaidLeave(plan(25, 11), 11, 'X')).toEqual([])
  })
})
