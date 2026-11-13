import { useEffect, useState } from 'react'
import { Check, ListX, Pencil, Trash2 } from 'lucide-react'
import type { Trade } from '../types'
import { pointValueOf } from '../data/contracts'
import { useApp } from '../store'
import { fmtDateFullCN, fmtDuration, fmtMoney, fmtSignedMoney, minutesOf } from '../lib/format'
import { EmptyState, IconBadge, Metric, RValue, SideBadge } from './primitives'
import { ChartGallery } from './Charts'

function price(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function TradeDetail({
  trade,
  onEdit,
  onDelete,
  onUpdate,
}: {
  trade: Trade | null
  onEdit: (trade: Trade) => void
  onDelete: (id: string) => void
  onUpdate: (trade: Trade) => void
}) {
  const { config } = useApp()
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    setConfirm(false)
  }, [trade?.id])

  if (!trade) {
    return (
      <EmptyState
        icon={<ListX size={18} />}
        title="选择一笔交易"
        description="在左侧列表中点击任意交易，查看价格、风险与过程纪律。"
      />
    )
  }

  const pointValue = pointValueOf(trade.symbol, config.contracts)
  const risk = Math.abs(trade.entry - trade.stop) * pointValue * trade.qty
  const entryMinutes = minutesOf(trade.entryTime)
  const exitMinutes = minutesOf(trade.exitTime)
  const hold =
    entryMinutes !== null && exitMinutes !== null && exitMinutes >= entryMinutes
      ? exitMinutes - entryMinutes
      : 0
  const outPrice = trade.status === 'open' ? trade.current : trade.exit
  const passed = Object.values(trade.discipline).filter(Boolean).length
  const total = Object.values(trade.discipline).length

  return (
    <div className="fade-in mx-auto max-w-4xl px-8 py-8">
      <div className="flex items-start gap-4">
        <IconBadge symbol={trade.symbol} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-medium text-ink xl:text-3xl">
              {trade.symbol} · {trade.setup}
            </h1>
            <SideBadge side={trade.side} />
            <span
              className={`inline-flex h-6 items-center rounded-md px-2 text-xs ${
                trade.status === 'open'
                  ? 'bg-accent-soft text-accent'
                  : 'bg-list text-muted ring-1 ring-line'
              }`}
            >
              {trade.status === 'open' ? '持仓中' : '已平仓'}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {config.contracts.find((contract) => contract.symbol === trade.symbol)?.name ?? trade.symbol} · {fmtDateFullCN(trade.date)} ·{' '}
            {trade.entryTime}
            {trade.exitTime ? `–${trade.exitTime}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirm ? (
            <>
              <button
                className="btn btn-danger h-8 px-2.5 text-xs"
                onClick={() => onDelete(trade.id)}
              >
                确认删除
              </button>
              <button
                className="btn btn-secondary h-8 px-2.5 text-xs"
                onClick={() => setConfirm(false)}
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" onClick={() => onEdit(trade)} aria-label="编辑交易">
                <Pencil size={16} strokeWidth={1.5} />
              </button>
              <button
                className="icon-btn hover:text-loss"
                onClick={() => setConfirm(true)}
                aria-label="删除交易"
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border border-line bg-canvas/50 px-5 py-5 xl:grid-cols-4 xl:gap-0 xl:divide-x xl:divide-line xl:px-6">
        <div className="xl:pr-5">
          <div className="text-xs text-muted">
            {trade.status === 'open' ? '浮动盈亏' : '已实现盈亏'}
          </div>
          <div
            className={`num mt-2 text-2xl font-medium ${
              trade.pnl > 0 ? 'text-gain' : trade.pnl < 0 ? 'text-loss' : 'text-ink'
            }`}
          >
            {fmtSignedMoney(trade.pnl, true)}
          </div>
        </div>
        <div className="xl:px-5">
          <div className="text-xs text-muted">R 倍数</div>
          <RValue value={trade.rMultiple} className="mt-2 block text-2xl font-medium" />
        </div>
        <div className="xl:px-5">
          <div className="text-xs text-muted">计划风险</div>
          <div className="num mt-2 text-xl font-medium text-ink">
            {fmtMoney(risk, true)}
          </div>
        </div>
        <div className="xl:pl-5">
          <div className="text-xs text-muted">过程纪律</div>
          <div className="mt-2 text-xl font-medium text-ink">
            {passed}
            <span className="text-sm text-faint"> / {total}</span>
          </div>
        </div>
      </div>

      <div className="divider my-8" />

      <section>
        <h2 className="text-base font-medium text-ink">交易明细</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4 xl:gap-y-6">
          <Metric label="方向">{trade.side === 'L' ? '做多' : '做空'}</Metric>
          <Metric label="手数">{trade.qty} 手</Metric>
          <Metric label="时段">{trade.session}</Metric>
          <Metric label="持仓时长">
            {trade.status === 'open' ? '持有中' : fmtDuration(hold)}
          </Metric>
          <Metric label="入场价">
            <span className="font-mono text-sm">{price(trade.entry)}</span>
          </Metric>
          <Metric label="止损价">
            <span className="font-mono text-sm">{price(trade.stop)}</span>
          </Metric>
          <Metric label="目标价">
            <span className="font-mono text-sm">{price(trade.target)}</span>
          </Metric>
          <Metric label={trade.status === 'open' ? '当前价' : '出场价'}>
            <span className="font-mono text-sm">{price(outPrice)}</span>
          </Metric>
          <Metric label="合约点值">{fmtMoney(pointValue, true)} / 点</Metric>
          <Metric label="手续费">{fmtMoney(trade.fees)}</Metric>
          <Metric label="交易评分">{trade.grade} 级</Metric>
          <Metric label="盈亏">{trade.pnl >= 0 ? '盈利' : '亏损'}</Metric>
          {trade.maeR > 0 ? (
            <Metric label="最大不利偏移">
              <span className="text-loss">−{trade.maeR.toFixed(2)}R</span>
            </Metric>
          ) : null}
          {trade.mfeR > 0 ? (
            <Metric label="最大有利偏移">
              <span className="text-gain">+{trade.mfeR.toFixed(2)}R</span>
            </Metric>
          ) : null}
        </div>
      </section>

      {trade.charts?.length ? (
        <>
          <div className="divider my-8" />
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-ink">K 线图</h2>
              <span className="text-xs text-faint">
                {trade.charts.length} 张 · 点击放大，← → 切换
              </span>
            </div>
            <ChartGallery
              items={trade.charts}
              onChartChange={(next) =>
                onUpdate({
                  ...trade,
                  charts: trade.charts.map((chart) => (chart.id === next.id ? next : chart)),
                })
              }
            />
          </section>
        </>
      ) : null}

      <div className="divider my-8" />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">过程纪律</h2>
          <span className="text-xs text-faint">记录“做对了什么”，而不只是盈亏</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {config.disciplineItems.map((item) => {
            const ok = Boolean(trade.discipline[item.id])
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
                  ok
                    ? 'border-line bg-list text-ink-2'
                    : 'border-loss/20 bg-loss-soft/60 text-loss'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${
                    ok ? 'bg-gain text-paper' : 'bg-loss text-paper'
                  }`}
                >
                  {ok ? <Check size={11} strokeWidth={2.5} /> : <span className="text-xs">×</span>}
                </span>
                {item.label}
              </div>
            )
          })}
        </div>
      </section>

      <div className="divider my-8" />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">错误标签</h2>
          <span className="text-xs text-faint">
            {trade.mistakes?.length ? `${trade.mistakes.length} 项` : '未标记过程错误'}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {trade.mistakes?.length ? (
            trade.mistakes.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-7 items-center rounded-md border border-loss/20 bg-loss-soft px-2.5 text-xs text-loss"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-sm text-faint">这笔交易没有记录明确的过程错误。</span>
          )}
        </div>
      </section>

      <div className="divider my-8" />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">复盘备注</h2>
          <span className="text-xs text-faint">{trade.setup}</span>
        </div>
        <div className="mt-4 whitespace-pre-wrap rounded-lg border border-line bg-list px-4 py-3.5 text-sm leading-7 text-ink-2">
          {trade.note || <span className="text-faint">没有记录备注。</span>}
        </div>
      </section>

      <div className="mt-8 rounded-lg bg-list px-4 py-3 text-xs leading-relaxed text-faint">
        净盈亏已扣除手续费。R 倍数 = 毛盈亏 ÷ 计划风险（|入场价 − 止损价| × 点值 × 手数）。
      </div>
    </div>
  )
}
