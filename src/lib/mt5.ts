import type {
  CashFlow,
  ContractConfig,
  Discipline,
  DisciplineItem,
  Side,
  Trade,
} from '../types'
import { gradeOf, sessionOf } from './csv'
import { uid } from './format'

/** MetaTrader5 Python 包返回的原始结构（只声明用到的字段）。 */
export interface Mt5Deal {
  ticket: number
  order: number
  time: number
  type: number
  entry: number
  position_id: number
  volume: number
  price: number
  commission: number
  swap: number
  profit: number
  fee?: number
  symbol: string
  comment?: string
}

export interface Mt5Order {
  ticket: number
  position_id: number
  time_setup: number
  type: number
  sl: number
  tp: number
  symbol: string
}

export interface Mt5Position {
  ticket: number
  volume: number
  price_open: number
  price_current: number
  sl: number
  tp: number
  profit: number
  symbol: string
  type: number
}

export interface Mt5Account {
  login: number
  server: string
  currency: string
  balance: number
  equity: number
  name?: string
  company?: string
}

export interface Mt5Payload {
  ok: boolean
  error?: string
  message?: string
  account?: Mt5Account | null
  deals?: Mt5Deal[]
  orders?: Mt5Order[]
  positions?: Mt5Position[]
}

export interface Mt5EnvResult {
  python: string | null
  python_version: string
  package: boolean
  package_version: string
  terminal: string | null
  /** 本机检测到的全部 terminal64.exe，按最近使用排序。 */
  terminals: string[]
  detail: string
}

export interface Mt5SyncRequest {
  from: string
  to: string
  terminal: string
  login: string
  server: string
  password: string
}

export async function fetchMt5Env(): Promise<Mt5EnvResult> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<Mt5EnvResult>('mt5_env')
}

export async function runMt5Sync(request: Mt5SyncRequest): Promise<Mt5Payload> {
  const { invoke } = await import('@tauri-apps/api/core')
  const payload = await invoke<Mt5Payload>('mt5_sync', { request })
  if (!payload.ok) throw new Error(payload.message || 'MT5 同步失败')
  return payload
}

export interface Mt5ConvertOptions {
  accountId: string
  contracts: ContractConfig[]
  symbolMap?: Record<string, string>
  /** 记录时间使用的时区偏移（分钟），例如本机 UTC+8 为 480。 */
  timeOffsetMinutes: number
  disciplineItems: DisciplineItem[]
  from: string
  to: string
}

export interface Mt5UnknownSymbol {
  symbol: string
  trades: number
  inferredPointValue: number
}

export interface Mt5ImportBundle {
  login: string
  server: string
  currency: string
  trades: Trade[]
  flows: CashFlow[]
  /** 应用里还没有的品种，点值由成交反推，导入时可自动创建合约。 */
  unknown: Mt5UnknownSymbol[]
  skipped: number
}

const round2 = (value: number) => Math.round(value * 100) / 100
const round4 = (value: number) => Math.round(value * 10000) / 10000

/** 成交时间是 UTC 秒；加上偏移后用 UTC getter 读出「记录时区」的墙上时间。 */
function wallClock(epochSeconds: number, offsetMinutes: number): { date: string; time: string } {
  const date = new Date((epochSeconds + offsetMinutes * 60) * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  }
}

/** 去掉券商常见的品种后缀：XAUUSD.m、US500.cash、EURUSD-raw… */
function stripSuffix(symbol: string): string {
  return symbol.replace(/[._-](m|cash|pro|ecn|raw|std|micro|mini|spot)$/i, '')
}

function resolveSymbol(
  raw: string,
  map: Record<string, string>,
  contracts: ContractConfig[],
): string {
  if (map[raw]) return map[raw]
  const lower = raw.toLowerCase()
  const exact =
    contracts.find((contract) => contract.symbol === raw) ??
    contracts.find((contract) => contract.symbol.toLowerCase() === lower)
  if (exact) return exact.symbol
  const base = stripSuffix(raw)
  if (base !== raw) {
    const viaBase = contracts.find(
      (contract) => contract.symbol.toLowerCase() === base.toLowerCase(),
    )
    if (viaBase) return viaBase.symbol
  }
  return base || raw
}

