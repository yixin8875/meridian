import { useMemo } from 'react'
import { CalendarDays, Image as ImageIcon, Plus, SearchX, X } from 'lucide-react'
import type { ListFilter, Trade } from '../types'
import { useApp } from '../store'
import { fmtDateCN, weekdayCN } from '../lib/format'
import { EmptyState, IconBadge, Pnl, RValue } from './primitives'

export function TradeList({
  trades,
  selectedId,
  onSelect,
  onNew,
  query,
  filter,
  onFilter,
  date,
  onClearDate,
}: {
  trades: Trade[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  query: string
  filter: ListFilter
  onFilter: (filter: ListFilter) => void
  date: string | null
  onClearDate: () => void
}) {
  const { config } = useApp()
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = trades.filter((trade) => {
      if (date && trade.date !== date) return false
      if (filter !== 'all' && trade.status !== filter) return false
      if (!q) return true
      const haystack = [
        trade.symbol,
        trade.setup,
        trade.note,
        trade.date,
        trade.session,
        trade.side === 'L' ? '多' : '空',
        config.contracts.find((contract) => contract.symbol === trade.symbol)?.name ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
    const sorted = [...filtered].sort((a, b) =>
      `${b.date} ${b.entryTime}`.localeCompare(`${a.date} ${a.entryTime}`),
    )
    const map = new Map<string, Trade[]>()
    for (const trade of sorted) {
      const list = map.get(trade.date) ?? []
      list.push(trade)
      map.set(trade.date, list)
    }
    return { total: filtered.length, entries: [...map.entries()] }
  }, [trades, query, filter, config.contracts, date])

  return (
    <>
      <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-line px-3">
        <div>
          <h1 className="text-[13px] font-semibold text-ink">交易台账</h1>
          <p className="mt-0.5 text-[10.5px] text-muted">
            {groups.total} 笔
            {date ? ` · ${fmtDateCN(date)}` : query ? ` · 搜索“${query}”` : ''}
          </p>
        </div>
        <button className="icon-btn" onClick={onNew} aria-label="记录交易">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-2">
        <div className="seg">
          {(
            [
              ['all', '全部'],
              ['open', '持仓中'],
              ['closed', '已平仓'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} data-active={filter === value} onClick={() => onFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        {date ? (
          <button
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2 text-[10.5px] font-medium text-accent transition-colors hover:border-accent/45"
            onClick={onClearDate}
            aria-label="清除日期筛选"
          >
            <CalendarDays size={10} />
            {fmtDateCN(date)}
            <X size={10} />
          </button>
        ) : null}
        <span className="ml-auto text-[10px] text-faint">{groups.total} 条</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.entries.map(([date, items]) => (
          <section key={date}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-list/95 px-2 pb-1 pt-3 text-[10.5px] font-medium text-faint backdrop-blur">
              <span>
                {fmtDateCN(date)} · {weekdayCN(date)}
              </span>
              <span className="num">{items.length} 笔</span>
            </div>
            <div className="space-y-0.5">
              {items.map((trade) => (
                <button
                  key={trade.id}
                  className={`list-row ${selectedId === trade.id ? 'list-row-active' : ''}`}
                  onClick={() => onSelect(trade.id)}
                >
                  <IconBadge symbol={trade.symbol} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-ink">
                        {trade.symbol} · {trade.setup}
                      </span>
                      {trade.status === 'open' ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          title="持仓中"
                        />
                      ) : null}
                      {trade.charts?.length ? (
                        <ImageIcon
                          size={11}
                          className="shrink-0 text-faint"
                          aria-label={`${trade.charts.length} 张 K 线图`}
                        />
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-[10.5px] text-muted">
                      {trade.entryTime}
                      {trade.exitTime ? `–${trade.exitTime}` : ''} · {trade.qty} 手 ·{' '}
                      {trade.side === 'L' ? '多' : '空'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Pnl value={trade.pnl} className="block text-[12px] font-medium" />
                    <RValue value={trade.rMultiple} className="mt-0.5 block text-[10.5px]" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}

        {!groups.entries.length ? (
          <EmptyState
            icon={<SearchX size={18} />}
            title={date ? '这一天没有交易' : query ? '没有匹配的交易' : '还没有交易记录'}
            description={
              date
                ? '清除日期筛选可以查看全部交易。'
                : query
                  ? '换一个合约、形态或日期试试。'
                  : '记录第一笔交易后，这里会按日期整理你的决策。'
            }
            action={
              date ? (
                <button className="btn btn-secondary" onClick={onClearDate}>
                  查看全部交易
                </button>
              ) : !query ? (
                <button className="btn btn-primary" onClick={onNew}>
                  <Plus size={14} />
                  记录第一笔
                </button>
              ) : null
            }
          />
        ) : null}
      </div>
    </>
  )
}
