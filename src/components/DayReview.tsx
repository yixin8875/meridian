import { useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Check, Trash2, X } from 'lucide-react'
import type { DailyReview } from '../types'
import { computeStats, mistakeCost } from '../lib/stats'
import {
  fmtDateCN,
  fmtDateFullCN,
  fmtR,
  fmtSignedMoney,
  parseISO,
  toISO,
  uid,
} from '../lib/format'
import { useApp } from '../store'
import { Modal } from './primitives'

function weekRange(iso: string): { start: string; end: string } {
  const date = parseISO(iso)
  const offset = (date.getDay() + 6) % 7
  const start = new Date(date)
  start.setDate(date.getDate() - offset)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: toISO(start), end: toISO(end) }
}

function blankReview(date: string, accountId: string, score: number): DailyReview {
  return {
    id: uid('dr'),
    accountId,
    date,
    marketContext: '',
    plan: '',
    executionScore: score,
    violations: [],
    improvement: '',
    checks: {},
    updatedAt: new Date().toISOString(),
  }
}

function cloneChecks(checks: DailyReview['checks'] | undefined): DailyReview['checks'] {
  const out: DailyReview['checks'] = {}
  for (const [key, value] of Object.entries(checks ?? {})) out[key] = [...value]
  return out
}

function withChecks(review: DailyReview): DailyReview {
  return {
    ...review,
    violations: [...review.violations],
    checks: cloneChecks(review.checks),
  }
}

