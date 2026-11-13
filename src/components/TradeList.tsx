import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Image as ImageIcon,
  Plus,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react'
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [symbolFilter, setSymbolFilter] = useState('all')
  const [setupFilter, setSetupFilter] = useState('all')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const activeFilters = [
    symbolFilter !== 'all',
    setupFilter !== 'all',
    sessionFilter !== 'all',
    Boolean(fromDate),
    Boolean(toDate),
  ].filter(Boolean).length

  const clearFilters = () => {
    setSymbolFilter('all')
    setSetupFilter('all')
    setSessionFilter('all')
    setFromDate('')
    setToDate('')
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = trades.filter((trade) => {
      if (date && trade.date !== date) return false
      if (filter !== 'all' && trade.status !== filter) return false
      if (symbolFilter !== 'all' && trade.symbol !== symbolFilter) return false
      if (setupFilter !== 'all' && trade.setup !== setupFilter) return false
      if (sessionFilter !== 'all' && trade.session !== sessionFilter) return false
      if (fromDate && trade.date < fromDate) return false
      if (toDate && trade.date > toDate) return false
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
  }, [
    trades,
    query,
    filter,
    config.contracts,
    date,
    symbolFilter,
    setupFilter,
    sessionFilter,
    fromDate,
    toDate,
  ])

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <div>
          <h1 className="text-base font-medium text-ink">交易台账</h1>
          <p className="mt-1 text-xs text-muted">
            {groups.total} 笔
            {date ? ` · ${fmtDateCN(date)}` : query ? ` · 搜索“${query}”` : ''}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className={`icon-btn relative ${filtersOpen || activeFilters ? 'text-accent' : ''}`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-label="筛选交易"
            aria-expanded={filtersOpen}
            title="按合约、形态、时段与日期筛选"
          >
            <SlidersHorizontal size={16} strokeWidth={1.5} />
            {activeFilters ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-accent px-1 text-xs font-medium text-paper">
                {activeFilters}
              </span>
            ) : null}
          </button>
          <button className="icon-btn" onClick={onNew} aria-label="记录交易">
            <Plus size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-4 py-2.5">
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
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-accent/25 bg-accent-soft px-2 text-xs font-medium text-accent transition-colors hover:border-accent/45"
            onClick={onClearDate}
            aria-label="清除日期筛选"
          >
            <CalendarDays size={12} strokeWidth={1.5} />
            {fmtDateCN(date)}
            <X size={12} strokeWidth={1.5} />
          </button>
        ) : null}
        <span className="ml-auto font-mono text-xs text-faint">{groups.total} 条</span>
      </div>

      {filtersOpen ? (
        <div className="shrink-0 space-y-2 border-b border-line bg-paper px-3 py-2.5">
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="mb-1 block text-xs text-muted">合约</span>
              <select
                className="input h-8 px-2 py-0 text-xs"
                value={symbolFilter}
                onChange={(event) => setSymbolFilter(event.target.value)}
              >
                <option value="all">全部</option>
                {config.contracts.map((contract) => (
                  <option key={contract.symbol} value={contract.symbol}>
                    {contract.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">形态</span>
              <select
                className="input h-8 px-2 py-0 text-xs"
                value={setupFilter}
                onChange={(event) => setSetupFilter(event.target.value)}
              >
                <option value="all">全部</option>
                {config.setups.map((setup) => (
                  <option key={setup} value={setup}>
                    {setup}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">时段</span>
              <select
                className="input h-8 px-2 py-0 text-xs"
                value={sessionFilter}
                onChange={(event) => setSessionFilter(event.target.value)}
              >
                <option value="all">全部</option>
                {config.sessions.map((session) => (
                  <option key={session} value={session}>
                    {session}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
            <label>
              <span className="mb-1 block text-xs text-muted">开始日期</span>
              <input
                type="date"
                className="input h-8 px-2 py-0 text-xs"
                max={toDate || undefined}
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <span className="pb-1.5 text-xs text-faint">至</span>
            <label>
              <span className="mb-1 block text-xs text-muted">结束日期</span>
              <input
                type="date"
                className="input h-8 px-2 py-0 text-xs"
                min={fromDate || undefined}
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint">
              {activeFilters ? `已启用 ${activeFilters} 项筛选` : '选择条件后自动生效'}
            </span>
            <button
              className="text-xs text-accent hover:underline disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
              onClick={clearFilters}
              disabled={!activeFilters}
            >
              清除筛选
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.entries.map(([date, items]) => (
          <section key={date}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-list/95 px-2 pb-1.5 pt-4 text-xs text-muted backdrop-blur-sm">
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
                      <span className="truncate text-sm font-medium text-ink">
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
                          size={12}
                          strokeWidth={1.5}
                          className="shrink-0 text-faint"
                          aria-label={`${trade.charts.length} 张 K 线图`}
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted">
                      {trade.entryTime}
                      {trade.exitTime ? `–${trade.exitTime}` : ''} · {trade.qty} 手 ·{' '}
                      {trade.side === 'L' ? '多' : '空'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Pnl value={trade.pnl} className="block text-sm font-medium" />
                    <RValue value={trade.rMultiple} className="mt-1 block text-xs" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}

        {!groups.entries.length ? (
          <EmptyState
            icon={<SearchX size={18} />}
            title={
              date
                ? '这一天没有交易'
                : query
                  ? '没有匹配的交易'
                  : activeFilters
                    ? '没有匹配筛选的交易'
                    : '还没有交易记录'
            }
            description={
              date
                ? '清除日期筛选可以查看全部交易。'
                : query
                  ? '换一个合约、形态或日期试试。'
                  : activeFilters
                    ? '调整或清除筛选条件后再试。'
                    : '记录第一笔交易后，这里会按日期整理你的决策。'
            }
            action={
              date ? (
                <button className="btn btn-secondary" onClick={onClearDate}>
                  查看全部交易
                </button>
              ) : activeFilters ? (
                <button className="btn btn-secondary" onClick={clearFilters}>
                  清除筛选
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
