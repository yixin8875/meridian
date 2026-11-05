import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Plus,
  ShieldAlert,
  Sparkles,
  Upload,
  Wallet,
} from 'lucide-react'
import type { Range } from '../types'
import { useApp } from '../store'
import { DISCIPLINE_ITEMS } from '../data/contracts'
import {
  buildEquity,
  cashFlowSummary,
  closedTrades,
  computeStats,
  disciplineRates,
  filterRange,
  openTrades,
  rangeReturnPct,
  riskStatus,
  withMean,
} from '../lib/stats'
import {
  fmtDateCN,
  fmtDateFullCN,
  fmtMoney,
  fmtPct,
  fmtR,
  fmtSignedMoney,
  todayISO,
} from '../lib/format'
import { EquityChart } from '../components/Chart'
import { DayReviewDialog } from '../components/DayReview'
import { PnlCalendar } from '../components/PnlCalendar'
import { EmptyState, IconBadge, Pnl, RValue, SideBadge } from '../components/primitives'

const RANGES: Range[] = ['1M', '3M', '6M', 'YTD', 'ALL']

export function Overview({
  onNewTrade,
  onOpenTrade,
  onOpenSettings,
  onLoadDemo,
  onNewNote,
  onOpenDate,
}: {
  onNewTrade: () => void
  onOpenTrade: (id: string) => void
  onOpenSettings: () => void
  onLoadDemo: () => void
  onNewNote: () => void
  onOpenDate: (date: string) => void
}) {
  const { trades, notes, account, reviews, cashFlows } = useApp()
  const [range, setRange] = useState<Range>('ALL')
  const [reviewDate, setReviewDate] = useState<string | null>(null)
  const reviewDates = useMemo(() => new Set(reviews.map((review) => review.date)), [reviews])

  const model = useMemo(() => {
    const today = todayISO()
    const stats = computeStats(trades, account.startingEquity, cashFlows)
    const all = withMean(buildEquity(trades, account.startingEquity, cashFlows))
    const points = filterRange(all, range)
    const first = points[0]
    const last = points[points.length - 1]
    const rangePnl = last && first ? last.tradingEquity - first.tradingEquity : 0
    const rangePct = rangeReturnPct(points)
    return {
      stats,
      points,
      rangePnl,
      rangePct,
      equity: last?.equity ?? account.startingEquity,
      open: openTrades(trades),
      recent: closedTrades(trades).slice(-6).reverse(),
      rates: disciplineRates(trades),
      flow: cashFlowSummary(cashFlows),
      risk: riskStatus(trades, account.risk, today),
    }
  }, [trades, account.startingEquity, account.risk, cashFlows, range])

  const { stats, open, recent, rates } = model
  const riskAlerts = [
    model.risk.dailyLimitHit
      ? `今日已实现 ${fmtSignedMoney(model.risk.todayPnl, true)}，达到每日亏损上限 ${fmtSignedMoney(-model.risk.dailyLimit, true)}`
      : '',
    model.risk.streakHit
      ? `连续亏损 ${model.risk.losingStreak} 笔，达到上限 ${model.risk.streakLimit} 笔`
      : '',
  ].filter(Boolean)

  if (!trades.length && !notes.length && !reviews.length && !cashFlows.length) {
    return (
      <>
        <div className="mx-auto max-w-[760px] px-8 py-10">
          <div className="fade-in rounded-xl border border-line bg-white p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-[0_2px_8px_rgba(11,108,240,0.28)]">
            <Sparkles size={21} />
          </span>
          <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.015em] text-ink">
            从第一笔交易开始
          </h1>
          <p className="mt-2 max-w-[480px] text-[12.5px] leading-6 text-muted">
            这里没有预设的假数据。记录你的真实成交、计划风险与执行情况，或者从券商导出的 CSV
            开始。所有内容保存在本机文件里。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary h-9 px-4" onClick={onNewTrade}>
              <Plus size={15} />
              记录第一笔交易
            </button>
            <button className="btn btn-secondary h-9 px-4" onClick={onOpenSettings}>
              <Upload size={14} />
              导入 CSV
            </button>
            <button className="btn btn-ghost h-9 px-4" onClick={onLoadDemo}>
              先看看示例数据
            </button>
            <button
              className="btn btn-ghost h-9 px-4"
              onClick={() => setReviewDate(todayISO())}
            >
              <BookOpen size={14} />
              写今日复盘
            </button>
          </div>

          <div className="divider my-7" />

          <div className="grid grid-cols-3 gap-5">
            <div>
              <div className="section-label">账户</div>
              <div className="mt-1.5 text-[13px] font-medium text-ink">{account.name}</div>
            </div>
            <div>
              <div className="section-label">起始权益</div>
              <div className="num mt-1.5 text-[13px] font-medium text-ink">
                ${fmtMoney(account.startingEquity, false)}
              </div>
            </div>
            <div>
              <div className="section-label">每手手续费</div>
              <div className="num mt-1.5 text-[13px] font-medium text-ink">
                ${fmtMoney(account.feePerContract)}
              </div>
            </div>
          </div>

          <button
            className="mt-6 inline-flex items-center gap-1.5 text-[11.5px] text-accent hover:underline"
            onClick={onOpenSettings}
          >
            修改账户设置
            <ArrowUpRight size={12} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            className="panel flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-list"
            onClick={onNewNote}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Wallet size={16} />
            </span>
            <span className="flex-1">
              <span className="block text-[12.5px] font-medium text-ink">写下盘前计划</span>
              <span className="block text-[10.5px] text-muted">先定义风险，再找机会</span>
            </span>
            <ChevronRight size={14} className="text-faint" />
          </button>
          <button
            className="panel flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-list"
            onClick={onOpenSettings}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-list text-muted ring-1 ring-line">
              <Upload size={15} />
            </span>
            <span className="flex-1">
              <span className="block text-[12.5px] font-medium text-ink">已有交易记录？</span>
              <span className="block text-[10.5px] text-muted">支持中英文表头的 CSV</span>
            </span>
            <ChevronRight size={14} className="text-faint" />
          </button>
          </div>
        </div>
        {reviewDate ? (
          <DayReviewDialog
            date={reviewDate}
            onClose={() => setReviewDate(null)}
            onOpenTrades={(date) => {
              setReviewDate(null)
              onOpenDate(date)
            }}
          />
        ) : null}
      </>
    )
  }

  const tiles = [
    {
      label: '区间净盈亏',
      value: fmtSignedMoney(model.rangePnl, true),
      tone: model.rangePnl > 0 ? 'text-gain' : model.rangePnl < 0 ? 'text-loss' : 'text-ink',
      hint: `${fmtPct(model.rangePct, 2, true)} · ${range === 'ALL' ? '全部' : range}`,
    },
    {
      label: '胜率',
      value: fmtPct(stats.winRate, 1),
      tone: 'text-ink',
      hint: `${stats.wins} 胜 / ${stats.losses} 负`,
    },
    {
      label: '盈亏比',
      value: stats.profitFactor >= 99 ? '∞' : stats.profitFactor.toFixed(2),
      tone: 'text-ink',
      hint: `期望 ${fmtR(stats.expectancyR)}`,
    },
    {
      label: '最大回撤',
      value: stats.maxDdPct ? `−${stats.maxDdPct.toFixed(2)}%` : '0.00%',
      tone: stats.maxDdPct > 0 ? 'text-loss' : 'text-ink',
      hint: stats.maxDdAbs ? `−$${fmtMoney(stats.maxDdAbs, false)}` : '尚无回撤',
    },
  ]

  return (
    <div className="fade-in mx-auto max-w-[940px] px-8 py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">总览</h1>
          <p className="mt-1 text-[11.5px] text-muted">
            {account.name} · {fmtDateFullCN(todayISO())}
          </p>
        </div>
        <div className="seg">
          {RANGES.map((item) => (
            <button key={item} data-active={range === item} onClick={() => setRange(item)}>
              {item === 'ALL' ? '全部' : item}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-5 rounded-xl border border-line bg-white px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="section-label">账户权益</div>
            <div className="num mt-1.5 text-[30px] font-semibold tracking-[-0.02em] text-ink">
              ${fmtMoney(model.equity, false)}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11.5px]">
              <span
                className={
                  model.rangePnl > 0 ? 'text-gain' : model.rangePnl < 0 ? 'text-loss' : 'text-muted'
                }
              >
                {fmtSignedMoney(model.rangePnl, true)}
              </span>
              <span className="text-faint">
                {fmtPct(model.rangePct, 2, true)} · 区间 {range === 'ALL' ? '全部' : range}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1 text-[10.5px] text-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-accent" />
              权益
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded border-t border-dashed border-line-2" />
              30 日均线
            </span>
            <span className="num">{stats.count} 笔已平仓</span>
          </div>
        </div>
        <div className="mt-3">
          <EquityChart points={model.points} />
        </div>
      </section>

      <section className="mt-3 grid grid-cols-4 divide-x divide-line rounded-xl border border-line bg-white">
        {tiles.map((tile) => (
          <div key={tile.label} className="px-4 py-3.5">
            <div className="text-[10.5px] text-faint">{tile.label}</div>
            <div className={`num mt-1 truncate text-[18px] font-semibold ${tile.tone}`}>
              {tile.value}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-faint">{tile.hint}</div>
          </div>
        ))}
      </section>

      <section className="mt-3 grid grid-cols-4 divide-x divide-line rounded-xl border border-line bg-white">
        <div className="px-4 py-3">
          <div className="text-[10.5px] text-faint">累计净入金</div>
          <div
            className={`num mt-1 truncate text-[15px] font-semibold ${
              model.flow.net > 0 ? 'text-gain' : model.flow.net < 0 ? 'text-loss' : 'text-ink'
            }`}
          >
            {fmtSignedMoney(model.flow.net, true)}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-faint">
            入金 ${fmtMoney(model.flow.deposits, false)} · 出金 ${fmtMoney(model.flow.withdrawals, false)}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10.5px] text-faint">今日已实现</div>
          <div
            className={`num mt-1 truncate text-[15px] font-semibold ${
              model.risk.todayPnl > 0
                ? 'text-gain'
                : model.risk.todayPnl < 0
                  ? 'text-loss'
                  : 'text-ink'
            }`}
          >
            {fmtSignedMoney(model.risk.todayPnl, true)}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-faint">只计已平仓交易</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10.5px] text-faint">每日亏损上限</div>
          <div
            className={`num mt-1 truncate text-[15px] font-semibold ${
              model.risk.dailyLimitHit ? 'text-loss' : 'text-ink'
            }`}
          >
            {model.risk.dailyLimit > 0
              ? fmtSignedMoney(-model.risk.dailyLimit, true)
              : '未设置'}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-faint">
            {model.risk.dailyLimit > 0 ? '达到后停止开新仓' : '可在账户设置中配置'}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10.5px] text-faint">连续亏损</div>
          <div
            className={`num mt-1 truncate text-[15px] font-semibold ${
              model.risk.streakHit ? 'text-loss' : 'text-ink'
            }`}
          >
            {model.risk.losingStreak} 笔
          </div>
          <div className="mt-0.5 truncate text-[10px] text-faint">
            {model.risk.streakLimit > 0 ? `上限 ${model.risk.streakLimit} 笔` : '未设置上限'}
          </div>
        </div>
      </section>

      {riskAlerts.length ? (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11px] leading-relaxed text-loss">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{riskAlerts.join('；')}。建议停止开新仓，先复盘。</span>
        </div>
      ) : null}

      <div className="mt-3">
        <PnlCalendar
          trades={trades}
          reviewDates={reviewDates}
          onOpenReview={setReviewDate}
        />
        {reviewDate ? (
          <DayReviewDialog
            date={reviewDate}
            onClose={() => setReviewDate(null)}
            onOpenTrades={(date) => {
              setReviewDate(null)
              onOpenDate(date)
            }}
          />
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-[1.35fr_1fr] gap-3">
        <section className="rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h2 className="text-[12.5px] font-semibold text-ink">持仓中</h2>
              <p className="mt-0.5 text-[10.5px] text-faint">
                {open.length ? `${open.length} 笔未平仓` : '当前没有持仓'}
              </p>
            </div>
            <button className="btn btn-ghost h-7 px-2 text-[11px]" onClick={onNewTrade}>
              <Plus size={12} />
              记录
            </button>
          </div>
          <div className="divider" />
          {open.length ? (
            <div className="p-2">
              {open.slice(0, 4).map((trade) => (
                <button key={trade.id} className="list-row" onClick={() => onOpenTrade(trade.id)}>
                  <IconBadge symbol={trade.symbol} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-ink">
                      {trade.symbol} · {trade.setup}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted">
                      {fmtDateCN(trade.date)} {trade.entryTime} · {trade.qty} 手
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SideBadge side={trade.side} />
                    <Pnl value={trade.pnl} className="text-[12px] font-medium" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="没有未平仓交易"
              description="有持仓时，这里会显示浮动盈亏与计划风险。"
            />
          )}
        </section>

        <section className="rounded-xl border border-line bg-white px-4 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[12.5px] font-semibold text-ink">过程纪律</h2>
            <span className="num text-[11px] text-muted">{stats.execution.toFixed(0)}%</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.min(100, Math.max(0, stats.execution))}%` }}
            />
          </div>
          <div className="mt-3 space-y-2.5">
            {rates.map((rate) => {
              const item = DISCIPLINE_ITEMS.find((entry) => entry.key === rate.key)
              return (
                <div key={rate.key}>
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-muted">{item?.short ?? rate.key}</span>
                    <span className="num text-ink-2">{rate.pass.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={`h-full rounded-full ${
                        rate.pass >= 85 ? 'bg-gain' : rate.pass >= 65 ? 'bg-accent' : 'bg-warn'
                      }`}
                      style={{ width: `${rate.pass}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3.5 border-t border-line pt-2.5 text-[10px] leading-relaxed text-faint">
            完全执行 {stats.clean} 笔，有偏差 {stats.flagged} 笔。
          </div>
        </section>
      </div>

      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-[12.5px] font-semibold text-ink">最近交易</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">按时间倒序</p>
          </div>
          <button className="btn btn-ghost h-7 px-2 text-[11px]" onClick={onOpenSettings}>
            数据与导入
            <ChevronRight size={12} />
          </button>
        </div>
        <div className="divider" />
        {recent.length ? (
          <table className="w-full">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.05em] text-faint">
                <th className="px-4 py-2 font-medium">日期</th>
                <th className="px-2 py-2 font-medium">交易</th>
                <th className="px-2 py-2 font-medium">形态</th>
                <th className="px-2 py-2 text-right font-medium">R</th>
                <th className="px-4 py-2 text-right font-medium">净盈亏</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((trade) => (
                <tr
                  key={trade.id}
                  className="cursor-pointer border-t border-line/70 text-[11.5px] transition-colors hover:bg-list"
                  onClick={() => onOpenTrade(trade.id)}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                    {fmtDateCN(trade.date)}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="font-medium text-ink">{trade.symbol}</span>
                    <span className="ml-1.5 text-[10px] text-faint">
                      {trade.side === 'L' ? '多' : '空'} {trade.qty}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">{trade.setup}</td>
                  <td className="px-2 py-2.5 text-right">
                    <RValue value={trade.rMultiple} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    <Pnl value={trade.pnl} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="还没有已平仓交易" description="平仓后这里会出现最近六笔。" />
        )}
      </section>
    </div>
  )
}
