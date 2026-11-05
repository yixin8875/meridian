import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Settings2, Wallet } from 'lucide-react'
import type { Account, Trade } from '../types'
import { useApp } from '../store'
import { buildEquity } from '../lib/stats'
import { fmtMoney } from '../lib/format'
import { AccountDialog, type AccountValues } from './AccountDialog'

function equityOf(account: Account, trades: Trade[]): number {
  const points = buildEquity(
    trades.filter((trade) => trade.accountId === account.id),
    account.startingEquity,
  )
  return points[points.length - 1]?.equity ?? account.startingEquity
}

export function AccountMenu({ onManage }: { onManage: () => void }) {
  const { accounts, account, data, setActiveAccount, addAccount } = useApp()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const equity = useMemo(() => equityOf(account, data.trades), [account, data.trades])

  const create = (values: AccountValues) => {
    addAccount(values)
    setCreating(false)
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
          open ? 'bg-hover' : 'hover:bg-hover'
        }`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="切换账户"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-accent shadow-[0_0_0_1px_var(--color-line)]">
          <Wallet size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-ink">{account.name}</span>
          <span className="num block text-[10.5px] text-muted">${fmtMoney(equity, false)}</span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div
          className="fade-in absolute left-0 top-[calc(100%+4px)] z-40 w-[236px] overflow-hidden rounded-lg border border-line bg-white shadow-[0_12px_36px_-12px_rgba(20,20,25,0.28)]"
          role="menu"
        >
          <div className="px-3 pb-1 pt-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
            账户 · {accounts.length}
          </div>
          <div className="max-h-[260px] overflow-y-auto px-1.5 pb-1">
            {accounts.map((entry) => {
              const active = entry.id === account.id
              const count = data.trades.filter((trade) => trade.accountId === entry.id).length
              return (
                <button
                  key={entry.id}
                  role="menuitemradio"
                  aria-checked={active}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                    active ? 'bg-selected' : 'hover:bg-hover'
                  }`}
                  onClick={() => {
                    setActiveAccount(entry.id)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium text-ink">
                      {entry.name}
                    </span>
                    <span className="num block text-[10px] text-faint">
                      ${fmtMoney(equityOf(entry, data.trades), false)} · {count} 笔
                    </span>
                  </span>
                  {active ? <Check size={13} className="shrink-0 text-accent" /> : null}
                </button>
              )
            })}
          </div>
          <div className="border-t border-line p-1.5">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-ink-2 transition-colors hover:bg-hover"
              onClick={() => {
                setOpen(false)
                setCreating(true)
              }}
            >
              <Plus size={13} className="text-muted" />
              新建账户
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-ink-2 transition-colors hover:bg-hover"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <Settings2 size={13} className="text-muted" />
              管理账户
            </button>
          </div>
        </div>
      ) : null}

      <AccountDialog
        open={creating}
        account={null}
        onClose={() => setCreating(false)}
        onSubmit={create}
      />
    </div>
  )
}
