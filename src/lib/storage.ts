import type {
  Account,
  AppData,
  ChartRef,
  ContractConfig,
  JournalNote,
  Trade,
  TradingConfig,
} from '../types'
import { DEFAULT_CONFIG } from '../data/contracts'

const LOCAL_KEY = 'meridian.trader.v2'
export const DATA_VERSION = 4

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
  createdAt: isoToday(),
}

const EMPTY_CONFIG: TradingConfig = {
  contracts: DEFAULT_CONFIG.contracts.map((contract) => ({ ...contract })),
  sessions: [...DEFAULT_CONFIG.sessions],
  setups: [...DEFAULT_CONFIG.setups],
}

export const EMPTY_DATA: AppData = {
  version: DATA_VERSION,
  accounts: [DEFAULT_ACCOUNT],
  activeAccountId: DEFAULT_ACCOUNT.id,
  config: EMPTY_CONFIG,
  trades: [],
  notes: [],
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
    createdAt:
      typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : isoToday(),
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

function normalizeConfig(raw: unknown): TradingConfig {
  const obj = (raw ?? {}) as Partial<TradingConfig>
  const contracts = normalizeContracts(obj.contracts)
  const sessions = normalizeNames(obj.sessions)
  const setups = normalizeNames(obj.setups)
  return {
    contracts: contracts.length ? contracts : DEFAULT_CONFIG.contracts.map((item) => ({ ...item })),
    sessions: sessions.length ? sessions : [...DEFAULT_CONFIG.sessions],
    setups: setups.length ? setups : [...DEFAULT_CONFIG.setups],
  }
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
