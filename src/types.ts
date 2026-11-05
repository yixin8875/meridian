export type Side = 'L' | 'S'
export type TradeStatus = 'closed' | 'open'
export type Grade = 'A' | 'B' | 'C'
export type CashFlowKind = 'deposit' | 'withdrawal' | 'dividend'

/** 账户外部资金变动；金额始终为正，方向由 kind 决定。 */
export interface CashFlow {
  id: string
  accountId: string
  date: string
  kind: CashFlowKind
  amount: number
  note: string
}

/** 按账户设置的风险口径。 */
export interface RiskConfig {
  /** 单笔计划风险占账户权益的百分比，例如 0.8。 */
  riskPerTradePct: number
  /** 当日已实现亏损上限（USD）；0 表示不限制。 */
  dailyLossLimit: number
  /** 连续亏损达到多少笔后提示停止；0 表示不限制。 */
  maxConsecutiveLosses: number
}

/** 交易纪律的实际勾选结果，键为设置中的纪律项 id；旧数据保留四个默认键。 */
export type Discipline = Record<string, boolean>

/** 可在设置中维护的过程纪律项。id 稳定，改名不影响历史交易。 */
export interface DisciplineItem {
  id: string
  label: string
}

/** 按形态绑定的盘前检查项。 */
export interface ChecklistItem {
  id: string
  label: string
}

export interface SetupChecklist {
  id: string
  setup: string
  items: ChecklistItem[]
}

export type AnnotationTool = 'pen' | 'arrow' | 'rect' | 'text'

/** 相对图片左上角的坐标，0–1，随图片显示尺寸缩放。 */
export interface AnnotationPoint {
  x: number
  y: number
}

interface AnnotationBase {
  id: string
  color: string
}

export interface PenAnnotation extends AnnotationBase {
  type: 'pen'
  /** 线宽（显示像素）。 */
  width: number
  points: AnnotationPoint[]
}

export interface ShapeAnnotation extends AnnotationBase {
  type: 'arrow' | 'rect'
  width: number
  start: AnnotationPoint
  end: AnnotationPoint
}

export interface TextAnnotation extends AnnotationBase {
  type: 'text'
  text: string
  x: number
  y: number
  /** 字号（显示像素）。 */
  size: number
}

export type ChartAnnotation = PenAnnotation | ShapeAnnotation | TextAnnotation

/** 一张 K 线截图。文件本体存在应用数据目录的 charts/ 下，这里只存引用。 */
export interface ChartRef {
  id: string
  name: string
  addedAt: string
  width: number
  height: number
  /** 叠加在截图上的矢量标注，不修改原图。 */
  annotations: ChartAnnotation[]
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
  /** 交易级错误标签，例如追单、移动止损；空数组表示没有记录到明确错误。 */
  mistakes: string[]
  /** 最大不利偏移（R 倍数，≥0）；0 表示未记录。 */
  maeR: number
  /** 最大有利偏移（R 倍数，≥0）；0 表示未记录。 */
  mfeR: number
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

/** 每个交易日一份结构化复盘，与自由笔记并存。 */
export interface DailyReview {
  id: string
  accountId: string
  date: string
  marketContext: string
  plan: string
  executionScore: number
  violations: string[]
  improvement: string
  /** 盘前检查结果：清单 id → 已勾选的检查项 id。 */
  checks: Record<string, string[]>
  updatedAt: string
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
  disciplineItems: DisciplineItem[]
  mistakeTags: string[]
  checklists: SetupChecklist[]
}

/** 交易账户：起始权益与手续费都按账户独立计算。 */
export interface Account {
  id: string
  name: string
  startingEquity: number
  feePerContract: number
  risk: RiskConfig
  createdAt: string
}

export interface AppData {
  version: number
  accounts: Account[]
  activeAccountId: string
  config: TradingConfig
  trades: Trade[]
  notes: JournalNote[]
  dailyReviews: DailyReview[]
  cashFlows: CashFlow[]
}

export type Page = 'overview' | 'trades' | 'mirror' | 'notes' | 'settings'
export type Range = '1M' | '3M' | '6M' | 'YTD' | 'ALL'
export type ListFilter = 'all' | 'open' | 'closed'
