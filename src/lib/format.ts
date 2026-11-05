const moneyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

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

export function fmtMoney(n: number, cents = true): string {
  return cents ? moneyFmt.format(n) : intFmt.format(n)
}

export function fmtSignedMoney(n: number, cents = true): string {
  const abs = fmtMoney(Math.abs(n), cents)
  return `${n < 0 ? '−' : '+'}$${abs}`
}

export function fmtCompactMoney(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
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
