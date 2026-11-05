import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Trade } from '../types'
import {
  fmtCompactMoney,
  fmtDateCN,
  fmtSignedMoney,
  parseISO,
  todayISO,
  toISO,
} from '../lib/format'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${year}年${Number(m)}月`
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number)
  return toISO(new Date(year, (m ?? 1) - 1 + delta, 1)).slice(0, 7)
}

function initialMonth(trades: Trade[]): string {
  let latest = ''
  for (const trade of trades) {
    if (trade.status === 'closed' && trade.date > latest) latest = trade.date
  }
  return monthOf(latest || todayISO())
}

function signedCompact(n: number): string {
  if (n > 0) return `+${fmtCompactMoney(n)}`
  if (n < 0) return fmtCompactMoney(n)
  return '$0'
}

function tint(pnl: number, strength: number): string {
  if (pnl > 0) {
    return strength > 0.66
      ? 'bg-gain-soft'
      : strength > 0.33
        ? 'bg-gain-soft/70'
        : 'bg-gain-soft/45'
  }
  if (pnl < 0) {
    return strength > 0.66
      ? 'bg-loss-soft'
      : strength > 0.33
        ? 'bg-loss-soft/70'
        : 'bg-loss-soft/45'
  }
  return 'bg-list'
}

export function PnlCalendar({
  trades,
  reviewDates,
  onOpenReview,
}: {
  trades: Trade[]
  reviewDates: ReadonlySet<string>
  onOpenReview: (date: string) => void
}) {
  const [month, setMonth] = useState(() => initialMonth(trades))
  const today = todayISO()
  const todayMonth = monthOf(today)

  const model = useMemo(() => {
    const daily = new Map<string, { pnl: number; closed: number; total: number }>()
    for (const trade of trades) {
      if (!trade.date.startsWith(`${month}-`)) continue
      const day = daily.get(trade.date) ?? { pnl: 0, closed: 0, total: 0 }
      day.total += 1
      if (trade.status === 'closed') {
        day.pnl += trade.pnl
        day.closed += 1
      }
      daily.set(trade.date, day)
    }

    let monthPnl = 0
    let activeDays = 0
    let greenDays = 0
    let redDays = 0
    let closedCount = 0
    let openCount = 0
    let maxAbs = 0
    for (const day of daily.values()) {
      monthPnl += day.pnl
      closedCount += day.closed
      openCount += day.total - day.closed
      activeDays += 1
      if (day.pnl > 0) greenDays += 1
      else if (day.pnl < 0) redDays += 1
      maxAbs = Math.max(maxAbs, Math.abs(day.pnl))
    }

    const first = parseISO(`${month}-01`)
    const offset = (first.getDay() + 6) % 7
    const total = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
    const cells: Array<string | null> = Array.from({ length: offset }, () => null)
    for (let day = 1; day <= total; day += 1) {
      cells.push(`${month}-${String(day).padStart(2, '0')}`)
    }
    while (cells.length % 7 !== 0) cells.push(null)

    return {
      daily,
      cells,
      monthPnl: Math.round(monthPnl * 100) / 100,
      activeDays,
      greenDays,
      redDays,
      closedCount,
      openCount,
      maxAbs: Math.max(1, maxAbs),
    }
  }, [trades, month])

  const empty = model.activeDays === 0

  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
            <CalendarDays size={13} className="text-muted" />
            盈亏日历
          </h2>
          <p className="mt-0.5 text-[10.5px] text-faint">
            {empty
              ? '本月暂无交易 · 仍可点击日期写每日复盘'
              : `${model.closedCount} 笔已平仓${
                  model.openCount ? ` · ${model.openCount} 笔持仓` : ''
                } · 点击日期写每日复盘`}
          </p>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            className="icon-btn h-7 w-7"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
            aria-label="上个月"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="num min-w-[82px] text-center text-[12px] font-medium text-ink">
            {monthLabel(month)}
          </span>
          <button
            className="icon-btn h-7 w-7"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
            aria-label="下个月"
          >
            <ChevronRight size={14} />
          </button>
          <button
            className="btn btn-ghost ml-1 h-7 px-2 text-[11px]"
            onClick={() => setMonth(todayMonth)}
            disabled={month === todayMonth}
          >
            今天
          </button>
        </div>
      </div>

      <div className="divider" />

      <div className="px-4 pb-4 pt-3">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((label, index) => (
            <div
              key={label}
              className={`pb-1 text-center text-[9.5px] font-medium ${
                index >= 5 ? 'text-faint/70' : 'text-faint'
              }`}
            >
              {label}
            </div>
          ))}

          {model.cells.map((date, index) => {
            if (!date) return <div key={`blank-${index}`} className="h-[68px]" />
            const day = model.daily.get(date)
            const pnl = day?.pnl ?? 0
            const hasClosed = Boolean(day?.closed)
            const strength = hasClosed ? Math.abs(pnl) / model.maxAbs : 0
            const isToday = date === today
            const isFuture = date > today
            const hasReview = reviewDates.has(date)

            return (
              <button
                key={date}
                type="button"
                disabled={isFuture}
                onClick={() => onOpenReview(date)}
                title={
                  isFuture
                    ? undefined
                    : day
                      ? hasClosed
                        ? `${fmtDateCN(date)} · ${day.total} 笔 · 已平仓 ${day.closed} 笔 · 净盈亏 ${fmtSignedMoney(day.pnl, true)} · 写每日复盘`
                        : `${fmtDateCN(date)} · ${day.total} 笔持仓中 · 写每日复盘`
                      : `${fmtDateCN(date)} · 写每日复盘`
                }
                aria-label={
                  isFuture
                    ? undefined
                    : day
                      ? `写 ${fmtDateCN(date)} 的每日复盘；当天 ${day.total} 笔交易，已平仓 ${day.closed} 笔，净盈亏 ${fmtSignedMoney(day.pnl, true)}`
                      : `写 ${fmtDateCN(date)} 的每日复盘`
                }
                className={`relative flex h-[68px] flex-col rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  day
                    ? `${
                        hasClosed ? tint(pnl, strength) : 'bg-accent-soft/60'
                      } border-line hover:border-line-2 hover:brightness-[0.985]`
                    : `${
                        isFuture
                          ? 'border-transparent bg-white'
                          : 'border-line/70 bg-list/40 hover:bg-list'
                      }`
                } ${isToday ? 'ring-1 ring-inset ring-accent/40' : ''} ${
                  isFuture ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <span
                  className={`num text-[10px] ${
                    isToday
                      ? 'font-semibold text-accent'
                      : day
                        ? 'text-ink-2'
                        : isFuture
                          ? 'text-faint/50'
                          : 'text-faint'
                  }`}
                >
                  {Number(date.slice(8))}
                </span>
                {hasReview ? (
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent"
                    title="已写每日复盘"
                  />
                ) : null}

                {day ? (
                  <span className="mt-auto block">
                    {hasClosed ? (
                      <span
                        className={`num block truncate text-[12px] font-semibold ${
                          pnl > 0 ? 'text-gain' : pnl < 0 ? 'text-loss' : 'text-muted'
                        }`}
                      >
                        {signedCompact(pnl)}
                      </span>
                    ) : (
                      <span className="num block text-[11px] font-medium text-accent">持仓中</span>
                    )}
                    <span className="mt-0.5 block text-[9.5px] text-faint">{day.total} 笔</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
            <div>
              <div className="text-[9.5px] text-faint">本月净盈亏</div>
              <div
                className={`num text-[13px] font-semibold ${
                  model.monthPnl > 0
                    ? 'text-gain'
                    : model.monthPnl < 0
                      ? 'text-loss'
                      : 'text-muted'
                }`}
              >
                {model.monthPnl === 0 ? '$0.00' : fmtSignedMoney(model.monthPnl, true)}
              </div>
            </div>
            <div>
              <div className="text-[9.5px] text-faint">交易天数</div>
              <div className="num text-[13px] font-medium text-ink">{model.activeDays} 天</div>
            </div>
            <div>
              <div className="text-[9.5px] text-faint">盈利 / 亏损日</div>
              <div className="num text-[13px] font-medium text-ink">
                {model.greenDays} / {model.redDays}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[9.5px] text-faint">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-gain-soft ring-1 ring-gain/15" />
              盈利
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-loss-soft ring-1 ring-loss/15" />
              亏损
            </span>
            <span>按已平仓交易统计</span>
          </div>
        </div>
      </div>
    </section>
  )
}
