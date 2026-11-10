import type { CashFlow, DisciplineItem, Range, RiskConfig, Side, Trade } from '../types'
import { minutesOf, shiftISO, todayISO } from './format'

export interface EquityPoint {
  date: string
  /** 当日结束时的账户权益，包含出入金。 */
  equity: number
  /** 当日已平仓交易的净盈亏。 */
  pnl: number
  trades: number
  /** 当日净外部资金变动：入金 / 分红为正，出金为负。 */
  flow: number
  /** 截至当日的累计净外部资金变动。 */
  netFlow: number
  /** 起始权益 + 累计交易盈亏，剔除出入金，用于回撤与交易收益。 */
  tradingEquity: number
  /** 资金加权链式收益因子，从 1 开始。 */
  twr: number
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
  key: string
  label: string
  pass: number
  count: number
}

export interface MistakeTagCost {
  key: string
  count: number
  netPnl: number
  avgR: number
  winRate: number
}

export interface MistakeSummary {
  tagged: number
  clean: number
  taggedNetPnl: number
  cleanNetPnl: number
  taggedAvgR: number
  cleanAvgR: number
  tags: MistakeTagCost[]
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

export function flowSign(kind: CashFlow['kind']): 1 | -1 {
  return kind === 'withdrawal' ? -1 : 1
}

export interface CashFlowSummary {
  deposits: number
  withdrawals: number
  dividends: number
  net: number
}

export function cashFlowSummary(flows: CashFlow[]): CashFlowSummary {
  let deposits = 0
  let withdrawals = 0
  let dividends = 0
  for (const flow of flows) {
    if (flow.kind === 'deposit') deposits += flow.amount
    else if (flow.kind === 'withdrawal') withdrawals += flow.amount
    else dividends += flow.amount
  }
  return {
    deposits: Math.round(deposits * 100) / 100,
    withdrawals: Math.round(withdrawals * 100) / 100,
    dividends: Math.round(dividends * 100) / 100,
    net: Math.round((deposits + dividends - withdrawals) * 100) / 100,
  }
}

export function buildEquity(
  trades: Trade[],
  startingEquity: number,
  cashFlows: CashFlow[] = [],
): EquityPoint[] {
  const closed = closedTrades(trades)
  const byDate = new Map<string, { pnl: number; count: number; flow: number }>()
  for (const t of closed) {
    const cur = byDate.get(t.date) ?? { pnl: 0, count: 0, flow: 0 }
    cur.pnl += t.pnl
    cur.count += 1
    byDate.set(t.date, cur)
  }
  for (const flow of cashFlows) {
    const cur = byDate.get(flow.date) ?? { pnl: 0, count: 0, flow: 0 }
    cur.flow += flow.amount * flowSign(flow.kind)
    byDate.set(flow.date, cur)
  }

  if (!byDate.size) {
    return [
      {
        date: shiftISO(todayISO(), -1),
        equity: startingEquity,
        pnl: 0,
        trades: 0,
        flow: 0,
        netFlow: 0,
        tradingEquity: startingEquity,
        twr: 1,
      },
    ]
  }

  const firstDate = [...byDate.keys()].sort()[0]!
  const points: EquityPoint[] = [
    {
      date: shiftISO(firstDate, -1),
      equity: startingEquity,
      pnl: 0,
      trades: 0,
      flow: 0,
      netFlow: 0,
      tradingEquity: startingEquity,
      twr: 1,
    },
  ]
  let equity = startingEquity
  let tradingEquity = startingEquity
  let netFlow = 0
  let twr = 1
  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!
    const base = equity + day.flow
    if (base > 0 && day.pnl !== 0) twr *= 1 + day.pnl / base
    equity = base + day.pnl
    tradingEquity += day.pnl
    netFlow += day.flow
    points.push({
      date,
      equity: Math.round(equity * 100) / 100,
      pnl: Math.round(day.pnl * 100) / 100,
      trades: day.count,
      flow: Math.round(day.flow * 100) / 100,
      netFlow: Math.round(netFlow * 100) / 100,
      tradingEquity: Math.round(tradingEquity * 100) / 100,
      twr,
    })
  }
  return points
}

