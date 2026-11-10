import type { ContractConfig, Discipline, DisciplineItem, Grade, Side, Trade } from '../types'
import { DEFAULT_CONFIG, DEFAULT_DISCIPLINE_ITEMS } from '../data/contracts'
import { minutesOf, uid } from './format'

const ALIASES: Record<string, string> = {
  日期: 'date',
  date: 'date',
  时间: 'entryTime',
  入场时间: 'entryTime',
  time: 'entryTime',
  entrytime: 'entryTime',
  出场时间: 'exitTime',
  exittime: 'exitTime',
  合约: 'symbol',
  代码: 'symbol',
  symbol: 'symbol',
  方向: 'side',
  side: 'side',
  手数: 'qty',
  数量: 'qty',
  qty: 'qty',
  入场价: 'entry',
  entry: 'entry',
  entryprice: 'entry',
  止损价: 'stop',
  止损: 'stop',
  stop: 'stop',
  目标价: 'target',
  目标: 'target',
  target: 'target',
  '出场价/当前价': 'exit',
  出场价: 'exit',
  当前价: 'current',
  current: 'current',
  exit: 'exit',
  形态: 'setup',
  setup: 'setup',
  时段: 'session',
  session: 'session',
  状态: 'status',
  status: 'status',
  r: 'rMultiple',
  r倍数: 'rMultiple',
  rmultiple: 'rMultiple',
  最大不利偏移: 'maeR',
  'mae(r)': 'maeR',
  maer: 'maeR',
  mae: 'maeR',
  最大有利偏移: 'mfeR',
  'mfe(r)': 'mfeR',
  mfer: 'mfeR',
  mfe: 'mfeR',
  盈亏: 'pnl',
  '盈亏(usd)': 'pnl',
  pnl: 'pnl',
  手续费: 'fees',
  fees: 'fees',
  备注: 'note',
  note: 'note',
  错误标签: 'mistakes',
  mistakes: 'mistakes',
  纪律: 'discipline',
  discipline: 'discipline',
}

function canonHeader(value: string): string {
  const clean = value.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, '')
  return ALIASES[clean] ?? clean
}

function parseRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function num(value: string | undefined, fallback = 0): number {
  if (!value) return fallback
  const clean = value
    .replace(/[$,\s%]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[＋]/g, '+')
  const n = Number(clean)
  return Number.isFinite(n) ? n : fallback
}

function text(value: string | undefined): string {
  return (value ?? '').trim()
}