function weightedPrice(deals: Mt5Deal[]): number {
  let volume = 0
  let total = 0
  for (const deal of deals) {
    volume += deal.volume
    total += deal.price * deal.volume
  }
  return volume > 0 ? total / volume : 0
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

interface PositionRow {
  id: number
  rawSymbol: string
  side: Side
  qty: number
  entry: number
  exit: number
  gross: number
  fees: number
  entryEpoch: number
  exitEpoch: number
  open: boolean
  current: number
  stop: number
  target: number
  floating: number
  matchedVolume: number
}

/**
 * 把 MT5 成交按 position_id 聚合成一笔交易：
 * 入场/出场价按成交量加权，手续费 = 佣金 + 库存费 + 手续费。
 */
export function buildMt5Import(
  payload: Mt5Payload,
  options: Mt5ConvertOptions,
): Mt5ImportBundle {
  const offset = options.timeOffsetMinutes
  const map = options.symbolMap ?? {}
  const login = payload.account?.login != null ? String(payload.account.login) : ''
  const deals = payload.deals ?? []
  const orders = payload.orders ?? []
  const livePositions = payload.positions ?? []

  const groups = new Map<number, Mt5Deal[]>()
  for (const deal of deals) {
    if ((deal.type !== 0 && deal.type !== 1) || !deal.position_id) continue
    const list = groups.get(deal.position_id) ?? []
    list.push(deal)
    groups.set(deal.position_id, list)
  }

  const orderByPosition = new Map<number, Mt5Order>()
  for (const order of orders) {
    if (!order.position_id || (order.type !== 0 && order.type !== 1)) continue
    const current = orderByPosition.get(order.position_id)
    if (!current || order.time_setup < current.time_setup) {
      orderByPosition.set(order.position_id, order)
    }
  }
  const liveByPosition = new Map<number, Mt5Position>()
  for (const position of livePositions) liveByPosition.set(position.ticket, position)

  const rows: PositionRow[] = []
  let skipped = 0

  for (const [positionId, group] of groups) {
    const inDeals = group.filter((deal) => deal.entry === 0)
    const outDeals = group.filter((deal) => deal.entry >= 1)
    const qty = inDeals.reduce((sum, deal) => sum + deal.volume, 0)
    if (qty <= 0) {
      skipped += 1
      continue
    }
    const matchedVolume = outDeals.reduce((sum, deal) => sum + deal.volume, 0)
    const entry = weightedPrice(inDeals)
    const exit = outDeals.length ? weightedPrice(outDeals) : 0
    // MT5 返回的金额已经以账户币种计（美分账户即美分），这里按原值保存。
    const gross = outDeals.reduce((sum, deal) => sum + deal.profit, 0)
    const cost = group.reduce(
      (sum, deal) => sum + (deal.commission ?? 0) + (deal.swap ?? 0) + (deal.fee ?? 0),
      0,
    )
    const entryEpoch = Math.min(...inDeals.map((deal) => deal.time))
    const exitEpoch = outDeals.length ? Math.max(...outDeals.map((deal) => deal.time)) : 0
    const open = matchedVolume < qty - 1e-8 || !outDeals.length
    const live = liveByPosition.get(positionId)

    const entryWall = wallClock(entryEpoch, offset)
    const exitWall = exitEpoch ? wallClock(exitEpoch, offset) : null
    const inRange =
      (entryWall.date >= options.from && entryWall.date <= options.to) ||
      Boolean(exitWall && exitWall.date >= options.from && exitWall.date <= options.to)
    if (!inRange && !(open && entryWall.date <= options.to)) {
      skipped += 1
      continue
    }

    const first = inDeals[0] ?? group[0]!
    rows.push({
      id: positionId,
      rawSymbol: first.symbol || '',
      side: first.type === 0 ? 'L' : 'S',
      qty,
      entry,
      exit,
      gross,
      fees: -cost,
      entryEpoch,
      exitEpoch,
      open,
      current: open ? (live?.price_current ?? exit ?? entry) || entry : exit,
      stop: orderByPosition.get(positionId)?.sl || live?.sl || 0,
      target: orderByPosition.get(positionId)?.tp || live?.tp || 0,
      floating: live?.profit ?? 0,
      matchedVolume: matchedVolume || qty,
    })
  }

  const contractsBySymbol = new Map(
    options.contracts.map((contract) => [contract.symbol, contract]),
  )
  const inferred = new Map<string, number[]>()
  const resolution = new Map<number, string>()
  for (const row of rows) {
    const symbol = resolveSymbol(row.rawSymbol, map, options.contracts)
    resolution.set(row.id, symbol)
    if (contractsBySymbol.has(symbol)) continue
    const direction = row.side === 'L' ? 1 : -1
    const denominator = (row.exit - row.entry) * direction * row.matchedVolume
    if (Math.abs(denominator) < 1e-9) continue
    const value = row.gross / denominator
    if (Number.isFinite(value) && value > 0) {
      const list = inferred.get(symbol) ?? []
      list.push(value)
      inferred.set(symbol, list)
    }
  }

  const inferredPointValues = new Map<string, number>()
  for (const [symbol, values] of inferred) {
    inferredPointValues.set(symbol, Number(median(values).toPrecision(4)))
  }

  const pointValueOf = (symbol: string): number =>
    contractsBySymbol.get(symbol)?.pointValue ?? inferredPointValues.get(symbol) ?? 1

  const discipline: Discipline = {}
  for (const item of options.disciplineItems) discipline[item.id] = false

  const trades: Trade[] = rows.map((row) => {
    const symbol = resolution.get(row.id) ?? row.rawSymbol
    const entryWall = wallClock(row.entryEpoch, offset)
    const exitWall = row.exitEpoch ? wallClock(row.exitEpoch, offset) : null
    const pointValue = pointValueOf(symbol)
    const risk = row.stop > 0 ? Math.abs(row.entry - row.stop) * pointValue * row.qty : 0
    const rMultiple = risk > 0 ? row.gross / risk : 0
    return {
      id: uid('t'),
      accountId: options.accountId,
      date: entryWall.date,
      entryTime: entryWall.time,
      exitTime: row.open ? '' : (exitWall?.time ?? ''),
      symbol,
      side: row.side,
      qty: round4(row.qty),
      entry: row.entry,
      stop: row.stop,
      target: row.target,
      exit: row.open ? 0 : row.exit,
      current: row.current,
      pnl: round2(row.open ? row.floating : row.gross - row.fees),
      rMultiple: round2(rMultiple),
      fees: round2(row.fees),
      setup: '未分类',
      session: sessionOf(entryWall.time),
      status: row.open ? 'open' : 'closed',
      discipline: { ...discipline },
      mistakes: [],
      maeR: 0,
      mfeR: 0,
      note: '',
      grade: gradeOf(rMultiple),
      charts: [],
      externalId: `mt5:${login || 'local'}:position:${row.id}`,
      source: 'mt5',
    }
  })

  const flows: CashFlow[] = []
  for (const deal of deals) {
    if (deal.type !== 2 && deal.type !== 3) continue
    const amount = Math.abs(deal.profit)
    if (amount < 0.005) continue
    const wall = wallClock(deal.time, offset)
    if (wall.date < options.from || wall.date > options.to) continue
    flows.push({
      id: uid('cf'),
      accountId: options.accountId,
      date: wall.date,
      kind: deal.profit >= 0 ? 'deposit' : 'withdrawal',
      amount: round2(amount),
      note: deal.comment?.trim() || (deal.type === 3 ? 'MT5 信用' : 'MT5 资金变动'),
      externalId: `mt5:${login || 'local'}:deal:${deal.ticket}`,
    })
  }

  const counters = new Map<string, number>()
  for (const trade of trades) counters.set(trade.symbol, (counters.get(trade.symbol) ?? 0) + 1)
  const unknown: Mt5UnknownSymbol[] = []
  for (const [symbol, count] of counters) {
    if (contractsBySymbol.has(symbol)) continue
    unknown.push({
      symbol,
      trades: count,
      inferredPointValue: inferredPointValues.get(symbol) ?? 1,
    })
  }

  return {
    login,
    server: payload.account?.server ?? '',
    currency: payload.account?.currency ?? '',
    trades,
    flows,
    unknown,
    skipped,
  }
}
