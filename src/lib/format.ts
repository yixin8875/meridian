import type { AccountCurrency } from '../types'

const moneyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** MT5 里常见的美分账户币种代码。 */
const CENT_CODES = new Set(['USC', 'EUC', 'GBC', 'AUC', 'CNC', 'HKC', 'SGC', 'JPC', 'CHC'])

/** 把外部币种代码归一到应用支持的两种账户币种。 */
export function normalizeCurrency(code?: string | null): AccountCurrency {
  return CENT_CODES.has((code ?? '').trim().toUpperCase()) ? 'USC' : 'USD'
}

/** 是否是应用能明确识别的账户币种（USD 或 MT5 美分币种）。 */
export function isKnownCurrency(code?: string | null): boolean {
  const value = (code ?? '').trim().toUpperCase()
  return value === 'USD' || CENT_CODES.has(value)
}

export function currencyLabel(code?: string | null): string {
  return normalizeCurrency(code) === 'USC' ? '美分 (USC)' : '美元 (USD)'
}

export function currencyUnit(code?: string | null): string {
  return normalizeCurrency(code) === 'USC' ? '美分' : '美元'
}

let displayCurrency: AccountCurrency = 'USD'

/** 全局显示币种由当前账户决定；跨账户列表应显式传入币种。 */
export function setDisplayCurrency(code?: string | null): void {
  displayCurrency = normalizeCurrency(code)
}

export function currentCurrency(): AccountCurrency {
  return displayCurrency
}

const intFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function toISO(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function shiftISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function todayISO(): string {
  return toISO(new Date())
}

/** 金额按账户币种显示：美元为 $1,234.56，美分为 1,234.56 ¢。 */
export function fmtMoney(n: number, cents = true, currency?: string): string {
  const value = cents ? moneyFmt.format(n) : intFmt.format(n)
  return normalizeCurrency(currency ?? displayCurrency) === 'USC' ? `${value} ¢` : `$${value}`
}

export function fmtSignedMoney(n: number, cents = true, currency?: string): string {
  return `${n < 0 ? '−' : '+'}${fmtMoney(Math.abs(n), cents, currency)}`
}

export function fmtCompactMoney(n: number, currency?: string): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (normalizeCurrency(currency ?? displayCurrency) === 'USC') {
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}m ¢`
    if (abs >= 1_000) return `${sign}${Math.round(abs / 100) / 10}k ¢`
    return `${sign}${Math.round(abs)} ¢`
  }
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 100) / 10}k`
  return `${sign}$${Math.round(abs)}`
}

export function fmtPct(n: number, digits = 2, sign = false): string {
  const prefix = sign && n > 0 ? '+' : ''
  return `${prefix}${n.toFixed(digits)}%`
}

export function fmtR(n: number): string {
  const prefix = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${prefix}${Math.abs(n).toFixed(2)}R`
}

export function weekdayCN(iso: string): string {
  return WEEKDAYS[parseISO(iso).getDay()]
}

export function fmtDateCN(iso: string): string {
  const d = parseISO(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtDateFullCN(iso: string): string {
  const d = parseISO(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${weekdayCN(iso)}`
}

export function fmtDateDot(iso: string): string {
  return iso.replaceAll('-', '.')
}

export function fmtDateShort(iso: string): string {
  const d = parseISO(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function monthEN(iso: string): string {
  return MONTHS[parseISO(iso).getMonth()] ?? ''
}

export function minutesOf(hhmm: string): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export function fmtDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h <= 0) return `${m} 分钟`
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function uid(prefix = 't'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
