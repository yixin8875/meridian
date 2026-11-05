import { useEffect, useState } from 'react'
import { Check, ListX, Pencil, Trash2 } from 'lucide-react'
import type { Trade } from '../types'
import { DISCIPLINE_ITEMS, pointValueOf } from '../data/contracts'
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
}: {
  trade: Trade | null
  onEdit: (trade: Trade) => void
  onDelete: (id: string) => void
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
    <div className="fade-in mx-auto max-w-[780px] px-8 py-7">
      <div className="flex items-start gap-3.5">
        <IconBadge symbol={trade.symbol} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
              {trade.symbol} · {trade.setup}
            </h1>
            <SideBadge side={trade.side} />
            <span
              className={`inline-flex h-5 items-center rounded px-1.5 text-[10.5px] ${
                trade.status === 'open'
                  ? 'bg-accent-soft text-accent'
                  : 'bg-list text-muted ring-1 ring-line'
              }`}
            >
              {trade.status === 'open' ? '持仓中' : '已平仓'}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-muted">
            {config.contracts.find((contract) => contract.symbol === trade.symbol)?.name ?? trade.symbol} · {fmtDateFullCN(trade.date)} ·{' '}
            {trade.entryTime}
            {trade.exitTime ? `–${trade.exitTime}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirm ? (
            <>
              <button
                className="btn btn-danger h-7 px-2.5 text-[11px]"
                onClick={() => onDelete(trade.id)}
              >
                确认删除
              </button>
              <button
                className="btn btn-secondary h-7 px-2.5 text-[11px]"
                onClick={() => setConfirm(false)}
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" onClick={() => onEdit(trade)} aria-label="编辑交易">
                <Pencil size={15} />
              </button>
              <button
                className="icon-btn hover:text-loss"
                onClick={() => setConfirm(true)}
                aria-label="删除交易"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">
            {trade.status === 'open' ? '浮动盈亏' : '已实现盈亏'}
          </div>
          <div
            className={`num mt-1 text-[30px] font-semibold tracking-[-0.02em] ${
              trade.pnl > 0 ? 'text-gain' : trade.pnl < 0 ? 'text-loss' : 'text-ink'
            }`}
          >
            {fmtSignedMoney(trade.pnl, true)}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">
            R 倍数
          </div>
          <RValue value={trade.rMultiple} className="mt-1 block text-[20px] font-medium" />
        </div>
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">
            计划风险
          </div>
          <div className="num mt-1 text-[20px] font-medium text-ink">
            ${fmtMoney(risk, false)}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">
            过程纪律
          </div>
          <div className="mt-1 text-[20px] font-medium text-ink">
            {passed}
            <span className="text-[13px] text-faint"> / {total}</span>
          </div>
        </div>
      </div>

      <div className="divider my-6" />

      <section>
        <h2 className="text-[12px] font-semibold text-ink">交易明细</h2>
        <div className="mt-3 grid grid-cols-4 gap-x-6 gap-y-5">
          <Metric label="方向">{trade.side === 'L' ? '做多' : '做空'}</Metric>
          <Metric label="手数">{trade.qty} 手</Metric>
          <Metric label="时段">{trade.session}</Metric>
          <Metric label="持仓时长">
            {trade.status === 'open' ? '持有中' : fmtDuration(hold)}
          </Metric>
          <Metric label="入场价">
            <span className="font-mono text-[13px]">{price(trade.entry)}</span>
          </Metric>
          <Metric label="止损价">
            <span className="font-mono text-[13px]">{price(trade.stop)}</span>
          </Metric>
          <Metric label="目标价">
            <span className="font-mono text-[13px]">{price(trade.target)}</span>
          </Metric>
          <Metric label={trade.status === 'open' ? '当前价' : '出场价'}>
            <span className="font-mono text-[13px]">{price(outPrice)}</span>
          </Metric>
          <Metric label="合约点值">${pointValue} / 点</Metric>
          <Metric label="手续费">${fmtMoney(trade.fees)}</Metric>
          <Metric label="交易评分">{trade.grade} 级</Metric>
          <Metric label="盈亏">{trade.pnl >= 0 ? '盈利' : '亏损'}</Metric>
        </div>
      </section>

      {trade.charts?.length ? (
        <>
          <div className="divider my-6" />
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-[12px] font-semibold text-ink">K 线图</h2>
              <span className="text-[10.5px] text-faint">
                {trade.charts.length} 张 · 点击放大，← → 切换
              </span>
            </div>
            <ChartGallery items={trade.charts} />
          </section>
        </>
      ) : null}

      <div className="divider my-6" />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold text-ink">过程纪律</h2>
          <span className="text-[10.5px] text-faint">记录“做对了什么”，而不只是盈亏</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {DISCIPLINE_ITEMS.map((item) => {
            const ok = trade.discipline[item.key]
            return (
              <div
                key={item.key}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[11.5px] ${
                  ok
                    ? 'border-line bg-list text-ink-2'
                    : 'border-loss/20 bg-loss-soft/60 text-loss'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    ok ? 'bg-gain text-white' : 'bg-loss text-white'
                  }`}
                >
                  {ok ? <Check size={10} strokeWidth={3} /> : <span className="text-[9px]">×</span>}
                </span>
                {item.label}
              </div>
            )
          })}
        </div>
      </section>

      <div className="divider my-6" />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold text-ink">错误标签</h2>
          <span className="text-[10.5px] text-faint">
            {trade.mistakes?.length ? `${trade.mistakes.length} 项` : '未标记过程错误'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {trade.mistakes?.length ? (
            trade.mistakes.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-6 items-center rounded-full border border-loss/20 bg-loss-soft px-2.5 text-[10.5px] text-loss"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-faint">这笔交易没有记录明确的过程错误。</span>
          )}
        </div>
      </section>

      <div className="divider my-6" />

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold text-ink">复盘备注</h2>
          <span className="text-[10.5px] text-faint">{trade.setup}</span>
        </div>
        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-list px-3.5 py-3 text-[12px] leading-6 text-ink-2">
          {trade.note || <span className="text-faint">没有记录备注。</span>}
        </div>
      </section>

      <div className="mt-8 rounded-lg bg-list px-3.5 py-3 text-[10.5px] leading-relaxed text-faint">
        净盈亏已扣除手续费。R 倍数 = 毛盈亏 ÷ 计划风险（|入场价 − 止损价| × 点值 × 手数）。
      </div>
    </div>
  )
}