export function currentEquity(
  trades: Trade[],
  startingEquity: number,
  cashFlows: CashFlow[] = [],
): number {
  const points = buildEquity(trades, startingEquity, cashFlows)
  return points[points.length - 1]?.equity ?? startingEquity
}

export function rangeReturnPct(points: EquityPoint[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last || first.twr <= 0) return 0
  return (last.twr / first.twr - 1) * 100
}

export interface RiskStatus {
  todayPnl: number
  dailyLimit: number
  dailyLimitHit: boolean
  losingStreak: number
  streakLimit: number
  streakHit: boolean
}

export function riskStatus(
  trades: Trade[],
  risk: RiskConfig,
  today = todayISO(),
): RiskStatus {
  const closed = closedTrades(trades)
  const todayPnl = closed
    .filter((trade) => trade.date === today)
    .reduce((sum, trade) => sum + trade.pnl, 0)
  let losingStreak = 0
  for (let i = closed.length - 1; i >= 0; i -= 1) {
    if (closed[i]!.pnl < 0) losingStreak += 1
    else break
  }
  const dailyLimit = risk.dailyLossLimit
  const streakLimit = risk.maxConsecutiveLosses
  return {
    todayPnl: Math.round(todayPnl * 100) / 100,
    dailyLimit,
    dailyLimitHit: dailyLimit > 0 && todayPnl <= -dailyLimit,
    losingStreak,
    streakLimit,
    streakHit: streakLimit > 0 && losingStreak >= streakLimit,
  }
}

