import { useEffect, useRef, type ReactNode } from 'react'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  LayoutGrid,
  List,
  Plus,
  ScanSearch,
  Search,
  Settings,
  X,
} from 'lucide-react'
import type { Page } from '../types'
import { AccountMenu } from './AccountMenu'
import { MeridianMark } from './primitives'

const NAV: { key: Page; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'overview', label: '总览', icon: LayoutGrid },
  { key: 'trades', label: '交易台账', icon: List },
  { key: 'mirror', label: '镜像分析', icon: ScanSearch },
  { key: 'notes', label: '复盘笔记', icon: BookOpen },
]

export function AppShell({
  page,
  onNavigate,
  onNewTrade,
  onQuery,
  query,
  tradeCount,
  openCount,
  noteCount,
  setups,
  saving,
  unsaved,
  list,
  children,
}: {
  page: Page
  onNavigate: (page: Page) => void
  onNewTrade: () => void
  onQuery: (value: string) => void
  query: string
  tradeCount: number
  openCount: number
  noteCount: number
  setups: { name: string; count: number }[]
  saving: boolean
  unsaved: boolean
  list?: ReactNode
  children: ReactNode
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [page])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <MeridianMark size={20} className="shrink-0 text-ink" />
          <span className="text-base font-medium tracking-wide text-ink">MERIDIAN</span>
        </div>

        <div className="px-2.5 pb-2">
          <AccountMenu onManage={() => onNavigate('settings')} />
        </div>

        <nav className="space-y-0.5 px-2.5">
          {NAV.map((item) => {
            const Icon = item.icon
            const count =
              item.key === 'trades' ? tradeCount : item.key === 'notes' ? noteCount : undefined
            return (
              <button
                key={item.key}
                className={`nav-row ${page === item.key ? 'nav-row-active' : ''}`}
                onClick={() => onNavigate(item.key)}
                aria-current={page === item.key ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
                <span className="flex-1">{item.label}</span>
                {count !== undefined ? (
                  <span className="font-mono text-xs tabular-nums text-faint">{count}</span>
                ) : null}
                {item.key === 'trades' && openCount > 0 ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-accent"
                    title={`${openCount} 笔持仓`}
                  />
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="mt-6 px-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="section-label">形态</span>
            <span className="font-mono text-xs text-faint">{setups.length}</span>
          </div>
          <div className="space-y-0.5">
            {setups.slice(0, 5).map((setup, index) => (
              <button
                key={setup.name}
                className="nav-row h-8"
                onClick={() => {
                  onQuery(setup.name)
                  onNavigate('trades')
                }}
              >
                <span className="w-5 shrink-0 font-mono text-xs text-faint">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 truncate text-sm text-ink-2">{setup.name}</span>
                <span className="font-mono text-xs text-faint">{setup.count}</span>
              </button>
            ))}
            {!setups.length ? (
              <p className="px-2 py-2 text-xs text-faint">记录交易后自动汇总</p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto px-2.5 pb-3">
          <div className="mx-2 mb-2 flex items-center gap-1.5 text-xs text-faint">
            <span
              className={`h-1.5 w-1.5 rounded-full ${saving || unsaved ? 'bg-warn' : 'bg-gain'}`}
            />
            {saving ? '保存中' : unsaved ? '有未保存更改' : '自动保存已开启'}
          </div>
          <button
            className={`nav-row ${page === 'settings' ? 'nav-row-active' : ''}`}
            onClick={() => onNavigate('settings')}
          >
            <Settings size={16} strokeWidth={1.5} className="text-muted" />
            设置
          </button>
          <div className="mt-1 flex items-center gap-2 px-2 py-1 text-xs text-faint">
            <Database size={14} strokeWidth={1.5} />
            本地文件
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-sidebar px-4">
          <div className="flex items-center gap-0.5 text-faint">
            <button className="icon-btn h-8 w-8" aria-label="返回" onClick={() => history.back()}>
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <button className="icon-btn h-8 w-8" aria-label="前进" onClick={() => history.forward()}>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <Search
              size={16}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-paper pl-9 pr-24 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
              placeholder="搜索"
            />
            {query ? (
              <button
                className="absolute right-12 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-faint hover:bg-hover hover:text-ink"
                onClick={() => onQuery('')}
                aria-label="清除搜索"
              >
                <X size={14} />
              </button>
            ) : null}
            <span className="kbd absolute right-2.5 top-1/2 -translate-y-1/2">
              {isMac ? '⌘K' : 'Ctrl K'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              className="icon-btn hidden xl:inline-flex"
              aria-label="关于"
              onClick={() => onNavigate('settings')}
            >
              <CircleHelp size={16} strokeWidth={1.5} />
            </button>
            <button className="btn btn-primary" onClick={onNewTrade}>
              <Plus size={16} strokeWidth={1.5} />
              记录交易
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {list ? (
            <div className="flex w-84 shrink-0 flex-col border-r border-line bg-list">
              {list}
            </div>
          ) : null}
          <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto bg-paper">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
