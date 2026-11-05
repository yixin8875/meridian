import type {
  Account,
  AppData,
  CashFlow,
  ChartRef,
  ChecklistItem,
  ContractConfig,
  DailyReview,
  Discipline,
  DisciplineItem,
  JournalNote,
  RiskConfig,
  SetupChecklist,
  Trade,
  TradingConfig,
} from '../types'
import {
  CASH_FLOW_KINDS,
  DEFAULT_CONFIG,
  DEFAULT_DISCIPLINE_ITEMS,
  DEFAULT_MISTAKE_TAGS,
  DEFAULT_RISK,
} from '../data/contracts'

const LOCAL_KEY = 'meridian.trader.v2'
export const DATA_VERSION = 7

function isoToday(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export const DEFAULT_ACCOUNT: Account = {
  id: 'acc_default',
  name: '私人账户',
  startingEquity: 100000,
  feePerContract: 2.5,
  risk: { ...DEFAULT_RISK },
  createdAt: isoToday(),
}

const EMPTY_CONFIG: TradingConfig = {
  contracts: DEFAULT_CONFIG.contracts.map((contract) => ({ ...contract })),
  sessions: [...DEFAULT_CONFIG.sessions],
  setups: [...DEFAULT_CONFIG.setups],
  disciplineItems: DEFAULT_CONFIG.disciplineItems.map((item) => ({ ...item })),
  mistakeTags: [...DEFAULT_CONFIG.mistakeTags],
  checklists: [],
}

export const EMPTY_DATA: AppData = {
  version: DATA_VERSION,
  accounts: [DEFAULT_ACCOUNT],
  activeAccountId: DEFAULT_ACCOUNT.id,
  config: EMPTY_CONFIG,
  trades: [],
  notes: [],
  dailyReviews: [],
  cashFlows: [],
}

export function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function normalizeAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<Account>
  if (typeof obj.id !== 'string' || !obj.id.trim()) return null
  return {
    id: obj.id,
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : '未命名账户',
    startingEquity:
      typeof obj.startingEquity === 'number' && obj.startingEquity > 0
        ? obj.startingEquity
        : DEFAULT_ACCOUNT.startingEquity,
    feePerContract:
      typeof obj.feePerContract === 'number' && obj.feePerContract >= 0
        ? obj.feePerContract
        : DEFAULT_ACCOUNT.feePerContract,
    risk: normalizeRisk(obj.risk),
    createdAt:
      typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : isoToday(),
  }
}

function normalizeRisk(raw: unknown): RiskConfig {
  const obj = (raw ?? {}) as Partial<RiskConfig>
  return {
    riskPerTradePct:
      typeof obj.riskPerTradePct === 'number' &&
      Number.isFinite(obj.riskPerTradePct) &&
      obj.riskPerTradePct > 0
        ? Math.min(100, obj.riskPerTradePct)
        : DEFAULT_RISK.riskPerTradePct,
    dailyLossLimit:
      typeof obj.dailyLossLimit === 'number' &&
      Number.isFinite(obj.dailyLossLimit) &&
      obj.dailyLossLimit >= 0
        ? obj.dailyLossLimit
        : DEFAULT_RISK.dailyLossLimit,
    maxConsecutiveLosses:
      typeof obj.maxConsecutiveLosses === 'number' &&
      Number.isFinite(obj.maxConsecutiveLosses) &&
      obj.maxConsecutiveLosses >= 0
        ? Math.round(obj.maxConsecutiveLosses)
        : DEFAULT_RISK.maxConsecutiveLosses,
  }
}

function normalizeContracts(raw: unknown): ContractConfig[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ContractConfig[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Partial<ContractConfig>
    const symbol = typeof obj.symbol === 'string' ? obj.symbol.trim() : ''
    if (!symbol || seen.has(symbol)) continue
    seen.add(symbol)
    const pointValue = typeof obj.pointValue === 'number' && obj.pointValue > 0 ? obj.pointValue : 1
    out.push({
      symbol,
      name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : symbol,
      pointValue,
    })
  }
  return out
}

function normalizeNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const value = entry.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function normalizeDisciplineItems(raw: unknown): DisciplineItem[] {
  if (!Array.isArray(raw)) return []
  const seenId = new Set<string>()
  const seenLabel = new Set<string>()
  const out: DisciplineItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Partial<DisciplineItem>
    const id = typeof obj.id === 'string' ? obj.id.trim() : ''
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    if (!id || !label || seenId.has(id) || seenLabel.has(label)) continue
    seenId.add(id)
    seenLabel.add(label)
    out.push({ id, label })
  }
  return out
}

function normalizeChecklistItems(raw: unknown, fallbackId: string): ChecklistItem[] {
  if (!Array.isArray(raw)) return []
  const seenId = new Set<string>()
  const seenLabel = new Set<string>()
  const out: ChecklistItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Partial<ChecklistItem>
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    const id =
      typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `${fallbackId}_${out.length + 1}`
    if (!label || seenId.has(id) || seenLabel.has(label)) continue
    seenId.add(id)
    seenLabel.add(label)
    out.push({ id, label })
  }
  return out
}