export function suggestedQty(
  equity: number,
  riskPerTradePct: number,
  entry: number,
  stop: number,
  pointValue: number,
  decimals = 0,
): number {
  const riskPerUnit = Math.abs(entry - stop) * pointValue
  const budget = equity * (riskPerTradePct / 100)
  if (riskPerUnit <= 0 || budget <= 0) return 0
  const factor = 10 ** decimals
  return Math.max(0, Math.floor((budget / riskPerUnit) * factor) / factor)
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

export function computeStats(
  trades: Trade[],
  startingEquity: number,
  cashFlows: CashFlow[] = [],
): Stats {
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

  const points = buildEquity(closed, startingEquity, cashFlows)
  let peak = points[0]?.tradingEquity ?? startingEquity
  let maxDdAbs = 0
  let maxDdPct = 0
  for (const p of points) {
    peak = Math.max(peak, p.tradingEquity)
    const abs = peak - p.tradingEquity
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
    netPct: ((points[points.length - 1]?.twr ?? 1) - 1) * 100,
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

/**
 * 按设置中的纪律项统计通过率。只统计实际勾选过该项的交易，
 * 这样后来新增的纪律项不会被旧交易误判为未通过。
 */
export function disciplineRates(
  trades: Trade[],
  items: DisciplineItem[],
): DisciplineRate[] {
  const closed = closedTrades(trades)
  return items.map((item) => {
    const applicable = closed.filter(
      (trade) => typeof trade.discipline[item.id] === 'boolean',
    )
    const pass = applicable.filter((trade) => trade.discipline[item.id]).length
    return {
      key: item.id,
      label: item.label,
      count: applicable.length,
      pass: applicable.length ? (pass / applicable.length) * 100 : 0,
    }
  })
}

/** 错误标签的成本：有标签 vs 无标签，以及每个标签的净盈亏与平均 R。 */
export function mistakeCost(trades: Trade[]): MistakeSummary {
  const closed = closedTrades(trades)
  const tagged = closed.filter((trade) => (trade.mistakes?.length ?? 0) > 0)
  const clean = closed.filter((trade) => !(trade.mistakes?.length ?? 0))
  const sum = (items: Trade[]) => ({
    pnl: items.reduce((acc, trade) => acc + trade.pnl, 0),
    r: items.reduce((acc, trade) => acc + trade.rMultiple, 0),
  })
  const taggedSum = sum(tagged)
  const cleanSum = sum(clean)
  const map = new Map<string, { count: number; pnl: number; r: number; wins: number }>()
  for (const trade of tagged) {
    for (const tag of new Set(trade.mistakes)) {
      const entry = map.get(tag) ?? { count: 0, pnl: 0, r: 0, wins: 0 }
      entry.count += 1
      entry.pnl += trade.pnl
      entry.r += trade.rMultiple
      if (trade.pnl > 0) entry.wins += 1
      map.set(tag, entry)
    }
  }
  return {
    tagged: tagged.length,
    clean: clean.length,
    taggedNetPnl: Math.round(taggedSum.pnl * 100) / 100,
    cleanNetPnl: Math.round(cleanSum.pnl * 100) / 100,
    taggedAvgR: tagged.length ? taggedSum.r / tagged.length : 0,
    cleanAvgR: clean.length ? cleanSum.r / clean.length : 0,
    tags: [...map.entries()]
      .map(([key, entry]) => ({
        key,
        count: entry.count,
        netPnl: Math.round(entry.pnl * 100) / 100,
        avgR: entry.count ? entry.r / entry.count : 0,
        winRate: entry.count ? (entry.wins / entry.count) * 100 : 0,
      }))
      .sort((a, b) => a.avgR - b.avgR),
  }
}

export interface SideStat {
  key: Side
  label: string
  count: number
  wins: number
  winRate: number
  netPnl: number
  avgR: number
}

/** 多空方向的胜率、净盈亏与平均 R。 */
export function sideStats(trades: Trade[]): SideStat[] {
  const closed = closedTrades(trades)
  return (['L', 'S'] as const).map((side) => {
    const items = closed.filter((trade) => trade.side === side)
    const wins = items.filter((trade) => trade.pnl > 0).length
    const netPnl = items.reduce((sum, trade) => sum + trade.pnl, 0)
    const sumR = items.reduce((sum, trade) => sum + trade.rMultiple, 0)
    return {
      key: side,
      label: side === 'L' ? '做多' : '做空',
      count: items.length,
      wins,
      winRate: items.length ? (wins / items.length) * 100 : 0,
      netPnl: Math.round(netPnl * 100) / 100,
      avgR: items.length ? sumR / items.length : 0,
    }
  })
}

/** 按入场小时聚合；key 形如「09:00–10:00」。 */
export function hourStats(trades: Trade[]): GroupStat[] {
  const map = new Map<number, { count: number; wins: number; pnl: number; sumR: number }>()
  for (const trade of closedTrades(trades)) {
    const minutes = minutesOf(trade.entryTime)
    if (minutes === null) continue
    const hour = Math.floor(minutes / 60)
    const entry = map.get(hour) ?? { count: 0, wins: 0, pnl: 0, sumR: 0 }
    entry.count += 1
    entry.pnl += trade.pnl
    entry.sumR += trade.rMultiple
    if (trade.pnl > 0) entry.wins += 1
    map.set(hour, entry)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, entry]) => {
      const label = `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`
      return {
        key: label,
        count: entry.count,
        wins: entry.wins,
        netPnl: Math.round(entry.pnl * 100) / 100,
        sumR: entry.sumR,
        avgR: entry.count ? entry.sumR / entry.count : 0,
        winRate: entry.count ? (entry.wins / entry.count) * 100 : 0,
      }
    })
}

export interface StreakStats {
  maxWins: number
  maxLosses: number
  currentWins: number
  currentLosses: number
}

/** 按平仓顺序统计连续盈利 / 连续亏损。 */
export function streakStats(trades: Trade[]): StreakStats {
  let maxWins = 0
  let maxLosses = 0
  let wins = 0
  let losses = 0
  for (const trade of closedTrades(trades)) {
    if (trade.pnl > 0) {
      wins += 1
      losses = 0
      maxWins = Math.max(maxWins, wins)
    } else if (trade.pnl < 0) {
      losses += 1
      wins = 0
      maxLosses = Math.max(maxLosses, losses)
    } else {
      wins = 0
      losses = 0
    }
  }
  return { maxWins, maxLosses, currentWins: wins, currentLosses: losses }
}

export interface DrawdownDuration {
  /** 最长一次峰值到恢复的日历天数。 */
  maxDays: number
  maxPeak: string
  maxTrough: string
  maxRecovery: string | null
  /** 截至最后一个点仍未恢复的回撤天数。 */
  currentDays: number
  currentPeak: string
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/** 用剔除出入金的交易权益计算回撤持续时间。 */
export function drawdownDuration(points: EquityPoint[]): DrawdownDuration {
  if (points.length < 2) {
    return {
      maxDays: 0,
      maxPeak: '',
      maxTrough: '',
      maxRecovery: null,
      currentDays: 0,
      currentPeak: points[0]?.date ?? '',
    }
  }
  let peakValue = points[0]!.tradingEquity
  let peakDate = points[0]!.date
  let inDrawdown = false
  let startPeak = peakDate
  let troughValue = peakValue
  let troughDate = peakDate
  let best: DrawdownDuration = {
    maxDays: 0,
    maxPeak: '',
    maxTrough: '',
    maxRecovery: null,
    currentDays: 0,
    currentPeak: peakDate,
  }
  for (const point of points.slice(1)) {
    if (point.tradingEquity >= peakValue) {
      if (inDrawdown) {
        const days = daysBetween(startPeak, point.date)
        if (days > best.maxDays) {
          best = {
            ...best,
            maxDays: days,
            maxPeak: startPeak,
            maxTrough: troughDate,
            maxRecovery: point.date,
          }
        }
        inDrawdown = false
      }
      peakValue = point.tradingEquity
      peakDate = point.date
      troughValue = peakValue
      troughDate = peakDate
    } else {
      if (!inDrawdown) {
        inDrawdown = true
        startPeak = peakDate
        troughValue = point.tradingEquity
        troughDate = point.date
      } else if (point.tradingEquity < troughValue) {
        troughValue = point.tradingEquity
        troughDate = point.date
      }
    }
  }
  if (inDrawdown) {
    const days = daysBetween(startPeak, points[points.length - 1]!.date)
    if (days > best.maxDays) {
      best = {
        ...best,
        maxDays: days,
        maxPeak: startPeak,
        maxTrough: troughDate,
        maxRecovery: null,
      }
    }
    best = { ...best, currentDays: days, currentPeak: startPeak }
  }
  return best
}

export interface ExcursionStats {
  count: number
  avgMaeR: number
  avgMfeR: number
  winMaeR: number
  lossMaeR: number
  /** 已实现 R ÷ MFE R 的平均捕获率（%）。 */
  capture: number
}

/** MAE / MFE 只统计填写了对应字段的已平仓交易。 */
export function excursionStats(trades: Trade[]): ExcursionStats {
  const closed = closedTrades(trades)
  const withMae = closed.filter((trade) => (trade.maeR ?? 0) > 0)
  const withMfe = closed.filter((trade) => (trade.mfeR ?? 0) > 0)
  const avg = (items: Trade[], pick: (trade: Trade) => number) =>
    items.length ? items.reduce((sum, trade) => sum + pick(trade), 0) / items.length : 0
  const mfeSum = withMfe.reduce((sum, trade) => sum + trade.mfeR, 0)
  const realized = withMfe.reduce((sum, trade) => sum + trade.rMultiple, 0)
  return {
    count: closed.filter((trade) => (trade.maeR ?? 0) > 0 || (trade.mfeR ?? 0) > 0).length,
    avgMaeR: avg(withMae, (trade) => trade.maeR),
    avgMfeR: avg(withMfe, (trade) => trade.mfeR),
    winMaeR: avg(
      withMae.filter((trade) => trade.pnl > 0),
      (trade) => trade.maeR,
    ),
    lossMaeR: avg(
      withMae.filter((trade) => trade.pnl < 0),
      (trade) => trade.maeR,
    ),
    capture: mfeSum > 0 ? (realized / mfeSum) * 100 : 0,
  }
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
