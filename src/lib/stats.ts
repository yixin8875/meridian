import type { Discipline, Range, Trade } from '../types'
import { minutesOf, shiftISO } from './format'

export interface EquityPoint {
  date: string
  equity: number
  pnl: number
  trades: number
}

export interface EquityPointView extends EquityPoint {
  mean: number
}

export interface Stats {
  count: number
  wins: number
  losses: number
  winRate: number
  netPnl: number
  netPct: number
  grossWin: number
  grossLoss: number
  profitFactor: number
  expectancyR: number
  avgWinR: number
  avgLossR: number
  maxDdPct: number
  maxDdAbs: number
  clean: number
  flagged: number
  execution: number
  bestR: number
  worstR: number
  avgHoldMin: number
}

export interface GroupStat {
  key: string
  count: number
  wins: number
  netPnl: number
  sumR: number
  avgR: number
  winRate: number
}

export interface RBucket {
  label: string
  count: number
  positive: boolean
}

export interface DisciplineRate {
  key: keyof Discipline
  pass: number
  count: number
}

export function sortTrades(a: Trade, b: Trade): number {
  const ka = `${a.date} ${a.entryTime}`
  const kb = `${b.date} ${b.entryTime}`
  return ka.localeCompare(kb)
}

export function closedTrades(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.status === 'closed').sort(sortTrades)
}

export function openTrades(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.status === 'open').sort(sortTrades)
}

export function buildEquity(trades: Trade[], startingEquity: number): EquityPoint[] {
  const closed = closedTrades(trades)
  if (!closed.length) {
    return [
      {
        date: shiftISO(new Date().toISOString().slice(0, 10), -1),
        equity: startingEquity,
        pnl: 0,
        trades: 0,
      },
    ]
  }
  const byDate = new Map<string, { pnl: number; count: number }>()
  for (const t of closed) {
    const cur = byDate.get(t.date) ?? { pnl: 0, count: 0 }
    cur.pnl += t.pnl
    cur.count += 1
    byDate.set(t.date, cur)
  }
  const points: EquityPoint[] = [
    { date: shiftISO(closed[0].date, -1), equity: startingEquity, pnl: 0, trades: 0 },
  ]
  let equity = startingEquity
  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!
    equity += day.pnl
    points.push({ date, equity: Math.round(equity * 100) / 100, pnl: day.pnl, trades: day.count })
  }
  return points
}

export function withMean(points: EquityPoint[], days = 30): EquityPointView[] {
  return points.map((p) => {
    const from = shiftISO(p.date, -days)
    let sum = 0
    let n = 0
    for (const q of points) {
      if (q.date >= from && q.date <= p.date) {
        sum += q.equity
        n += 1
      }
    }
    return { ...p, mean: n ? sum / n : p.equity }
  })
}

export function computeStats(trades: Trade[], startingEquity: number): Stats {
  const closed = closedTrades(trades)
  const count = closed.length
  let netPnl = 0
  let grossWin = 0
  let grossLoss = 0
  let wins = 0
  let losses = 0
  let sumR = 0
  let winR = 0
  let lossR = 0
  let clean = 0
  let flagged = 0
  let checks = 0
  let checksPassed = 0
  let holdSum = 0
  let holdN = 0
  let bestR = 0
  let worstR = 0

  for (const t of closed) {
    netPnl += t.pnl
    sumR += t.rMultiple
    bestR = Math.max(bestR, t.rMultiple)
    worstR = Math.min(worstR, t.rMultiple)
    if (t.pnl > 0) {
      wins += 1
      grossWin += t.pnl
      winR += t.rMultiple
    } else if (t.pnl < 0) {
      losses += 1
      grossLoss += Math.abs(t.pnl)
      lossR += t.rMultiple
    }
    const flags = Object.values(t.discipline) as boolean[]
    const passed = flags.filter(Boolean).length
    checks += flags.length
    checksPassed += passed
    if (passed === flags.length) clean += 1
    else flagged += 1
    const a = minutesOf(t.entryTime)
    const b = minutesOf(t.exitTime)
    if (a !== null && b !== null && b >= a) {
      holdSum += b - a
      holdN += 1
    }
  }

  const points = buildEquity(closed, startingEquity)
  let peak = points[0]?.equity ?? startingEquity
  let maxDdAbs = 0
  let maxDdPct = 0
  for (const p of points) {
    peak = Math.max(peak, p.equity)
    const abs = peak - p.equity
    if (abs > maxDdAbs) {
      maxDdAbs = abs
      maxDdPct = peak > 0 ? (abs / peak) * 100 : 0
    }
  }

  return {
    count,
    wins,
    losses,
    winRate: count ? (wins / count) * 100 : 0,
    netPnl: Math.round(netPnl * 100) / 100,
    netPct: startingEquity ? (netPnl / startingEquity) * 100 : 0,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    expectancyR: count ? sumR / count : 0,
    avgWinR: wins ? winR / wins : 0,
    avgLossR: losses ? lossR / losses : 0,
    maxDdPct,
    maxDdAbs,
    clean,
    flagged,
    execution: checks ? (checksPassed / checks) * 100 : 0,
    bestR,
    worstR,
    avgHoldMin: holdN ? holdSum / holdN : 0,
  }
}

