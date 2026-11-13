import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Plus,
  ShieldAlert,
  Upload,
  Wallet,
} from 'lucide-react'
import type { Range } from '../types'
import { useApp } from '../store'
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
import {
  EmptyState,
  IconBadge,
  MeridianMark,
  Pnl,
  RValue,
  SideBadge,
} from '../components/primitives'

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
  const { trades, notes, account, reviews, cashFlows, config } = useApp()
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
      rates: disciplineRates(trades, config.disciplineItems),
      flow: cashFlowSummary(cashFlows),
      risk: riskStatus(trades, account.risk, today),
    }
  }, [
    trades,
    account.startingEquity,
    account.risk,
    cashFlows,
    range,
    config.disciplineItems,
  ])

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
        <div className="mx-auto max-w-4xl px-8 py-12">
          <div className="fade-in rounded-xl border border-line bg-paper p-10">
          <MeridianMark size={36} className="text-ink" />
          <h1 className="mt-6 text-3xl font-medium text-ink">从第一笔交易开始</h1>
          <p className="mt-3 max-w-lg text-base leading-7 text-muted">
            这里没有预设的假数据。记录你的真实成交、计划风险与执行情况，或者从券商导出的 CSV
            开始。所有内容保存在本机文件里。
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary px-4" onClick={onNewTrade}>
              <Plus size={16} strokeWidth={1.5} />
              记录第一笔交易
            </button>
            <button className="btn btn-secondary px-4" onClick={onOpenSettings}>
              <Upload size={16} strokeWidth={1.5} />
              导入 CSV
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
            <button className="text-muted hover:text-ink" onClick={onLoadDemo}>
              先看看示例数据
            </button>
            <button
              className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
              onClick={() => setReviewDate(todayISO())}
            >
              <BookOpen size={14} strokeWidth={1.5} />
              写今日复盘
            </button>
          </div>

          <div className="divider my-8" />

          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="section-label">账户</div>
              <div className="mt-2 text-sm font-medium text-ink">{account.name}</div>
            </div>
            <div>
              <div className="section-label">起始权益</div>
              <div className="num mt-2 text-sm font-medium text-ink">
                {fmtMoney(account.startingEquity, true)}
              </div>
            </div>
            <div>
              <div className="section-label">每手手续费</div>
              <div className="num mt-2 text-sm font-medium text-ink">
                {fmtMoney(account.feePerContract)}
              </div>
            </div>
          </div>

          <button
            className="mt-8 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            onClick={onOpenSettings}
          >
            修改账户设置
            <ArrowUpRight size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <button
            className="panel flex items-center gap-3 p-4 text-left transition-colors hover:bg-list"
            onClick={onNewNote}
          >
            <Wallet size={18} strokeWidth={1.5} className="shrink-0 text-muted" />
            <span className="flex-1">
              <span className="block text-sm font-medium text-ink">写下盘前计划</span>
              <span className="block text-xs text-muted">先定义风险，再找机会</span>
            </span>
            <ChevronRight size={16} strokeWidth={1.5} className="text-faint" />
          </button>
          <button
            className="panel flex items-center gap-3 p-4 text-left transition-colors hover:bg-list"
            onClick={onOpenSettings}
          >
            <Upload size={18} strokeWidth={1.5} className="shrink-0 text-muted" />
            <span className="flex-1">
              <span className="block text-sm font-medium text-ink">已有交易记录？</span>
              <span className="block text-xs text-muted">支持中英文表头的 CSV</span>
            </span>
            <ChevronRight size={16} strokeWidth={1.5} className="text-faint" />
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
      hint: stats.maxDdAbs ? `−${fmtMoney(stats.maxDdAbs, true)}` : '尚无回撤',
    },
  ]

  return (
    <div className="fade-in mx-auto max-w-6xl px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium text-ink">总览</h1>
          <p className="mt-2 text-sm text-muted">
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

      <section className="mt-6 rounded-xl border border-line bg-paper p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="section-label">账户权益</div>
            <div className="num mt-2 text-3xl font-medium text-ink">
              {fmtMoney(model.equity, true)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
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
          <div className="flex items-center gap-5 pt-1 text-xs text-faint">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 rounded bg-accent" />
              权益
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 rounded border-t border-dashed border-line-2" />
              30 日均线
            </span>
            <span className="num">{stats.count} 笔已平仓</span>
          </div>
        </div>
        <div className="mt-4">
          <EquityChart points={model.points} />
        </div>
      </section>

      <section className="mt-6 grid grid-cols-[1.4fr_1fr_1fr_1fr] divide-x divide-line rounded-xl border border-line bg-paper">
        {tiles.map((tile, index) => (
          <div key={tile.label} className="px-6 py-5">
            <div className="text-xs text-muted">{tile.label}</div>
            <div
              className={`num mt-2 truncate font-medium ${index === 0 ? 'text-2xl' : 'text-xl'} ${tile.tone}`}
            >
              {tile.value}
            </div>
            <div className="mt-1 truncate text-xs text-faint">{tile.hint}</div>
          </div>
        ))}
      </section>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="text-base font-medium text-ink">资金</h2>
          <div className="mt-4 grid grid-cols-2 gap-5">
            <div>
              <div className="text-xs text-muted">累计净入金</div>
              <div
                className={`num mt-2 text-lg font-medium ${
                  model.flow.net > 0 ? 'text-gain' : model.flow.net < 0 ? 'text-loss' : 'text-ink'
                }`}
              >
                {fmtSignedMoney(model.flow.net, true)}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-faint">
                入金 {fmtMoney(model.flow.deposits, true)} · 出金{' '}
                {fmtMoney(model.flow.withdrawals, true)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">今日已实现</div>
              <div
                className={`num mt-2 text-lg font-medium ${
                  model.risk.todayPnl > 0
                    ? 'text-gain'
                    : model.risk.todayPnl < 0
                      ? 'text-loss'
                      : 'text-ink'
                }`}
              >
                {fmtSignedMoney(model.risk.todayPnl, true)}
              </div>
              <div className="mt-1 text-xs text-faint">只计已平仓交易</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="text-base font-medium text-ink">风险</h2>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <div className="text-xs text-muted">每日亏损上限</div>
              <div
                className={`num mt-2 text-lg font-medium ${
                  model.risk.dailyLimitHit ? 'text-loss' : 'text-ink'
                }`}
              >
                {model.risk.dailyLimit > 0
                  ? fmtSignedMoney(-model.risk.dailyLimit, true)
                  : '未设置'}
              </div>
              <div className="mt-1 text-xs text-faint">
                {model.risk.dailyLimit > 0 ? '达到后停止开新仓' : '可在账户设置中配置'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">连续亏损</div>
              <div
                className={`num mt-2 text-lg font-medium ${
                  model.risk.streakHit ? 'text-loss' : 'text-ink'
                }`}
              >
                {model.risk.losingStreak} 笔
              </div>
              <div className="mt-1 text-xs text-faint">
                {model.risk.streakLimit > 0 ? `上限 ${model.risk.streakLimit} 笔` : '未设置上限'}
              </div>
            </div>
          </div>
        </section>
      </div>

      {riskAlerts.length ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-loss/25 bg-loss-soft px-4 py-3 text-sm leading-relaxed text-loss">
          <ShieldAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <span>{riskAlerts.join('；')}。建议停止开新仓，先复盘。</span>
        </div>
      ) : null}

      <div className="mt-6">
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

      <div className="mt-6 grid items-start grid-cols-[1.35fr_1fr] gap-4">
        <section className="rounded-xl border border-line bg-paper">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="text-base font-medium text-ink">持仓中</h2>
              <p className="mt-1 text-xs text-faint">
                {open.length ? `${open.length} 笔未平仓` : '当前没有持仓'}
              </p>
            </div>
            <button className="btn btn-ghost h-8 px-2.5 text-xs" onClick={onNewTrade}>
              <Plus size={14} strokeWidth={1.5} />
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
                    <div className="truncate text-sm font-medium text-ink">
                      {trade.symbol} · {trade.setup}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {fmtDateCN(trade.date)} {trade.entryTime} · {trade.qty} 手
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SideBadge side={trade.side} />
                    <Pnl value={trade.pnl} className="text-sm font-medium" />
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

        <section className="rounded-xl border border-line bg-paper p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">过程纪律</h2>
            <span className="num text-sm text-muted">{stats.execution.toFixed(0)}%</span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-sm bg-canvas">
            <div
              className="h-full rounded-sm bg-accent"
              style={{ width: `${Math.min(100, Math.max(0, stats.execution))}%` }}
            />
          </div>
          <div className="mt-5 space-y-4">
            {rates.map((rate) => (
                <div key={rate.key}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted">{rate.label}</span>
                    <span className="num shrink-0 text-ink-2">
                      {rate.count ? `${rate.pass.toFixed(0)}%` : '—'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-canvas">
                    <div
                      className="h-full rounded-sm bg-ink-2/40"
                      style={{ width: `${rate.pass}%` }}
                    />
                  </div>
                </div>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-faint">
            完全执行 {stats.clean} 笔，有偏差 {stats.flagged} 笔。
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-line bg-paper">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-base font-medium text-ink">最近交易</h2>
            <p className="mt-1 text-xs text-faint">按时间倒序</p>
          </div>
          <button className="btn btn-ghost h-8 px-2.5 text-xs" onClick={onOpenSettings}>
            数据与导入
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="divider" />
        {recent.length ? (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-faint">
                <th className="px-5 py-2.5 font-normal">日期</th>
                <th className="px-2 py-2.5 font-normal">交易</th>
                <th className="px-2 py-2.5 font-normal">形态</th>
                <th className="px-2 py-2.5 text-right font-normal">R</th>
                <th className="px-5 py-2.5 text-right font-normal">净盈亏</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((trade) => (
                <tr
                  key={trade.id}
                  className="cursor-pointer border-t border-line/70 text-sm transition-colors hover:bg-list"
                  onClick={() => onOpenTrade(trade.id)}
                >
                  <td className="whitespace-nowrap px-5 py-3 text-muted">
                    {fmtDateCN(trade.date)}
                  </td>
                  <td className="px-2 py-3">
                    <span className="font-medium text-ink">{trade.symbol}</span>
                    <span className="ml-2 text-xs text-faint">
                      {trade.side === 'L' ? '多' : '空'} {trade.qty}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-ink-2">{trade.setup}</td>
                  <td className="px-2 py-3 text-right">
                    <RValue value={trade.rMultiple} />
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
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
