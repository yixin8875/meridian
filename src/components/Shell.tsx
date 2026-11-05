import { useEffect, useRef, type ReactNode } from 'react'
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import type { Page } from '../types'
import { AccountMenu } from './AccountMenu'

const NAV: { key: Page; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'overview', label: '总览', icon: LayoutGrid },
  { key: 'trades', label: '交易台账', icon: List },
  { key: 'mirror', label: '镜像分析', icon: Sparkles },
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
      <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex h-[54px] items-center gap-2.5 px-4">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-accent text-white shadow-[0_1px_2px_rgba(11,108,240,0.35)]">
            <Activity size={17} strokeWidth={2.2} />
          </span>
          <span className="text-[13.5px] font-semibold tracking-[0.12em] text-ink">MERIDIAN</span>
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
                <Icon size={15} strokeWidth={1.8} className="shrink-0 text-muted" />
                <span className="flex-1">{item.label}</span>
                {count !== undefined ? (
                  <span className="text-[10.5px] tabular-nums text-faint">{count}</span>
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

        <div className="mt-5 px-3">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="section-label">形态</span>
            <span className="text-[10px] text-faint">{setups.length}</span>
          </div>
          <div className="space-y-0.5">
            {setups.slice(0, 5).map((setup, index) => (
              <button
                key={setup.name}
                className="nav-row h-7"
                onClick={() => {
                  onQuery(setup.name)
                  onNavigate('trades')
                }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: ['#0b6cf0', '#7c5cd6', '#2c8f72', '#c47a32', '#c0524c'][index],
                  }}
                />
                <span className="flex-1 truncate text-[11.5px] text-ink-2">{setup.name}</span>
                <span className="text-[10.5px] text-faint">{setup.count}</span>
              </button>
            ))}
            {!setups.length ? (
              <p className="px-2 py-2 text-[11px] text-faint">记录交易后自动汇总</p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto px-2.5 pb-3">
          <div className="mx-1 mb-2 flex items-center gap-1.5 text-[10px] text-faint">
            <span
              className={`h-1.5 w-1.5 rounded-full ${saving || unsaved ? 'bg-warn' : 'bg-gain'}`}
            />
            {saving ? '正在保存…' : unsaved ? '有未保存更改' : '自动保存已开启'}
          </div>
          <button
            className={`nav-row ${page === 'settings' ? 'nav-row-active' : ''}`}
            onClick={() => onNavigate('settings')}
          >
            <Settings size={15} strokeWidth={1.8} className="text-muted" />
            设置
          </button>
          <div className="mt-1 flex items-center gap-1.5 px-2 py-1 text-[9.5px] text-faint">
            <Database size={11} />
            Rust · 本地文件
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-list px-3">
          <div className="flex items-center gap-0.5 text-faint">
            <button className="icon-btn h-7 w-7" aria-label="返回" onClick={() => history.back()}>
              <ChevronLeft size={15} />
            </button>
            <button className="icon-btn h-7 w-7" aria-label="前进" onClick={() => history.forward()}>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="relative mx-auto w-full max-w-[560px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              className="h-8 w-full rounded-md border border-line bg-white pl-8 pr-20 text-[12px] text-ink outline-none transition placeholder:text-faint focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
              placeholder="搜索交易、笔记或形态"
            />
            {query ? (
              <button
                className="absolute right-12 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-faint hover:bg-hover hover:text-ink"
                onClick={() => onQuery('')}
                aria-label="清除搜索"
              >
                <X size={12} />
              </button>
            ) : null}
            <span className="kbd absolute right-2 top-1/2 -translate-y-1/2">
              {isMac ? '⌘K' : 'Ctrl K'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              className="icon-btn hidden xl:inline-flex"
              aria-label="关于"
              onClick={() => onNavigate('settings')}
            >
              <CircleHelp size={15} />
            </button>
            <button className="btn btn-primary" onClick={onNewTrade}>
              <Plus size={14} />
              记录交易
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {list ? (
            <div className="flex w-[326px] shrink-0 flex-col border-r border-line bg-list">
              {list}
            </div>
          ) : null}
          <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto bg-white">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