function normalizeChecklists(raw: unknown, setups: string[]): SetupChecklist[] {
  if (!Array.isArray(raw)) return []
  const knownSetups = new Set(setups)
  const seenId = new Set<string>()
  const seenSetup = new Set<string>()
  const out: SetupChecklist[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Partial<SetupChecklist>
    const setup = typeof obj.setup === 'string' ? obj.setup.trim() : ''
    if (!setup || !knownSetups.has(setup) || seenSetup.has(setup)) continue
    const id =
      typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `cl_${out.length + 1}`
    if (seenId.has(id)) continue
    const items = normalizeChecklistItems(obj.items, id)
    if (!items.length) continue
    seenId.add(id)
    seenSetup.add(setup)
    out.push({ id, setup, items })
  }
  return out
}

function normalizeConfig(raw: unknown): TradingConfig {
  const obj = (raw ?? {}) as Partial<TradingConfig>
  const contracts = normalizeContracts(obj.contracts)
  const sessions = normalizeNames(obj.sessions)
  const setups = normalizeNames(obj.setups)
  const finalSetups = setups.length ? setups : [...DEFAULT_CONFIG.setups]
  const disciplineItems = Array.isArray(obj.disciplineItems)
    ? normalizeDisciplineItems(obj.disciplineItems)
    : []
  const mistakeTags = Array.isArray(obj.mistakeTags) ? normalizeNames(obj.mistakeTags) : null
  return {
    contracts: contracts.length ? contracts : DEFAULT_CONFIG.contracts.map((item) => ({ ...item })),
    sessions: sessions.length ? sessions : [...DEFAULT_CONFIG.sessions],
    setups: finalSetups,
    disciplineItems: disciplineItems.length
      ? disciplineItems
      : DEFAULT_DISCIPLINE_ITEMS.map((item) => ({ ...item })),
    mistakeTags: mistakeTags ?? [...DEFAULT_MISTAKE_TAGS],
    checklists: normalizeChecklists(obj.checklists, finalSetups),
  }
}

function normalizeDiscipline(raw: unknown): Discipline {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Discipline = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}

function normalizeChecks(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue
    const ids = normalizeNames(value)
    if (ids.length) out[key] = ids
  }
  return out
}

function normalizeReviews(raw: unknown, accountIds: Set<string>): DailyReview[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: DailyReview[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Partial<DailyReview>
    if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) continue
    const accountId =
      typeof obj.accountId === 'string' && accountIds.has(obj.accountId)
        ? obj.accountId
        : [...accountIds][0]
    if (!accountId) continue
    const key = `${accountId}|${obj.date}`
    if (seen.has(key)) continue
    seen.add(key)
    const score =
      typeof obj.executionScore === 'number' && Number.isFinite(obj.executionScore)
        ? Math.min(100, Math.max(0, Math.round(obj.executionScore)))
        : 0
    out.push({
      id:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id
          : `dr_${accountId}_${obj.date}`,
      accountId,
      date: obj.date,
      marketContext: typeof obj.marketContext === 'string' ? obj.marketContext : '',
      plan: typeof obj.plan === 'string' ? obj.plan : '',
      executionScore: score,
      violations: normalizeNames(obj.violations),
      improvement: typeof obj.improvement === 'string' ? obj.improvement : '',
      checks: normalizeChecks(obj.checks),
      updatedAt:
        typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : new Date().toISOString(),
    })
  }
  return out
}

