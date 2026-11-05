import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle } from 'lucide-react'
import type { JournalNote, ListFilter, Page, Trade } from './types'
import { StoreProvider, useApp } from './store'
import { AppShell } from './components/Shell'
import { TradeList } from './components/TradeList'
import { TradeDetail } from './components/TradeDetail'
import { TradeForm } from './components/TradeForm'
import { NoteList } from './components/NoteList'
import { NoteDetail } from './components/NoteDetail'
import { Overview } from './views/Overview'
import { Mirror } from './views/Mirror'
import { Settings } from './views/Settings'
import { UpdateBanner } from './components/UpdateBanner'
import { closedTrades, sortTrades } from './lib/stats'

const PAGES: Page[] = ['overview', 'trades', 'mirror', 'notes', 'settings']

function routeFromHash(): Page {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return (PAGES as string[]).includes(raw) ? (raw as Page) : 'overview'
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  )
}

function Workspace() {
  const {
    account,
    trades,
    notes,
    ready,
    saving,
    error,
    setError,
    updateTrade,
    addTrade,
    deleteTrade,
    addNote,
    updateNote,
    deleteNote,
    loadDemo,
  } = useApp()

  const [page, setPage] = useState<Page>(routeFromHash)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ListFilter>('all')
  const [dateFilter, setDateFilter] = useState<string | null>(null)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [creatingNote, setCreatingNote] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Trade | null>(null)

  useEffect(() => {
    const onHash = () => setPage(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((next: Page) => {
    setPage(next)
    const hash = `#/${next}`
    if (window.location.hash !== hash) window.location.hash = hash
  }, [])

  const openNewTrade = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const openEditTrade = useCallback((trade: Trade) => {
    setEditing(trade)
    setFormOpen(true)
  }, [])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditing(null)
  }, [])

  const openTrade = useCallback(
    (id: string) => {
      setCreatingNote(false)
      setSelectedTradeId(id)
      setFilter('all')
      setDateFilter(null)
      navigate('trades')
    },
    [navigate],
  )

  const openTradeDate = useCallback(
    (date: string) => {
      const first = [...trades].filter((trade) => trade.date === date).sort(sortTrades)[0]
      setDateFilter(date)
      setQuery('')
      setFilter('all')
      setSelectedTradeId(first ? first.id : null)
      navigate('trades')
    },
    [trades, navigate],
  )

  const openNewNote = useCallback(() => {
    setCreatingNote(true)
    setSelectedNoteId(null)
    navigate('notes')
  }, [navigate])

  const openNote = useCallback(
    (id: string) => {
      setCreatingNote(false)
      setSelectedNoteId(id)
    },
    [],
  )

  const submitTrade = useCallback(
    (trade: Trade) => {
      if (editing) updateTrade(trade)
      else addTrade(trade)
      setFormOpen(false)
      setEditing(null)
      setSelectedTradeId(trade.id)
      setDateFilter(null)
      navigate('trades')
    },
    [editing, addTrade, updateTrade, navigate],
  )

  const removeTrade = useCallback(
    (id: string) => {
      deleteTrade(id)
      setSelectedTradeId((current) => (current === id ? null : current))
    },
    [deleteTrade],
  )

  const submitNote = useCallback(
    (note: JournalNote) => {
      if (notes.some((item) => item.id === note.id)) updateNote(note)
      else addNote(note)
      setCreatingNote(false)
      setSelectedNoteId(note.id)
      navigate('notes')
    },
    [notes, addNote, updateNote, navigate],
  )

  const removeNote = useCallback(
    (id: string) => {
      deleteNote(id)
      setSelectedNoteId((current) => (current === id ? null : current))
    },
    [deleteNote],
  )

  const onQuery = useCallback(
    (value: string) => {
      setQuery(value)
      if (value.trim()) setDateFilter(null)
      if (value.trim() && page !== 'trades' && page !== 'notes') navigate('trades')
    },
    [page, navigate],
  )

  useEffect(() => {
    if (page !== 'trades') return
    if (selectedTradeId && trades.some((trade) => trade.id === selectedTradeId)) return
    const first = [...trades].sort(sortTrades).reverse()[0]
    setSelectedTradeId(first ? first.id : null)
  }, [page, trades, selectedTradeId])

  useEffect(() => {
    if (page !== 'notes' || creatingNote) return
    if (selectedNoteId && notes.some((note) => note.id === selectedNoteId)) return
    const first = [...notes].sort((a, b) => b.date.localeCompare(a.date))[0]
    setSelectedNoteId(first ? first.id : null)
  }, [page, notes, selectedNoteId, creatingNote])

  const setups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const trade of closedTrades(trades)) {
      counts.set(trade.setup, (counts.get(trade.setup) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [trades])

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-[0_4px_16px_rgba(11,108,240,0.3)]">
          <Activity size={22} strokeWidth={2.2} />
        </span>
        <span className="text-[11px] tracking-[0.14em] text-faint">MERIDIAN</span>
        <span className="text-[11px] text-muted">正在读取本机数据…</span>
      </div>
    )
  }

  const selectedTrade = trades.find((trade) => trade.id === selectedTradeId) ?? null
  const selectedNote = creatingNote
    ? null
    : (notes.find((note) => note.id === selectedNoteId) ?? null)

  const list =
    page === 'trades' ? (
      <TradeList
        trades={trades}
        selectedId={selectedTradeId}
        onSelect={setSelectedTradeId}
        onNew={openNewTrade}
        query={query}
        filter={filter}
        onFilter={setFilter}
        date={dateFilter}
        onClearDate={() => setDateFilter(null)}
      />
    ) : page === 'notes' ? (
      <NoteList
        notes={notes}
        selectedId={selectedNoteId}
        onSelect={openNote}
        onNew={openNewNote}
        query={query}
      />
    ) : undefined

  return (
    <>
      <AppShell
        page={page}
        onNavigate={navigate}
        onNewTrade={openNewTrade}
        onQuery={onQuery}
        query={query}
        tradeCount={trades.length}
        openCount={trades.filter((trade) => trade.status === 'open').length}
        noteCount={notes.length}
        setups={setups}
        saving={saving}
        list={list}
      >
        {error ? (
          <div className="flex items-center gap-2 border-b border-loss/20 bg-loss-soft px-5 py-2 text-[11.5px] text-loss">
            <AlertCircle size={13} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{error}</span>
            <button className="shrink-0 hover:underline" onClick={() => setError(null)}>
              忽略
            </button>
          </div>
        ) : null}

        {page === 'overview' ? (
          <Overview
            onNewTrade={openNewTrade}
            onOpenTrade={openTrade}
            onOpenSettings={() => navigate('settings')}
            onLoadDemo={loadDemo}
            onNewNote={openNewNote}
            onOpenDate={openTradeDate}
          />
        ) : null}
        {page === 'trades' ? (
          <TradeDetail trade={selectedTrade} onEdit={openEditTrade} onDelete={removeTrade} />
        ) : null}
        {page === 'mirror' ? <Mirror /> : null}
        {page === 'notes' ? (
          <NoteDetail
            note={selectedNote}
            creating={creatingNote}
            accountId={account.id}
            onSave={submitNote}
            onDelete={removeNote}
            onCancelCreate={() => setCreatingNote(false)}
          />
        ) : null}
        {page === 'settings' ? <Settings /> : null}
      </AppShell>

      <UpdateBanner />

      <TradeForm
        open={formOpen}
        trade={editing}
        accountId={account.id}
        feePerContract={account.feePerContract}
        onClose={closeForm}
        onSubmit={submitTrade}
      />
    </>
  )
}