function normalizeDate(value: string): string {
  const raw = value.trim().replace(/\//g, '-').replace(/\./g, '-')
  const direct = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (direct) {
    const [, y, m, d] = direct
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }
  const us = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (us) {
    const [, m, d, y] = us
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }
  return ''
}

function normalizeTime(value: string): string {
  const match = value.match(/(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1]!.padStart(2, '0')}:${match[2]}`
}

function parseSide(value: string): Side {
  const v = value.toLowerCase()
  return v.includes('空') || v === 's' || v.includes('short') || v.includes('卖') ? 'S' : 'L'
}

export function sessionOf(time: string): string {
  const minutes = minutesOf(time)
  if (minutes === null) return '早盘'
  if (minutes < 11 * 60) return '早盘'
  if (minutes < 14 * 60) return '午盘'
  return '尾盘'
}

export function gradeOf(r: number): Grade {
  if (r >= 1.5) return 'A'
  if (r >= -0.4) return 'B'
  return 'C'
}

export interface ImportResult {
  trades: Trade[]
  skipped: number
  error: string | null
}

export function importTradesCsv(
  source: string,
  feePerContract: number,
  contracts: ContractConfig[] = DEFAULT_CONFIG.contracts,
  disciplineItems: DisciplineItem[] = DEFAULT_DISCIPLINE_ITEMS,
): ImportResult {
  const rows = parseRows(source)
  if (rows.length < 2) {
    return { trades: [], skipped: 0, error: 'CSV 没有可导入的数据行' }
  }
  const headers = rows[0]!.map(canonHeader)
  const get = (row: string[], key: string): string => {
    const index = headers.indexOf(key)
    return index >= 0 ? text(row[index]) : ''
  }

  const trades: Trade[] = []
  let skipped = 0

  for (const row of rows.slice(1)) {
    const date = normalizeDate(get(row, 'date'))
    const symbol = get(row, 'symbol').toUpperCase()
    const entry = num(get(row, 'entry'))
    if (!date || !symbol || !entry) {
      skipped += 1
      continue
    }

    const side = parseSide(get(row, 'side'))
    const qty = Math.max(0.01, Number(num(get(row, 'qty'), 1).toFixed(4)))
    const stop = num(get(row, 'stop'), entry)
    const target = num(get(row, 'target'), 0)
    const statusRaw = get(row, 'status').toLowerCase()
    const status = statusRaw.includes('持仓') || statusRaw.includes('open') ? 'open' : 'closed'
    const exit = num(get(row, 'exit'))
    const current = num(get(row, 'current')) || (status === 'open' ? exit : 0)
    const outPrice = status === 'open' ? current : exit
    const pointValue =
      contracts.find((contract) => contract.symbol === symbol)?.pointValue ?? 1
    const gross = (outPrice - entry) * pointValue * qty * (side === 'L' ? 1 : -1)
    const fees = get(row, 'fees') ? num(get(row, 'fees')) : qty * feePerContract
    const pnl = get(row, 'pnl') ? num(get(row, 'pnl')) : gross - fees
    const risk = Math.abs(entry - stop) * pointValue * qty
    const rMultiple = get(row, 'rMultiple')
      ? num(get(row, 'rMultiple'))
      : risk > 0
        ? gross / risk
        : 0
    const entryTime = normalizeTime(get(row, 'entryTime')) || '09:30'
    const note = get(row, 'note')
    const maeR = get(row, 'maeR') ? Math.max(0, num(get(row, 'maeR'))) : 0
    const mfeR = get(row, 'mfeR') ? Math.max(0, num(get(row, 'mfeR'))) : 0
    const mistakes = [
      ...new Set(
        get(row, 'mistakes')
          .split(/[|;；、,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ]

    const discipline: Discipline = {}
    for (const item of disciplineItems) {
      discipline[item.id] = item.id === 'journaled' ? Boolean(note) : true
    }

    trades.push({
      id: uid('tr'),
      accountId: '',
      date,
      entryTime,
      exitTime: normalizeTime(get(row, 'exitTime')),
      symbol,
      side,
      qty,
      entry,
      stop,
      target,
      exit,
      current,
      pnl,
      rMultiple,
      fees,
      setup: get(row, 'setup') || '未分类',
      session: get(row, 'session') || sessionOf(entryTime),
      status,
      discipline,
      mistakes,
      maeR,
      mfeR,
      note,
      grade: gradeOf(rMultiple),
      charts: [],
    })
  }

  return { trades, skipped, error: null }
}

export function tradesToCsv(trades: Trade[]): string {
  const header = [
    '日期',
    '时间',
    '合约',
    '方向',
    '手数',
    '入场价',
    '止损价',
    '目标价',
    '出场价/当前价',
    '形态',
    '时段',
    '状态',
    'R',
    '最大不利偏移(R)',
    '最大有利偏移(R)',
    '盈亏(USD)',
    '手续费',
    '错误标签',
    '备注',
  ]
  const body = trades.map((t) => [
    t.date,
    t.entryTime,
    t.symbol,
    t.side === 'L' ? '多' : '空',
    t.qty,
    t.entry,
    t.stop,
    t.target,
    t.status === 'open' ? t.current : t.exit,
    t.setup,
    t.session,
    t.status === 'open' ? '持仓中' : '已平仓',
    t.rMultiple.toFixed(2),
    (t.maeR ?? 0).toFixed(2),
    (t.mfeR ?? 0).toFixed(2),
    t.pnl.toFixed(2),
    t.fees.toFixed(2),
    (t.mistakes ?? []).join('|'),
    t.note,
  ])
  const csv = [header, ...body]
    .map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  return `﻿${csv}`
}

export function downloadCsv(trades: Trade[], filename: string): void {
  const blob = new Blob([tradesToCsv(trades)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
