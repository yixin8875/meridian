export type Side = 'L' | 'S'
export type TradeStatus = 'closed' | 'open'
export type Grade = 'A' | 'B' | 'C'

export interface Discipline {
  stopPlanned: boolean
  stopHonored: boolean
  sizePlanned: boolean
  journaled: boolean
}

/** 一张 K 线截图。文件本体存在应用数据目录的 charts/ 下，这里只存引用。 */
export interface ChartRef {
  id: string
  name: string
  addedAt: string
  width: number
  height: number
}

export interface Trade {
  id: string
  accountId: string
  date: string
  entryTime: string
  exitTime: string
  symbol: string
  side: Side
  qty: number
  entry: number
  stop: number
  target: number
  exit: number
  current: number
  pnl: number
  rMultiple: number
  fees: number
  setup: string
  session: string
  status: TradeStatus
  discipline: Discipline
  note: string
  grade: Grade
  charts: ChartRef[]
}

export type NoteKind = '盘前' | '盘中' | '盘后' | '周总结'
export type Mood = '平静' | '专注' | '焦躁' | '疲惫'

export interface JournalNote {
  id: string
  accountId: string
  date: string
  kind: NoteKind
  title: string
  body: string
  tags: string[]
  mood: Mood
}

/** 可管理的合约：点值用于计算盈亏与 R。 */
export interface ContractConfig {
  symbol: string
  name: string
  pointValue: number
}

/** 账户之外、全应用共享的交易字典。 */
export interface TradingConfig {
  contracts: ContractConfig[]
  sessions: string[]
  setups: string[]
}

/** 交易账户：起始权益与手续费都按账户独立计算。 */
export interface Account {
  id: string
  name: string
  startingEquity: number
  feePerContract: number
  createdAt: string
}

export interface AppData {
  version: number
  accounts: Account[]
  activeAccountId: string
  config: TradingConfig
  trades: Trade[]
  notes: JournalNote[]
}

export type Page = 'overview' | 'trades' | 'mirror' | 'notes' | 'settings'
export type Range = '1M' | '3M' | '6M' | 'YTD' | 'ALL'
export type ListFilter = 'all' | 'open' | 'closed'
