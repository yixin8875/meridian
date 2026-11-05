import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Account, AppData, ContractConfig, JournalNote, Trade, TradingConfig } from './types'
import { createSeedData } from './data/seed'
import { EMPTY_DATA, loadState, saveState } from './lib/storage'
import { deleteChart } from './lib/charts'
import { uid } from './lib/format'

export interface NewAccountInput {
  name: string
  startingEquity: number
  feePerContract: number
}

interface StoreValue {
  data: AppData
  ready: boolean
  saving: boolean
  error: string | null
  storagePath: string
  /** 当前账户与它的交易 / 笔记（其余账户的数据不出现在界面里）。 */
  account: Account
  accounts: Account[]
  trades: Trade[]
  notes: JournalNote[]
  setActiveAccount: (id: string) => void
  addAccount: (input: NewAccountInput) => Account
  updateAccount: (
    patch: Partial<Pick<Account, 'name' | 'startingEquity' | 'feePerContract'>>,
  ) => void
  deleteAccount: (id: string) => void
  /** 全应用共享的合约 / 时段 / 形态字典。 */
  config: TradingConfig
  addContract: (input: ContractConfig) => boolean
  updateContract: (original: string, patch: Partial<ContractConfig>) => boolean
  deleteContract: (symbol: string) => boolean
  addSession: (name: string) => boolean
  renameSession: (from: string, to: string) => boolean
  deleteSession: (name: string) => boolean
  addSetup: (name: string) => boolean
  renameSetup: (from: string, to: string) => boolean
  deleteSetup: (name: string) => boolean
  addTrade: (trade: Trade) => void
  updateTrade: (trade: Trade) => void
  deleteTrade: (id: string) => void
  addNote: (note: JournalNote) => void
  updateNote: (note: JournalNote) => void
  deleteNote: (id: string) => void
  importTrades: (trades: Trade[]) => void
  replaceData: (data: AppData) => void
  loadDemo: () => void
  clearAll: () => void
  saveNow: () => Promise<void>
  setError: (message: string | null) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function purgeCharts(trades: Trade[]): void {
  for (const trade of trades) {
    for (const chart of trade.charts ?? []) void deleteChart(chart.id)
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storagePath, setStoragePath] = useState('')
  const dirty = useRef(false)
  const latest = useRef(data)

  useEffect(() => {
    latest.current = data
  }, [data])

  useEffect(() => {
    let alive = true
    loadState().then((result) => {
      if (!alive) return
      if (result.data) setData(result.data)
      setStoragePath(result.path)
      if (result.error) setError(result.error)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!ready || !dirty.current) return
    const timer = window.setTimeout(() => {
      setSaving(true)
      saveState(data)
        .then(() => setError(null))
        .catch((err: unknown) => setError(`保存失败：${String(err)}`))
        .finally(() => setSaving(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [data, ready])

  const mutate = useCallback((updater: (prev: AppData) => AppData) => {
    dirty.current = true
    setData((prev) => updater(prev))
  }, [])

  const account = useMemo(
    () =>
      data.accounts.find((entry) => entry.id === data.activeAccountId) ??
      data.accounts[0] ??
      EMPTY_DATA.accounts[0]!,
    [data.accounts, data.activeAccountId],
  )

  const trades = useMemo(
    () => data.trades.filter((trade) => trade.accountId === account.id),
    [data.trades, account.id],
  )

  const notes = useMemo(
    () => data.notes.filter((note) => note.accountId === account.id),
    [data.notes, account.id],
  )

  const setActiveAccount = useCallback(
    (id: string) => {
      mutate((prev) =>
        prev.accounts.some((entry) => entry.id === id) ? { ...prev, activeAccountId: id } : prev,
      )
    },
    [mutate],
  )

  const addAccount = useCallback(
    (input: NewAccountInput): Account => {
      const next: Account = {
        id: uid('acc'),
        name: input.name.trim() || '新账户',
        startingEquity: input.startingEquity > 0 ? input.startingEquity : 100000,
        feePerContract: input.feePerContract >= 0 ? input.feePerContract : 2.5,
        createdAt: new Date().toISOString().slice(0, 10),
      }
      mutate((prev) => ({
        ...prev,
        accounts: [...prev.accounts, next],
        activeAccountId: next.id,
      }))
      return next
    },
    [mutate],
  )

  const updateAccount = useCallback<StoreValue['updateAccount']>(
    (patch) => {
      const id = latest.current.activeAccountId
      mutate((prev) => ({
        ...prev,
        accounts: prev.accounts.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
      }))
    },
    [mutate],
  )

  const deleteAccount = useCallback(
    (id: string) => {
      const current = latest.current
      if (current.accounts.length <= 1) return
      if (!current.accounts.some((entry) => entry.id === id)) return
      purgeCharts(current.trades.filter((trade) => trade.accountId === id))
      mutate((prev) => {
        const accounts = prev.accounts.filter((entry) => entry.id !== id)
        if (!accounts.length) return prev
        return {
          ...prev,
          accounts,
          activeAccountId:
            prev.activeAccountId === id ? accounts[0]!.id : prev.activeAccountId,
          trades: prev.trades.filter((trade) => trade.accountId !== id),
          notes: prev.notes.filter((note) => note.accountId !== id),
        }
      })
    },
    [mutate],
  )


  const addContract = useCallback(
    (input: ContractConfig): boolean => {
      const symbol = input.symbol.trim()
      if (!symbol) return false
      if (latest.current.config.contracts.some((entry) => entry.symbol === symbol)) return false
      const next: ContractConfig = {
        symbol,
        name: input.name.trim() || symbol,
        pointValue: input.pointValue > 0 ? input.pointValue : 1,
      }
      mutate((prev) => ({
        ...prev,
        config: { ...prev.config, contracts: [...prev.config.contracts, next] },
      }))
      return true
    },
    [mutate],
  )

  const updateContract = useCallback(
    (original: string, patch: Partial<ContractConfig>): boolean => {
      const current = latest.current.config.contracts.find((entry) => entry.symbol === original)
      if (!current) return false
      const symbol = (patch.symbol ?? current.symbol).trim() || current.symbol
      if (
        symbol !== original &&
        latest.current.config.contracts.some((entry) => entry.symbol === symbol)
      ) {
        return false
      }
      const pointValue =
        patch.pointValue !== undefined && patch.pointValue > 0 ? patch.pointValue : current.pointValue
      const next: ContractConfig = {
        symbol,
        name: (patch.name ?? current.name).trim() || symbol,
        pointValue,
      }
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          contracts: prev.config.contracts.map((entry) =>
            entry.symbol === original ? next : entry,
          ),
        },
        trades:
          symbol === original
            ? prev.trades
            : prev.trades.map((trade) =>
                trade.symbol === original ? { ...trade, symbol } : trade,
              ),
      }))
      return true
    },
    [mutate],
  )

  const deleteContract = useCallback(
    (symbol: string): boolean => {
      if (latest.current.config.contracts.length <= 1) return false
      if (latest.current.trades.some((trade) => trade.symbol === symbol)) return false
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          contracts: prev.config.contracts.filter((entry) => entry.symbol !== symbol),
        },
      }))
      return true
    },
    [mutate],
  )

  const addSession = useCallback(
    (name: string): boolean => {
      const value = name.trim()
      if (!value || latest.current.config.sessions.includes(value)) return false
      mutate((prev) => ({
        ...prev,
        config: { ...prev.config, sessions: [...prev.config.sessions, value] },
      }))
      return true
    },
    [mutate],
  )

  const renameSession = useCallback(
    (from: string, to: string): boolean => {
      const value = to.trim()
      if (!value || value === from) return false
      if (latest.current.config.sessions.includes(value)) return false
      if (!latest.current.config.sessions.includes(from)) return false
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          sessions: prev.config.sessions.map((entry) => (entry === from ? value : entry)),
        },
        trades: prev.trades.map((trade) =>
          trade.session === from ? { ...trade, session: value } : trade,
        ),
      }))
      return true
    },
    [mutate],
  )

  const deleteSession = useCallback(
    (name: string): boolean => {
      if (latest.current.config.sessions.length <= 1) return false
      if (latest.current.trades.some((trade) => trade.session === name)) return false
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          sessions: prev.config.sessions.filter((entry) => entry !== name),
        },
      }))
      return true
    },
    [mutate],
  )

  const addSetup = useCallback(
    (name: string): boolean => {
      const value = name.trim()
      if (!value || latest.current.config.setups.includes(value)) return false
      mutate((prev) => ({
        ...prev,
        config: { ...prev.config, setups: [...prev.config.setups, value] },
      }))
      return true
    },
    [mutate],
  )

  const renameSetup = useCallback(
    (from: string, to: string): boolean => {
      const value = to.trim()
      if (!value || value === from) return false
      if (latest.current.config.setups.includes(value)) return false
      if (!latest.current.config.setups.includes(from)) return false
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          setups: prev.config.setups.map((entry) => (entry === from ? value : entry)),
        },
        trades: prev.trades.map((trade) =>
          trade.setup === from ? { ...trade, setup: value } : trade,
        ),
      }))
      return true
    },
    [mutate],
  )

  const deleteSetup = useCallback(
    (name: string): boolean => {
      if (latest.current.config.setups.length <= 1) return false
      if (latest.current.trades.some((trade) => trade.setup === name)) return false
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          setups: prev.config.setups.filter((entry) => entry !== name),
        },
      }))
      return true
    },
    [mutate],
  )

  const addTrade = useCallback(
    (trade: Trade) => {
      mutate((prev) => ({ ...prev, trades: [trade, ...prev.trades] }))
    },
    [mutate],
  )

  const updateTrade = useCallback(
    (trade: Trade) => {
      const previous = latest.current.trades.find((entry) => entry.id === trade.id)
      if (previous) {
        const kept = new Set(trade.charts.map((chart) => chart.id))
        const dropped = previous.charts.filter((chart) => !kept.has(chart.id))
        for (const chart of dropped) void deleteChart(chart.id)
      }
      mutate((prev) => ({
        ...prev,
        trades: prev.trades.map((t) => (t.id === trade.id ? trade : t)),
      }))
    },
    [mutate],
  )

  const deleteTrade = useCallback(
    (id: string) => {
      const target = latest.current.trades.find((trade) => trade.id === id)
      if (target) purgeCharts([target])
      mutate((prev) => ({ ...prev, trades: prev.trades.filter((t) => t.id !== id) }))
    },
    [mutate],
  )

  const addNote = useCallback(
    (note: JournalNote) => {
      mutate((prev) => ({ ...prev, notes: [note, ...prev.notes] }))
    },
    [mutate],
  )

  const updateNote = useCallback(
    (note: JournalNote) => {
      mutate((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === note.id ? note : n)),
      }))
    },
    [mutate],
  )

  const deleteNote = useCallback(
    (id: string) => {
      mutate((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }))
    },
    [mutate],
  )

  const importTrades = useCallback(
    (incoming: Trade[]) => {
      const accountId = latest.current.activeAccountId
      mutate((prev) => {
        const inAccount = prev.trades.filter((trade) => trade.accountId === accountId)
        const seen = new Set(
          inAccount.map(
            (t) => `${t.date}|${t.entryTime}|${t.symbol}|${t.entry}|${t.qty}|${t.side}`,
          ),
        )
        const fresh = incoming
          .map((trade) => ({ ...trade, accountId, charts: trade.charts ?? [] }))
          .filter(
            (t) => !seen.has(`${t.date}|${t.entryTime}|${t.symbol}|${t.entry}|${t.qty}|${t.side}`),
          )
        return { ...prev, trades: [...fresh, ...prev.trades] }
      })
    },
    [mutate],
  )

  const replaceData = useCallback(
    (next: AppData) => {
      mutate(() => next)
    },
    [mutate],
  )

  const loadDemo = useCallback(() => {
    replaceData(createSeedData())
  }, [replaceData])

  const clearAll = useCallback(() => {
    const current = latest.current
    purgeCharts(current.trades.filter((trade) => trade.accountId === current.activeAccountId))
    mutate((prev) => ({
      ...prev,
      trades: prev.trades.filter((trade) => trade.accountId !== prev.activeAccountId),
      notes: prev.notes.filter((note) => note.accountId !== prev.activeAccountId),
    }))
  }, [mutate])

  const saveNow = useCallback(async () => {
    setSaving(true)
    try {
      await saveState(latest.current)
      setError(null)
    } catch (err) {
      setError(`保存失败：${String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      data,
      ready,
      saving,
      error,
      storagePath,
      account,
      accounts: data.accounts,
      config: data.config,
      addContract,
      updateContract,
      deleteContract,
      addSession,
      renameSession,
      deleteSession,
      addSetup,
      renameSetup,
      deleteSetup,
      trades,
      notes,
      setActiveAccount,
      addAccount,
      updateAccount,
      deleteAccount,
      addTrade,
      updateTrade,
      deleteTrade,
      addNote,
      updateNote,
      deleteNote,
      importTrades,
      replaceData,
      loadDemo,
      clearAll,
      saveNow,
      setError,
    }),
    [
      data,
      ready,
      saving,
      error,
      storagePath,
      account,
      data.config,
      addContract,
      updateContract,
      deleteContract,
      addSession,
      renameSession,
      deleteSession,
      addSetup,
      renameSetup,
      deleteSetup,
      trades,
      notes,
      setActiveAccount,
      addAccount,
      updateAccount,
      deleteAccount,
      addTrade,
      updateTrade,
      deleteTrade,
      addNote,
      updateNote,
      deleteNote,
      importTrades,
      replaceData,
      loadDemo,
      clearAll,
      saveNow,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useApp(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useApp 必须在 StoreProvider 内使用')
  return ctx
}