export function DayReviewDialog({
  date,
  onClose,
  onOpenTrades,
}: {
  date: string
  onClose: () => void
  onOpenTrades: (date: string) => void
}) {
  const { account, trades, reviews, saveDailyReview, deleteDailyReview, config } = useApp()
  const review = reviews.find((entry) => entry.date === date)
  const dayTrades = useMemo(() => trades.filter((trade) => trade.date === date), [trades, date])
  const dayStats = useMemo(
    () => computeStats(dayTrades, account.startingEquity),
    [dayTrades, account.startingEquity],
  )
  const defaultScore = dayStats.count ? Math.round(dayStats.execution) : 80
  const week = useMemo(() => {
    const { start, end } = weekRange(date)
    const list = trades.filter((trade) => trade.date >= start && trade.date <= end)
    return {
      start,
      end,
      stats: computeStats(list, account.startingEquity),
      mistakes: mistakeCost(list),
    }
  }, [trades, date, account.startingEquity])

  const [form, setForm] = useState<DailyReview>(() =>
    review ? withChecks(review) : blankReview(date, account.id, defaultScore),
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setForm(review ? withChecks(review) : blankReview(date, account.id, defaultScore))
    setError(null)
    setConfirmDelete(false)
  }, [date, review?.id, account.id, defaultScore])

  const set = <K extends keyof DailyReview>(key: K, value: DailyReview[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const hasContent =
    Boolean(form.marketContext.trim() || form.plan.trim() || form.improvement.trim()) ||
    form.violations.length > 0 ||
    Object.values(form.checks).some((checked) => checked.length > 0) ||
    form.executionScore !== defaultScore

  const save = () => {
    if (!hasContent) {
      setError('至少记录市场背景、计划、执行分、规则违背或明日改进中的一项。')
      return
    }
    saveDailyReview({
      ...form,
      accountId: account.id,
      date,
      executionScore: Math.min(100, Math.max(0, Math.round(form.executionScore))),
    })
    onClose()
  }

  const toggleViolation = (tag: string) => {
    set(
      'violations',
      form.violations.includes(tag)
        ? form.violations.filter((item) => item !== tag)
        : [...form.violations, tag],
    )
  }

  const toggleCheck = (checklistId: string, itemId: string) => {
    setForm((prev) => {
      const checked = prev.checks[checklistId] ?? []
      const next = checked.includes(itemId)
        ? checked.filter((id) => id !== itemId)
        : [...checked, itemId]
      const checks = { ...prev.checks }
      if (next.length) checks[checklistId] = next
      else delete checks[checklistId]
      return { ...prev, checks }
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`每日复盘 · ${fmtDateFullCN(date)}`}
      subtitle={
        dayTrades.length
          ? `${dayTrades.length} 笔交易 · 已平仓 ${dayStats.count} 笔`
          : '这一天没有交易，也可以记录观察与纪律'
      }
      width={720}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => onOpenTrades(date)}>
            查看当日交易
          </button>
          <div className="ml-auto flex items-center gap-2">
            {review ? (
              confirmDelete ? (
                <>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      deleteDailyReview(date)
                      onClose()
                    }}
                  >
                    确认删除
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-ghost text-loss"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={13} />
                  删除复盘
                </button>
              )
            ) : null}
            <button className="btn btn-secondary" onClick={onClose}>
              <X size={13} />
              取消
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Check size={13} />
              保存复盘
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-4 divide-x divide-line rounded-lg border border-line bg-list/70">
          <div className="px-3 py-2.5">
            <div className="text-[9.5px] text-faint">当日净盈亏</div>
            <div className="num mt-0.5 text-[14px] font-semibold text-ink">
              {dayStats.count ? fmtSignedMoney(dayStats.netPnl, true) : '—'}
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[9.5px] text-faint">交易笔数</div>
            <div className="num mt-0.5 text-[14px] font-medium text-ink">
              {dayTrades.length}
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[9.5px] text-faint">本周净盈亏</div>
            <div className="num mt-0.5 text-[14px] font-medium text-ink">
              {week.stats.count ? fmtSignedMoney(week.stats.netPnl, true) : '—'}
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[9.5px] text-faint">本周错误标签</div>
            <div className="num mt-0.5 text-[14px] font-medium text-ink">
              {week.mistakes.tagged ? `${week.mistakes.tagged} 笔` : '0 笔'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">市场背景</span>
            <textarea
              className="textarea min-h-[92px]"
              placeholder="趋势、波动、关键数据、开盘结构…"
              value={form.marketContext}
              onChange={(event) => set('marketContext', event.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">交易计划</span>
            <textarea
              className="textarea min-h-[92px]"
              placeholder="今天只做哪些形态？风险上限是什么？"
              value={form.plan}
              onChange={(event) => set('plan', event.target.value)}
            />
          </label>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="field-label">执行分</span>
            <span className="num text-[13px] font-semibold text-accent">
              {form.executionScore}
              <span className="text-[10px] font-normal text-faint"> / 100</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            className="mt-1 w-full accent-[#0b6cf0]"
            value={form.executionScore}
            onChange={(event) => set('executionScore', Number(event.target.value))}
          />
          <div className="flex justify-between text-[9.5px] text-faint">
            <span>情绪化 / 无计划</span>
            <span>按计划执行</span>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="field-label">规则违背</span>
            <span className="text-[10px] text-faint">点击标记当天出现的错误</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {config.mistakeTags.map((tag) => {
              const active = form.violations.includes(tag)
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleViolation(tag)}
                  className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] transition-colors ${
                    active
                      ? 'border-loss/30 bg-loss-soft text-loss'
                      : 'border-line bg-white text-muted hover:bg-hover'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
            {!config.mistakeTags.length ? (
              <span className="text-[10px] text-faint">还没有错误标签，可在设置中维护。</span>
            ) : null}
          </div>
        </div>

        {config.checklists.length ? (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="field-label">盘前检查清单</span>
              <span className="text-[10px] text-faint">按形态勾选当天开盘前的检查项</span>
            </div>
            <div className="mt-1 space-y-2">
              {config.checklists.map((checklist) => {
                const checked = form.checks[checklist.id] ?? []
                const done = checklist.items.filter((item) => checked.includes(item.id)).length
                return (
                  <div
                    key={checklist.id}
                    className="rounded-lg border border-line bg-list/70 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-ink">{checklist.setup}</span>
                      <span
                        className={`num text-[10px] ${
                          done === checklist.items.length ? 'text-gain' : 'text-faint'
                        }`}
                      >
                        {done} / {checklist.items.length}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      {checklist.items.map((item) => {
                        const active = checked.includes(item.id)
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => toggleCheck(checklist.id, item.id)}
                            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[10.5px] transition-colors ${
                              active
                                ? 'border-gain/25 bg-gain-soft/60 text-ink'
                                : 'border-line bg-white text-muted hover:bg-hover'
                            }`}
                          >
                            <span
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                                active
                                  ? 'border-gain bg-gain text-white'
                                  : 'border-line-2 bg-white'
                              }`}
                            >
                              {active ? <Check size={9} strokeWidth={3} /> : null}
                            </span>
                            <span className="min-w-0 flex-1">{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <label className="block">
          <span className="field-label">明日改进</span>
          <textarea
            className="textarea min-h-[74px]"
            placeholder="只写一件明天能执行的事。"
            value={form.improvement}
            onChange={(event) => set('improvement', event.target.value)}
          />
        </label>

        <div className="rounded-lg border border-line bg-list/70 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink">
              <BookOpenCheck size={13} className="text-accent" />
              本周自动汇总
            </span>
            <span className="num text-[9.5px] text-faint">
              {fmtDateCN(week.start)} – {fmtDateCN(week.end)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10.5px] text-muted">
            <span>
              已平仓 <b className="num font-medium text-ink-2">{week.stats.count}</b> 笔
            </span>
            <span>
              净盈亏{' '}
              <b className="num font-medium text-ink-2">
                {week.stats.count ? fmtSignedMoney(week.stats.netPnl, true) : '—'}
              </b>
            </span>
            <span>
              期望 <b className="num font-medium text-ink-2">{fmtR(week.stats.expectancyR)}</b>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {week.mistakes.tags.length ? (
              week.mistakes.tags.map((tag) => (
                <span
                  key={tag.key}
                  className="inline-flex h-5 items-center rounded-full bg-loss-soft px-2 text-[9.5px] text-loss"
                >
                  {tag.key} × {tag.count}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-faint">
                {week.stats.count ? '本周没有标记错误标签。' : '本周还没有已平仓交易。'}
              </span>
            )}
          </div>
        </div>

        <p className="text-[9.5px] text-faint">
          复盘日期：{fmtDateFullCN(date)} · 记录会自动保存在本机，并计入本月复盘节奏。
        </p>
      </div>
    </Modal>
  )
}