function normalizeCashFlows(raw: unknown, accountIds: Set<string>): CashFlow[] {
  if (!Array.isArray(raw)) return []
  const kinds = new Set(CASH_FLOW_KINDS.map((item) => item.key))
  const seen = new Set<string>()
  const out: CashFlow[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Partial<CashFlow>
    if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) continue
    if (typeof obj.amount !== 'number' || !Number.isFinite(obj.amount) || obj.amount <= 0) continue
    const accountId =
      typeof obj.accountId === 'string' && accountIds.has(obj.accountId)
        ? obj.accountId
        : [...accountIds][0]
    if (!accountId) continue
    const kind =
      typeof obj.kind === 'string' && kinds.has(obj.kind as CashFlow['kind'])
        ? (obj.kind as CashFlow['kind'])
        : 'deposit'
    const id =
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id
        : `cf_${accountId}_${obj.date}_${out.length}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      accountId,
      date: obj.date,
      kind,
      amount: Math.round(obj.amount * 100) / 100,
      note: typeof obj.note === 'string' ? obj.note : '',
    })
  }
  return out
}

function normalizeCharts(raw: unknown): ChartRef[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const obj = entry as Partial<ChartRef>
    if (typeof obj.id !== 'string' || !obj.id.trim()) return []
    return [
      {
        id: obj.id,
        name: typeof obj.name === 'string' && obj.name ? obj.name : 'K 线图.jpg',
        addedAt: typeof obj.addedAt === 'string' && obj.addedAt ? obj.addedAt : isoToday(),
        width: typeof obj.width === 'number' && obj.width > 0 ? obj.width : 0,
        height: typeof obj.height === 'number' && obj.height > 0 ? obj.height : 0,
      },
    ]
  })
}

/**
 * 兼容 0.2.x：旧文件是扁平的 accountName / startingEquity / feePerContract。
 * 读到旧数据时迁移成一个默认账户，并把没有归属的交易与笔记挂到该账户下。
 */
export function normalizeData(raw: unknown): AppData {
  const obj = (raw ?? {}) as Record<string, unknown> & Partial<AppData>

  let accounts = Array.isArray(obj.accounts)
    ? obj.accounts
        .map(normalizeAccount)
        .filter((account): account is Account => Boolean(account))
    : []

  if (!accounts.length) {
    const legacy = obj as Record<string, unknown>
    accounts = [
      {
        id: 'acc_default',
        name:
          typeof legacy.accountName === 'string' && legacy.accountName.trim()
            ? legacy.accountName
            : DEFAULT_ACCOUNT.name,
        startingEquity:
          typeof legacy.startingEquity === 'number' && legacy.startingEquity > 0
            ? legacy.startingEquity
            : DEFAULT_ACCOUNT.startingEquity,
        feePerContract:
          typeof legacy.feePerContract === 'number' && legacy.feePerContract >= 0
            ? legacy.feePerContract
            : DEFAULT_ACCOUNT.feePerContract,
        risk: { ...DEFAULT_RISK },
        createdAt: isoToday(),
      },
    ]
  }

  const ids = new Set(accounts.map((account) => account.id))
  const activeAccountId =
    typeof obj.activeAccountId === 'string' && ids.has(obj.activeAccountId)
      ? obj.activeAccountId
      : accounts[0]!.id

  const trades: Trade[] = Array.isArray(obj.trades)
    ? obj.trades
        .filter((trade): trade is Trade => Boolean(trade) && typeof trade === 'object')
        .map((trade) => ({
          ...trade,
          accountId:
            typeof trade.accountId === 'string' && ids.has(trade.accountId)
              ? trade.accountId
              : accounts[0]!.id,
          discipline: normalizeDiscipline(trade.discipline),
          mistakes: normalizeNames(trade.mistakes),
          charts: normalizeCharts(trade.charts),
        }))
    : []

  const notes: JournalNote[] = Array.isArray(obj.notes)
    ? obj.notes
        .filter((note): note is JournalNote => Boolean(note) && typeof note === 'object')
        .map((note) => ({
          ...note,
          accountId:
            typeof note.accountId === 'string' && ids.has(note.accountId)
              ? note.accountId
              : accounts[0]!.id,
          tags: Array.isArray(note.tags) ? note.tags : [],
        }))
    : []

  const config = normalizeConfig(obj.config)
  const dailyReviews = normalizeReviews(obj.dailyReviews, ids)
  const cashFlows = normalizeCashFlows(obj.cashFlows, ids)
  // 历史 CSV 或旧数据里可能有字典之外的合约，补进去，避免详情与表单无法识别。
  const known = new Set(config.contracts.map((contract) => contract.symbol))
  for (const trade of trades) {
    if (trade.symbol && !known.has(trade.symbol)) {
      known.add(trade.symbol)
      config.contracts.push({ symbol: trade.symbol, name: trade.symbol, pointValue: 1 })
    }
  }

  return {
    version: DATA_VERSION,
    accounts,
    activeAccountId,
    config,
    trades,
    notes,
    dailyReviews,
    cashFlows,
  }
}

export interface LoadResult {
  data: AppData | null
  path: string
  error: string | null
}

export async function loadState(): Promise<LoadResult> {
  if (hasTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const raw = await invoke<unknown | null>('load_state')
      let path = ''
      try {
        path = await invoke<string>('data_path')
      } catch {
        // 路径只用于设置页展示，失败不影响读取。
      }
      return { data: raw ? normalizeData(raw) : null, path, error: null }
    } catch (err) {
      return { data: null, path: '', error: String(err) }
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return {
      data: raw ? normalizeData(JSON.parse(raw)) : null,
      path: '浏览器本地存储 · 预览模式',
      error: null,
    }
  } catch (err) {
    return { data: null, path: '浏览器本地存储 · 预览模式', error: String(err) }
  }
}

export async function saveState(data: AppData): Promise<void> {
  if (hasTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('save_state', { state: data })
    return
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data))
}

export async function getStoragePath(): Promise<string> {
  if (!hasTauri()) return '浏览器本地存储 · 预览模式'
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('data_path')
  } catch {
    return ''
  }
}
