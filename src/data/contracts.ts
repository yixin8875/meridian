import type { ContractConfig, Discipline, Mood, NoteKind, TradingConfig } from '../types'

export interface Contract {
  symbol: string
  name: string
  pointValue: number
  tick: number
  base: number
  hint: string
}

export const CONTRACTS: Record<string, Contract> = {
  ES: { symbol: 'ES', name: 'E-mini S&P 500', pointValue: 50, tick: 0.25, base: 5820, hint: '$50 / 点' },
  MES: { symbol: 'MES', name: 'Micro E-mini S&P 500', pointValue: 5, tick: 0.25, base: 5820, hint: '$5 / 点' },
  NQ: { symbol: 'NQ', name: 'E-mini Nasdaq 100', pointValue: 20, tick: 0.25, base: 20750, hint: '$20 / 点' },
  MNQ: { symbol: 'MNQ', name: 'Micro E-mini Nasdaq 100', pointValue: 2, tick: 0.25, base: 20750, hint: '$2 / 点' },
  RTY: { symbol: 'RTY', name: 'E-mini Russell 2000', pointValue: 50, tick: 0.1, base: 2340, hint: '$50 / 点' },
  M2K: { symbol: 'M2K', name: 'Micro E-mini Russell 2000', pointValue: 5, tick: 0.1, base: 2340, hint: '$5 / 点' },
  CL: { symbol: 'CL', name: 'Crude Oil', pointValue: 1000, tick: 0.01, base: 61.8, hint: '$1,000 / 点' },
  MCL: { symbol: 'MCL', name: 'Micro Crude Oil', pointValue: 100, tick: 0.01, base: 61.8, hint: '$100 / 点' },
  GC: { symbol: 'GC', name: 'Gold', pointValue: 100, tick: 0.1, base: 3340, hint: '$100 / 点' },
  MGC: { symbol: 'MGC', name: 'Micro Gold', pointValue: 10, tick: 0.1, base: 3340, hint: '$10 / 点' },
}

export const SYMBOLS = Object.keys(CONTRACTS)

export const SETUPS = [
  '失败拍卖',
  '消息延续',
  '开盘区间突破',
  'VWAP 回踩',
  '流动性扫单',
  '趋势回撤',
  '区间反转',
  'FOMO 追单',
] as const

export const SESSIONS = ['早盘', '午盘', '尾盘'] as const

export const NOTE_KINDS: NoteKind[] = ['盘前', '盘中', '盘后', '周总结']

export const MOODS: Mood[] = ['平静', '专注', '焦躁', '疲惫']

export const DISCIPLINE_ITEMS: { key: keyof Discipline; label: string; short: string }[] = [
  { key: 'stopPlanned', label: '进场前已定义止损', short: '止损事先定义' },
  { key: 'stopHonored', label: '止损未被移动或取消', short: '止损未被移动' },
  { key: 'sizePlanned', label: '仓位符合计划风险', short: '仓位符合计划' },
  { key: 'journaled', label: '写下进场理由与复盘', short: '写下进场理由' },
]

/** 用户可管理的默认字典；读取旧数据或首次启动时使用。 */
export const DEFAULT_CONFIG: TradingConfig = {
  contracts: Object.values(CONTRACTS).map(({ symbol, name, pointValue }) => ({
    symbol,
    name,
    pointValue,
  })),
  sessions: [...SESSIONS],
  setups: [...SETUPS],
}

export function pointValueOf(symbol: string, contracts?: ContractConfig[]): number {
  const list = contracts ?? DEFAULT_CONFIG.contracts
  return list.find((contract) => contract.symbol === symbol)?.pointValue ?? 1
}

export function tickOf(symbol: string): number {
  return CONTRACTS[symbol]?.tick ?? 0.01
}