export function filterRange<T extends EquityPoint>(points: T[], range: Range): T[] {
  if (range === 'ALL' || points.length < 2) return points
  const last = points[points.length - 1].date
  let from = ''
  if (range === '1M') from = shiftISO(last, -30)
  else if (range === '3M') from = shiftISO(last, -92)
  else if (range === '6M') from = shiftISO(last, -183)
  else from = `${last.slice(0, 4)}-01-01`
  const idx = points.findIndex((p) => p.date >= from)
  if (idx < 0) return points
  return points.slice(Math.max(0, idx - 1))
}

export function groupTrades(trades: Trade[], keyOf: (t: Trade) => string): GroupStat[] {
  const map = new Map<string, GroupStat>()
  for (const t of closedTrades(trades)) {
    const key = keyOf(t)
    const g = map.get(key) ?? {
      key,
      count: 0,
      wins: 0,
      netPnl: 0,
      sumR: 0,
      avgR: 0,
      winRate: 0,
    }
    g.count += 1
    g.netPnl += t.pnl
    g.sumR += t.rMultiple
    if (t.pnl > 0) g.wins += 1
    map.set(key, g)
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      netPnl: Math.round(g.netPnl * 100) / 100,
      avgR: g.count ? g.sumR / g.count : 0,
      winRate: g.count ? (g.wins / g.count) * 100 : 0,
    }))
    .sort((a, b) => b.sumR - a.sumR)
}

export function rHistogram(trades: Trade[]): RBucket[] {
  const buckets: RBucket[] = [
    { label: '< −2', count: 0, positive: false },
    { label: '−2 ~ −1', count: 0, positive: false },
    { label: '−1 ~ 0', count: 0, positive: false },
    { label: '0 ~ 1', count: 0, positive: true },
    { label: '1 ~ 2', count: 0, positive: true },
    { label: '2 ~ 3', count: 0, positive: true },
    { label: '> 3', count: 0, positive: true },
  ]
  for (const t of closedTrades(trades)) {
    const r = t.rMultiple
    let i = 0
    if (r < -2) i = 0
    else if (r < -1) i = 1
    else if (r < 0) i = 2
    else if (r < 1) i = 3
    else if (r < 2) i = 4
    else if (r < 3) i = 5
    else i = 6
    buckets[i].count += 1
  }
  return buckets
}

export function disciplineRates(trades: Trade[]): DisciplineRate[] {
  const closed = closedTrades(trades)
  const keys: (keyof Discipline)[] = ['stopPlanned', 'stopHonored', 'sizePlanned', 'journaled']
  return keys.map((key) => {
    const pass = closed.filter((t) => t.discipline[key]).length
    return { key, count: closed.length, pass: closed.length ? (pass / closed.length) * 100 : 0 }
  })
}

export function weekStats(trades: Trade[]): GroupStat[] {
  const labels = ['周一', '周二', '周三', '周四', '周五']
  const groups = groupTrades(trades, (t) => {
    const d = new Date(`${t.date}T00:00:00`).getDay()
    return labels[d - 1] ?? '其他'
  })
  return labels.map(
    (label) =>
      groups.find((g) => g.key === label) ?? {
        key: label,
        count: 0,
        wins: 0,
        netPnl: 0,
        sumR: 0,
        avgR: 0,
        winRate: 0,
      },
  )
}
