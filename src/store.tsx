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
import type {
  Account,
  AccountCurrency,
  AppData,
  CashFlow,
  ContractConfig,
  DailyReview,
  DisciplineItem,
  JournalNote,
  RiskConfig,
  SetupChecklist,
  Trade,
  TradingConfig,
} from './types'
import { DEFAULT_RISK } from './data/contracts'
import { createSeedData } from './data/seed'
import { EMPTY_DATA, hasTauri, loadState, saveState } from './lib/storage'
import { deleteChart } from './lib/charts'
import { setDisplayCurrency, uid } from './lib/format'

export interface NewAccountInput {
  name: string
  currency: AccountCurrency
  startingEquity: number
  feePerContract: number
  risk: RiskConfig
}

interface StoreValue {
  data: AppData
  ready: boolean
  saving: boolean
  unsaved: boolean
  error: string | null
  storagePath: string
  /** 当前账户与它的交易 / 笔记（其余账户的数据不出现在界面里）。 */
  account: Account
  accounts: Account[]
  trades: Trade[]
  notes: JournalNote[]
  reviews: DailyReview[]
  cashFlows: CashFlow[]
  setActiveAccount: (id: string) => void
  addAccount: (input: NewAccountInput) => Account
  /** 切换账户币种，并按 ×100 / ×0.01 重标定已有金额（真实价值不变）。 */
  setAccountCurrency: (currency: AccountCurrency, accountId?: string) => void
  updateAccount: (
    patch: Partial<Pick<Account, 'name' | 'startingEquity' | 'feePerContract' | 'risk' | 'mt5'>>,
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
  addDisciplineItem: (label: string) => boolean
  renameDisciplineItem: (id: string, label: string) => boolean
  deleteDisciplineItem: (id: string) => boolean
  addMistakeTag: (label: string) => boolean
  renameMistakeTag: (from: string, to: string) => boolean
  deleteMistakeTag: (label: string) => boolean
  saveChecklist: (checklist: SetupChecklist) => void
  deleteChecklist: (id: string) => void
  addTrade: (trade: Trade) => void
  updateTrade: (trade: Trade) => void
  deleteTrade: (id: string) => void
  addNote: (note: JournalNote) => void
  updateNote: (note: JournalNote) => void
  deleteNote: (id: string) => void
  saveDailyReview: (review: DailyReview) => void
  deleteDailyReview: (date: string) => void
  saveCashFlow: (flow: CashFlow) => void
  deleteCashFlow: (id: string) => void
  importTrades: (trades: Trade[]) => void
  /** MT5 增量同步：按 externalId 更新已有交易，保留用户填写的复盘字段。 */
  syncMt5: (
    trades: Trade[],
    flows: CashFlow[],
    accountId?: string,
  ) => { added: number; updated: number; flowsAdded: number }
  replaceData: (data: AppData) => void
  loadDemo: () => void
  clearAll: () => void
  saveNow: () => Promise<boolean>
  saveAndPause: () => Promise<boolean>
  resumeAutoSave: () => void
  setError: (message: string | null) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function tradeIdentity(trade: Trade): string {
  return `${trade.date}|${trade.entryTime}|${trade.symbol}|${trade.entry}|${trade.qty}|${trade.side}`
}

function purgeCharts(trades: Trade[]): void {
  for (const trade of trades) {
    for (const chart of trade.charts ?? []) void deleteChart(chart.id)
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unsaved, setUnsaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storagePath, setStoragePath] = useState('')
  const dirty = useRef(false)
  const latest = useRef(data)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const autoSavePaused = useRef(false)

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

  const persist = useCallback((snapshot: AppData, force = false): Promise<boolean> => {
    const task = async (): Promise<boolean> => {
      if (autoSavePaused.current && !force) return true
      setSaving(true)
      try {
        await saveState(snapshot)
        setError(null)
        if (latest.current === snapshot) setUnsaved(false)
        return true
      } catch (err) {
        setError(`保存失败：${String(err)}`)
        setUnsaved(true)
        return false
      } finally {
        setSaving(false)
      }
    }
    const next = saveQueue.current.then(task, task)
    saveQueue.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }, [])

  useEffect(() => {
    if (!ready || !dirty.current) return
    let cancelled = false
    let retryTimer: number | null = null
    const attempt = async (attemptNo: number) => {
      const ok = await persist(data)
      if (cancelled) return
      if (!ok && attemptNo < 3) {
        retryTimer = window.setTimeout(
          () => void attempt(attemptNo + 1),
          1000 * 2 ** attemptNo,
        )
      }
    }
    const timer = window.setTimeout(() => void attempt(0), 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [data, ready, persist])

  const mutate = useCallback((updater: (prev: AppData) => AppData) => {
    dirty.current = true
    setUnsaved(true)
    // 同步更新 latest，让同一轮操作里的后续命令（例如先切币种再同步 MT5）
    // 读到刚写入的数据，而不是等下一次渲染后的 effect。
    const next = updater(latest.current)
    latest.current = next
    setData(next)
  }, [])

  const account = useMemo(
    () =>
      data.accounts.find((entry) => entry.id === data.activeAccountId) ??
      data.accounts[0] ??
      EMPTY_DATA.accounts[0]!,
    [data.accounts, data.activeAccountId],
  )

  // 金额格式化默认跟随当前账户币种；在子组件渲染前同步设置，避免首帧闪成美元。
  setDisplayCurrency(account.currency)

  const trades = useMemo(
    () => data.trades.filter((trade) => trade.accountId === account.id),
    [data.trades, account.id],
  )

  const notes = useMemo(
    () => data.notes.filter((note) => note.accountId === account.id),
    [data.notes, account.id],
  )

  const reviews = useMemo(
    () =>
      data.dailyReviews
        .filter((review) => review.accountId === account.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.dailyReviews, account.id],
  )

  const cashFlows = useMemo(
    () =>
      data.cashFlows
        .filter((flow) => flow.accountId === account.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.cashFlows, account.id],
  )

  const setAccountCurrency = useCallback<StoreValue['setAccountCurrency']>(
    (currency, accountId) => {
      mutate((prev) => {
        const targetId = accountId ?? prev.activeAccountId
        const target = prev.accounts.find((entry) => entry.id === targetId)
        if (!target || target.currency === currency) return prev
        // USD → USC 金额 ×100；USC → USD 金额 ×0.01。价格、手数与 R 倍数不变。
        const factor = currency === 'USC' ? 100 : 0.01
        const scale = (value: number) => Math.round(value * factor * 1e6) / 1e6
        const accountSymbols = new Set(
          prev.trades
            .filter((trade) => trade.accountId === targetId)
            .map((trade) => trade.symbol),
        )
        // 其他账户也在用的合约不改点值，避免连带改变别人的计算口径。
        const otherSymbols = new Set(
          prev.trades
            .filter((trade) => trade.accountId !== targetId)
            .map((trade) => trade.symbol),
        )
        return {
          ...prev,
          accounts: prev.accounts.map((entry) =>
            entry.id === targetId
              ? {
                  ...entry,
                  currency,
                  startingEquity: scale(entry.startingEquity),
                  feePerContract: scale(entry.feePerContract),
                  risk: { ...entry.risk, dailyLossLimit: scale(entry.risk.dailyLossLimit) },
                }
              : entry,
          ),
          trades: prev.trades.map((trade) =>
            trade.accountId === targetId
              ? { ...trade, pnl: scale(trade.pnl), fees: scale(trade.fees) }
              : trade,
          ),
          cashFlows: prev.cashFlows.map((flow) =>
            flow.accountId === targetId ? { ...flow, amount: scale(flow.amount) } : flow,
          ),
          config: {
            ...prev.config,
            contracts: prev.config.contracts.map((contract) =>
              accountSymbols.has(contract.symbol) && !otherSymbols.has(contract.symbol)
                ? { ...contract, pointValue: scale(contract.pointValue) }
                : contract,
            ),
          },
        }
      })
    },
    [mutate],
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
        currency: input.currency === 'USC' ? 'USC' : 'USD',
        startingEquity: input.startingEquity > 0 ? input.startingEquity : 100000,
        feePerContract: input.feePerContract >= 0 ? input.feePerContract : 2.5,
        risk: { ...DEFAULT_RISK, ...input.risk },
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
          dailyReviews: prev.dailyReviews.filter((review) => review.accountId !== id),
          cashFlows: prev.cashFlows.filter((flow) => flow.accountId !== id),
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
          checklists: prev.config.checklists.map((checklist) =>
            checklist.setup === from ? { ...checklist, setup: value } : checklist,
          ),
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
          checklists: prev.config.checklists.filter((checklist) => checklist.setup !== name),
        },
      }))
      return true
    },
    [mutate],
  )

  const addDisciplineItem = useCallback(
    (label: string): boolean => {
      const value = label.trim()
      const items = latest.current.config.disciplineItems
      if (!value || items.some((item) => item.label === value)) return false
      const next: DisciplineItem = { id: uid('disc'), label: value }
      mutate((prev) => ({
        ...prev,
        config: { ...prev.config, disciplineItems: [...prev.config.disciplineItems, next] },
      }))
      return true
    },
    [mutate],
  )

  const renameDisciplineItem = useCallback(
    (id: string, label: string): boolean => {
      const value = label.trim()
      const items = latest.current.config.disciplineItems
      const current = items.find((item) => item.id === id)
      if (!current || !value || value === current.label) return false
      if (items.some((item) => item.id !== id && item.label === value)) return false
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          disciplineItems: prev.config.disciplineItems.map((item) =>
            item.id === id ? { ...item, label: value } : item,
          ),
        },
      }))
      return true
    },
    [mutate],
  )

  const deleteDisciplineItem = useCallback(
    (id: string): boolean => {
      const items = latest.current.config.disciplineItems
      if (items.length <= 1 || !items.some((item) => item.id === id)) return false
      // 历史交易里已经勾选过该项时不允许删除，避免统计口径断裂。
      if (latest.current.trades.some((trade) => typeof trade.discipline[id] === 'boolean')) {
        return false
      }
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          disciplineItems: prev.config.disciplineItems.filter((item) => item.id !== id),
        },
      }))
      return true
    },
    [mutate],
  )

  const addMistakeTag = useCallback(
    (label: string): boolean => {
      const value = label.trim()
      if (!value || latest.current.config.mistakeTags.includes(value)) return false
      mutate((prev) => ({
        ...prev,
        config: { ...prev.config, mistakeTags: [...prev.config.mistakeTags, value] },
      }))
      return true
    },
    [mutate],
  )

  const renameMistakeTag = useCallback(
    (from: string, to: string): boolean => {
      const value = to.trim()
      if (!value || value === from) return false
      if (!latest.current.config.mistakeTags.includes(from)) return false
      if (latest.current.config.mistakeTags.includes(value)) return false
      const dedupe = (tags: string[]) =>
        [...new Set(tags.map((tag) => (tag === from ? value : tag)))]
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          mistakeTags: prev.config.mistakeTags.map((tag) => (tag === from ? value : tag)),
        },
        trades: prev.trades.map((trade) =>
          trade.mistakes?.includes(from) ? { ...trade, mistakes: dedupe(trade.mistakes) } : trade,
        ),
        dailyReviews: prev.dailyReviews.map((review) =>
          review.violations.includes(from)
            ? { ...review, violations: dedupe(review.violations) }
            : review,
        ),
      }))
      return true
    },
    [mutate],
  )

  const deleteMistakeTag = useCallback(
    (label: string): boolean => {
      if (!latest.current.config.mistakeTags.includes(label)) return false
      const used =
        latest.current.trades.some((trade) => trade.mistakes?.includes(label)) ||
        latest.current.dailyReviews.some((review) => review.violations.includes(label))
      if (used) return false
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          mistakeTags: prev.config.mistakeTags.filter((tag) => tag !== label),
        },
      }))
      return true
    },
    [mutate],
  )

  const saveChecklist = useCallback(
    (checklist: SetupChecklist) => {
      const items = checklist.items
        .map((item) => ({ ...item, label: item.label.trim() }))
        .filter((item) => item.label)
      mutate((prev) => {
        if (!prev.config.setups.includes(checklist.setup)) return prev
        const rest = prev.config.checklists.filter(
          (entry) => entry.id !== checklist.id && entry.setup !== checklist.setup,
        )
        return {
          ...prev,
          config: {
            ...prev.config,
            checklists: items.length ? [...rest, { ...checklist, items }] : rest,
          },
        }
      })
    },
    [mutate],
  )

  const deleteChecklist = useCallback(
    (id: string) => {
      mutate((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          checklists: prev.config.checklists.filter((entry) => entry.id !== id),
        },
      }))
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

  const saveDailyReview = useCallback(
    (review: DailyReview) => {
      const next = { ...review, updatedAt: new Date().toISOString() }
      mutate((prev) => {
        const index = prev.dailyReviews.findIndex(
          (entry) => entry.accountId === review.accountId && entry.date === review.date,
        )
        if (index < 0) return { ...prev, dailyReviews: [next, ...prev.dailyReviews] }
        const existing = prev.dailyReviews[index]!
        return {
          ...prev,
          dailyReviews: prev.dailyReviews.map((entry, i) =>
            i === index ? { ...next, id: existing.id } : entry,
          ),
        }
      })
    },
    [mutate],
  )

  const deleteDailyReview = useCallback(
    (date: string) => {
      const accountId = latest.current.activeAccountId
      mutate((prev) => ({
        ...prev,
        dailyReviews: prev.dailyReviews.filter(
          (review) => !(review.accountId === accountId && review.date === date),
        ),
      }))
    },
    [mutate],
  )

  const saveCashFlow = useCallback(
    (flow: CashFlow) => {
      mutate((prev) => {
        const index = prev.cashFlows.findIndex((entry) => entry.id === flow.id)
        if (index < 0) return { ...prev, cashFlows: [flow, ...prev.cashFlows] }
        return {
          ...prev,
          cashFlows: prev.cashFlows.map((entry, i) => (i === index ? flow : entry)),
        }
      })
    },
    [mutate],
  )

  const deleteCashFlow = useCallback(
    (id: string) => {
      mutate((prev) => ({
        ...prev,
        cashFlows: prev.cashFlows.filter((flow) => flow.id !== id),
      }))
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

  const syncMt5 = useCallback<StoreValue['syncMt5']>(
    (incoming, incomingFlows, accountId) => {
      const current = latest.current
      const targetId = accountId ?? current.activeAccountId
      const byExternal = new Map<string, Trade>()
      const byIdentity = new Map<string, Trade>()
      for (const trade of current.trades) {
        if (trade.accountId !== targetId) continue
        if (trade.externalId) byExternal.set(trade.externalId, trade)
        byIdentity.set(tradeIdentity(trade), trade)
      }

      const nextTrades = [...current.trades]
      let added = 0
      let updated = 0
      for (const raw of incoming) {
        const trade: Trade = { ...raw, accountId: targetId, charts: raw.charts ?? [] }
        const externalMatch = trade.externalId
          ? byExternal.get(trade.externalId)
          : undefined
        const identityMatch = byIdentity.get(tradeIdentity(trade))
        // 只有「原来没有外部编号」的手工记录才按内容指纹合并，
        // 避免同一分钟、同价同量的两笔不同 MT5 持仓被错误地并成一笔。
        const match =
          externalMatch ?? (identityMatch && !identityMatch.externalId ? identityMatch : undefined)
        if (!match) {
          nextTrades.unshift(trade)
          added += 1
          if (trade.externalId) byExternal.set(trade.externalId, trade)
          byIdentity.set(tradeIdentity(trade), trade)
          continue
        }
        const merged: Trade = {
          ...trade,
          id: match.id,
          accountId: targetId,
          setup: match.setup && match.setup !== '未分类' ? match.setup : trade.setup,
          session: match.session || trade.session,
          note: match.note,
          grade: match.grade,
          discipline: match.discipline,
          mistakes: match.mistakes,
          maeR: match.maeR,
          mfeR: match.mfeR,
          charts: match.charts,
          stop: trade.stop > 0 ? trade.stop : match.stop,
        }
        const index = nextTrades.findIndex((item) => item.id === match.id)
        if (index >= 0) nextTrades[index] = merged
        updated += 1
        if (merged.externalId) byExternal.set(merged.externalId, merged)
        byIdentity.set(tradeIdentity(merged), merged)
      }

      const flowKeys = new Set(
        current.cashFlows
          .filter((flow) => flow.accountId === targetId && flow.externalId)
          .map((flow) => flow.externalId!),
      )
      const freshFlows: CashFlow[] = []
      for (const flow of incomingFlows) {
        if (flow.externalId && flowKeys.has(flow.externalId)) continue
        if (flow.externalId) flowKeys.add(flow.externalId)
        freshFlows.push({ ...flow, accountId: targetId })
      }

      if (added || updated || freshFlows.length) {
        mutate((prev) => ({
          ...prev,
          trades: nextTrades,
          cashFlows: freshFlows.length ? [...freshFlows, ...prev.cashFlows] : prev.cashFlows,
        }))
      }
      return { added, updated, flowsAdded: freshFlows.length }
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
      dailyReviews: prev.dailyReviews.filter(
        (review) => review.accountId !== prev.activeAccountId,
      ),
      cashFlows: prev.cashFlows.filter((flow) => flow.accountId !== prev.activeAccountId),
    }))
  }, [mutate])

  const saveNow = useCallback(
    async (): Promise<boolean> => persist(latest.current),
    [persist],
  )

  // 恢复备份前：先暂停自动保存，再强制写入最后一次改动。
  // 之后即使有排队中的自动保存任务，也不会在恢复完成后把旧数据写回磁盘。
  const saveAndPause = useCallback(
    async (): Promise<boolean> => {
      autoSavePaused.current = true
      return persist(latest.current, true)
    },
    [persist],
  )

  const resumeAutoSave = useCallback(() => {
    autoSavePaused.current = false
    void persist(latest.current)
  }, [persist])

  // 浏览器预览模式：关闭页面前同步写入 localStorage。
  useEffect(() => {
    if (hasTauri()) return
    const onBeforeUnload = () => {
      void saveState(latest.current)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 桌面版：关闭窗口时先保存，最多等待 3 秒，避免丢失最后一笔编辑。
  useEffect(() => {
    if (!hasTauri()) return
    let disposed = false
    let closing = false
    let unlisten: (() => void) | null = null
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow()
        return appWindow.onCloseRequested((event) => {
          if (closing) return
          closing = true
          event.preventDefault()
          void Promise.race([
            saveNow(),
            new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
          ])
            .then(() => appWindow.destroy())
            .catch(() => {
              closing = false
            })
        })
      })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {})
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [saveNow])

  const value = useMemo<StoreValue>(
    () => ({
      data,
      ready,
      saving,
      unsaved,
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
      addDisciplineItem,
      renameDisciplineItem,
      deleteDisciplineItem,
      addMistakeTag,
      renameMistakeTag,
      deleteMistakeTag,
      saveChecklist,
      deleteChecklist,
      trades,
      notes,
      reviews,
      cashFlows,
      setActiveAccount,
      addAccount,
      setAccountCurrency,
      updateAccount,
      deleteAccount,
      addTrade,
      updateTrade,
      deleteTrade,
      addNote,
      updateNote,
      deleteNote,
      saveDailyReview,
      deleteDailyReview,
      saveCashFlow,
      deleteCashFlow,
      importTrades,
      syncMt5,
      replaceData,
      loadDemo,
      clearAll,
      saveNow,
      saveAndPause,
      resumeAutoSave,
      setError,
    }),
    [
      data,
      ready,
      saving,
      unsaved,
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
      addDisciplineItem,
      renameDisciplineItem,
      deleteDisciplineItem,
      addMistakeTag,
      renameMistakeTag,
      deleteMistakeTag,
      saveChecklist,
      deleteChecklist,
      trades,
      notes,
      reviews,
      cashFlows,
      setActiveAccount,
      addAccount,
      setAccountCurrency,
      updateAccount,
      deleteAccount,
      addTrade,
      updateTrade,
      deleteTrade,
      addNote,
      updateNote,
      deleteNote,
      saveDailyReview,
      deleteDailyReview,
      saveCashFlow,
      deleteCashFlow,
      importTrades,
      syncMt5,
      replaceData,
      loadDemo,
      clearAll,
      saveNow,
      saveAndPause,
      resumeAutoSave,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useApp(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useApp 必须在 StoreProvider 内使用')
  return ctx
}
