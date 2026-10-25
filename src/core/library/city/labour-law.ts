// Contrôle du droit du travail (Code du travail), port de `verifierDroit` de la maquette « lever des habitants ».
// Toutes les durées sont en minutes.

export type Shift = readonly [number, number]

export const LAW = {
  dayMax: 600, noBreakMax: 360, breakMin: 20, spanMax: 660, splitSpanMax: 780,
  dailyRest: 660, weeklyRest: 2100, weekMax: 2880, paidLeaveMin: 25,
} as const

const hm = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`
const dayNumber = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000)
const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)
// 1970-01-01 (jour 0) est un jeudi.
const weekdayOf = (n: number) => (((n + 3) % 7) + 7) % 7 + 1
const mondayOf = (n: number) => n - (weekdayOf(n) - 1)

/** Vérifie une plage de jours consécutifs ; renvoie les erreurs en français (vide si tout va bien). */
export function checkLabourLaw(days: readonly { iso: string; shifts: readonly Shift[] }[], split: boolean, who: string): string[] {
  const errors: string[] = []
  if (!days.length) return errors
  const first = dayNumber(days[0].iso)
  const last = dayNumber(days[days.length - 1].iso)
  const weekTotals = new Map<number, number>()
  const worked: [number, number][] = [] // minutes absolues depuis le premier jour
  let prevEnd: number | null = null
  for (const day of days) {
    const n = dayNumber(day.iso)
    const sv = day.shifts
    if (!sv.length) continue
    const where = `${who} ${day.iso}`
    const eff = sv.reduce((t, [a, b]) => t + b - a, 0)
    const span = sv[sv.length - 1][1] - sv[0][0]
    if (eff > LAW.dayMax) errors.push(`${where} : ${hm(eff)} de travail effectif (> 10 h)`)
    for (const [a, b] of sv) if (b - a > LAW.noBreakMax) errors.push(`${where} : ${hm(b - a)} sans pause (> 6 h)`)
    for (let i = 1; i < sv.length; i++) if (sv[i][0] - sv[i - 1][1] < LAW.breakMin) errors.push(`${where} : pause < 20 min`)
    if (span > (split ? LAW.splitSpanMax : LAW.spanMax)) errors.push(`${where} : amplitude ${hm(span)}`)
    const abs = sv.map(([a, b]): [number, number] => [(n - first) * 1440 + a, (n - first) * 1440 + b])
    if (prevEnd !== null) {
      const rest = abs[0][0] - prevEnd
      if (rest < LAW.dailyRest) errors.push(`${where} : repos quotidien ${hm(rest)} (< 11 h)`)
    }
    prevEnd = abs[abs.length - 1]![1]
    worked.push(...abs)
    const w = mondayOf(n)
    weekTotals.set(w, (weekTotals.get(w) ?? 0) + eff)
  }
  for (const [w, total] of weekTotals) {
    if (total > LAW.weekMax) errors.push(`${who} : ${hm(total)} dans la semaine du ${isoOf(w)} (> 48 h)`)
  }
  // Repos hebdomadaire : pour chaque semaine ISO entière de la plage, plus long intervalle sans travail qui la touche
  // (les bornes de la plage comptent comme des repos).
  const bounds = [0, ...worked.flat(), (last - first + 1) * 1440]
  for (let w = mondayOf(first); w + 6 <= last; w += 7) {
    if (w < first) continue
    const from = (w - first) * 1440, to = from + 7 * 1440
    let best = 0
    for (let i = 0; i < bounds.length; i += 2) { const a = bounds[i]!, b = bounds[i + 1]!; if (b > from && a < to) best = Math.max(best, b - a) }
    if (best < LAW.weeklyRest) errors.push(`${who} : repos hebdomadaire ${hm(best)} (< 35 h) semaine du ${isoOf(w)}`)
  }
  return errors
}

/** Vérifie 25 jours de congés payés au moins et le nombre de RTT du contrat. */
export function checkPaidLeave(plan: ReadonlyMap<string, 'CP' | 'RTT'>, rtt: number, who: string): string[] {
  const errors: string[] = []
  let cp = 0, r = 0
  for (const v of plan.values()) v === 'CP' ? cp++ : r++
  if (cp < LAW.paidLeaveMin) errors.push(`${who} : ${cp} jours de congés payés dans l’année (< ${LAW.paidLeaveMin} jours ouvrés)`)
  if (r !== rtt) errors.push(`${who} : ${r} RTT au lieu de ${rtt} prévus au contrat`)
  return errors
}
