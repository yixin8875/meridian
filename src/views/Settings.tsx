import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  ListChecks,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import type { Account, CashFlow, ChecklistItem, ContractConfig } from '../types'
import { useApp } from '../store'
import { CASH_FLOW_KINDS } from '../data/contracts'
import { downloadCsv, importTradesCsv } from '../lib/csv'
import {
  backupSupported,
  createBackup,
  fmtBytes,
  getBackupStatus,
  restoreBackup,
  type BackupStatus,
} from '../lib/backup'
import { buildEquity, cashFlowSummary } from '../lib/stats'
import { fmtMoney, fmtSignedMoney, todayISO, uid } from '../lib/format'
import { AccountDialog, type AccountValues } from '../components/AccountDialog'
import { CashFlowDialog } from '../components/CashFlowForm'
import { Mt5Sync } from '../components/Mt5Sync'
import { Modal } from '../components/primitives'

type Notice = { tone: 'ok' | 'error'; text: string } | null

export function Settings() {
  const {
    data,
    account,
    accounts,
    config,
    trades,
    notes,
    reviews,
    cashFlows,
    saveCashFlow,
    deleteCashFlow,
    saving,
    unsaved,
    storagePath,
    setActiveAccount,
    addAccount,
    updateAccount,
    deleteAccount,
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
    importTrades,
    loadDemo,
    clearAll,
    saveNow,
    saveAndPause,
    resumeAutoSave,
  } = useApp()

  const [notice, setNotice] = useState<Notice>(null)
  const [copied, setCopied] = useState(false)
  const [demoConfirm, setDemoConfirm] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [editingFlow, setEditingFlow] = useState<CashFlow | null>(null)
  const [removingFlow, setRemovingFlow] = useState<string | null>(null)
  const [contractDraft, setContractDraft] = useState<{
    original: string | null
    symbol: string
    name: string
    pointValue: string
  } | null>(null)
  const [wordDraft, setWordDraft] = useState<{
    kind: 'session' | 'setup'
    original: string | null
    value: string
  } | null>(null)
  const [disciplineDraft, setDisciplineDraft] = useState<{
    id: string | null
    label: string
  } | null>(null)
  const [tagDraft, setTagDraft] = useState<{ original: string | null; label: string } | null>(
    null,
  )
  const [checklistDraft, setChecklistDraft] = useState<{ setup: string; text: string } | null>(
    null,
  )
  const [removingChecklist, setRemovingChecklist] = useState<string | null>(null)
  const [dictError, setDictError] = useState<string | null>(null)
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null)
  const [backupBusy, setBackupBusy] = useState<'export' | 'restore' | null>(null)
  const [restoreSource, setRestoreSource] = useState<{ path: string; name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!backupSupported()) return
    let alive = true
    void getBackupStatus()
      .then((status) => {
        if (alive) setBackupStatus(status)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const copyPath = async () => {
    if (!storagePath) return
    try {
      await navigator.clipboard.writeText(storagePath)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setNotice({ tone: 'error', text: '无法访问剪贴板，请手动复制路径。' })
    }
  }

  const onImport = async (file: File | null) => {
    if (!file) return
    try {
      const source = await file.text()
      const result = importTradesCsv(
        source,
        account.feePerContract,
        config.contracts,
        config.disciplineItems,
      )
      if (result.error) {
        setNotice({ tone: 'error', text: result.error })
        return
      }
      if (!result.trades.length) {
        setNotice({ tone: 'error', text: '没有识别到有效行，请检查日期、合约与入场价。' })
        return
      }
      importTrades(result.trades)
      setNotice({
        tone: 'ok',
        text: `已导入 ${result.trades.length} 笔到「${account.name}」${result.skipped ? `，跳过 ${result.skipped} 行` : ''}。`,
      })
    } catch (err) {
      setNotice({ tone: 'error', text: `读取文件失败：${String(err)}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

  const exportBackup = async () => {
    if (!backupSupported()) {
      setNotice({ tone: 'error', text: '完整备份只在桌面版可用。' })
      return
    }
    setBackupBusy('export')
    try {
      if (!(await saveNow())) {
        setNotice({ tone: 'error', text: '当前数据未保存成功，已取消导出。' })
        return
      }
      const { save } = await import('@tauri-apps/plugin-dialog')
      const path = await save({
        title: '导出 MERIDIAN 完整备份',
        defaultPath: `meridian-backup-${todayISO()}.zip`,
        filters: [{ name: 'MERIDIAN 备份', extensions: ['zip'] }],
      })
      if (!path) return
      const info = await createBackup(path)
      const name = info.path.split(/[\\/]/).pop() ?? info.path
      setNotice({
        tone: 'ok',
        text: `完整备份已导出：${name} · ${info.trades} 笔交易、${info.notes} 篇笔记、${info.charts} 张 K 线图 · ${fmtBytes(info.size)}`,
      })
      void getBackupStatus()
        .then(setBackupStatus)
        .catch(() => {})
    } catch (err) {
      setNotice({ tone: 'error', text: `导出备份失败：${errText(err)}` })
    } finally {
      setBackupBusy(null)
    }
  }

  const chooseRestore = async () => {
    if (!backupSupported()) {
      setNotice({ tone: 'error', text: '完整备份只在桌面版可用。' })
      return
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        title: '选择 MERIDIAN 完整备份',
        multiple: false,
        directory: false,
        filters: [{ name: 'MERIDIAN 备份', extensions: ['zip'] }],
      })
      if (typeof selected !== 'string') return
      setRestoreSource({
        path: selected,
        name: selected.split(/[\\/]/).pop() ?? selected,
      })
    } catch (err) {
      setNotice({ tone: 'error', text: `选择备份失败：${errText(err)}` })
    }
  }

  const confirmRestore = async () => {
    if (!restoreSource || backupBusy) return
    setBackupBusy('restore')
    try {
      if (!(await saveAndPause())) {
        resumeAutoSave()
        setNotice({ tone: 'error', text: '当前数据未保存成功，已取消恢复。' })
        return
      }
      const info = await restoreBackup(restoreSource.path)
      setRestoreSource(null)
      setNotice({
        tone: 'ok',
        text: `已恢复 ${info.trades} 笔交易、${info.notes} 篇笔记、${info.charts} 张 K 线图。应用即将重新加载。`,
      })
      window.setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      resumeAutoSave()
      setNotice({ tone: 'error', text: `恢复失败：${errText(err)}` })
    } finally {
      setBackupBusy(null)
    }
  }

  const createAccount = (values: AccountValues) => {
    const next = addAccount(values)
    setCreating(false)
    setNotice({ tone: 'ok', text: `已创建并切换到「${next.name}」。` })
  }

  const saveAccount = (values: AccountValues) => {
    updateAccount(values)
    setEditing(null)
    setNotice({ tone: 'ok', text: '账户设置已保存，统计会按新参数重算。' })
  }

  const openCount = trades.filter((trade) => trade.status === 'open').length
  const flowSummary = cashFlowSummary(cashFlows)

  const startContract = (contract?: ContractConfig) => {
    setDictError(null)
    setContractDraft(
      contract
        ? {
            original: contract.symbol,
            symbol: contract.symbol,
            name: contract.name,
            pointValue: String(contract.pointValue),
          }
        : { original: null, symbol: '', name: '', pointValue: '50' },
    )
  }

  const submitContract = () => {
    if (!contractDraft) return
    const symbol = contractDraft.symbol.trim().toUpperCase()
    const name = contractDraft.name.trim()
    const pointValue = Number(contractDraft.pointValue)
    if (!/^[A-Z0-9._-]{1,12}$/.test(symbol)) {
      setDictError('合约代码请使用 1–12 位字母、数字、点或连字符。')
      return
    }
    if (!Number.isFinite(pointValue) || pointValue <= 0) {
      setDictError('每点价值需要大于 0。')
      return
    }
    const ok = contractDraft.original
      ? updateContract(contractDraft.original, { symbol, name, pointValue })
      : addContract({ symbol, name, pointValue })
    if (!ok) {
      setDictError(`合约代码「${symbol}」已存在。`)
      return
    }
    setContractDraft(null)
    setNotice({ tone: 'ok', text: `已保存合约 ${symbol}。` })
  }

  const startWord = (kind: 'session' | 'setup', original: string | null = null) => {
    setDictError(null)
    setWordDraft({ kind, original, value: original ?? '' })
  }

  const submitWord = () => {
    if (!wordDraft) return
    const value = wordDraft.value.trim()
    if (!value) {
      setDictError('名称不能为空。')
      return
    }
    const ok =
      wordDraft.kind === 'session'
        ? wordDraft.original
          ? renameSession(wordDraft.original, value)
          : addSession(value)
        : wordDraft.original
          ? renameSetup(wordDraft.original, value)
          : addSetup(value)
    if (!ok) {
      setDictError(`「${value}」已存在或与原名称相同。`)
      return
    }
    setWordDraft(null)
    setNotice({
      tone: 'ok',
      text: `已保存${wordDraft.kind === 'session' ? '时段' : '形态'}「${value}」。`,
    })
  }

  const startDiscipline = (id: string | null = null, label = '') => {
    setDictError(null)
    setDisciplineDraft({ id, label })
  }

  const submitDiscipline = () => {
    if (!disciplineDraft) return
    const label = disciplineDraft.label.trim()
    if (!label) {
      setDictError('纪律项名称不能为空。')
      return
    }
    const ok = disciplineDraft.id
      ? renameDisciplineItem(disciplineDraft.id, label)
      : addDisciplineItem(label)
    if (!ok) {
      setDictError(`「${label}」已存在或与原名称相同。`)
      return
    }
    setDisciplineDraft(null)
    setNotice({ tone: 'ok', text: `已保存纪律项「${label}」。` })
  }

  const startTag = (original: string | null = null) => {
    setDictError(null)
    setTagDraft({ original, label: original ?? '' })
  }

  const submitTag = () => {
    if (!tagDraft) return
    const label = tagDraft.label.trim()
    if (!label) {
      setDictError('错误标签不能为空。')
      return
    }
    const ok = tagDraft.original
      ? renameMistakeTag(tagDraft.original, label)
      : addMistakeTag(label)
    if (!ok) {
      setDictError(`「${label}」已存在或与原名称相同。`)
      return
    }
    setTagDraft(null)
    setNotice({ tone: 'ok', text: `已保存错误标签「${label}」。` })
  }

  const startChecklist = (setup: string) => {
    setDictError(null)
    const existing = config.checklists.find((entry) => entry.setup === setup)
    setChecklistDraft({
      setup,
      text: existing ? existing.items.map((item) => item.label).join('\n') : '',
    })
  }

  const submitChecklist = () => {
    if (!checklistDraft) return
    const existing = config.checklists.find((entry) => entry.setup === checklistDraft.setup)
    const labels: string[] = []
    for (const line of checklistDraft.text.split('\n')) {
      const label = line.trim()
      if (label && !labels.includes(label)) labels.push(label)
    }
    if (!labels.length) {
      setDictError('至少保留一项检查内容。')
      return
    }
    const items: ChecklistItem[] = labels.map((label) => ({
      id: existing?.items.find((item) => item.label === label)?.id ?? uid('chk'),
      label,
    }))
    saveChecklist({
      id: existing?.id ?? uid('cl'),
      setup: checklistDraft.setup,
      items,
    })
    setChecklistDraft(null)
    setNotice({
      tone: 'ok',
      text: `已保存「${checklistDraft.setup}」的盘前检查清单（${items.length} 项）。`,
    })
  }

  const equityOf = (entry: Account) => {
    const points = buildEquity(
      data.trades.filter((trade) => trade.accountId === entry.id),
      entry.startingEquity,
      data.cashFlows.filter((flow) => flow.accountId === entry.id),
    )
    return points[points.length - 1]?.equity ?? entry.startingEquity
  }

  return (
    <div className="fade-in mx-auto max-w-[820px] px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">设置</h1>
          <p className="mt-1 text-[11.5px] text-muted">账户、数据安全与导入导出</p>
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-faint">
          <span
            className={`h-1.5 w-1.5 rounded-full ${saving || unsaved ? 'bg-warn' : 'bg-gain'}`}
          />
          {saving ? '正在保存…' : unsaved ? '有未保存更改' : '自动保存已开启'}
          <button className="btn btn-secondary h-7 px-2 text-[11px]" onClick={() => void saveNow()}>
            立即保存
          </button>
        </div>
      </div>

      {notice ? (
        <div
          className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[11.5px] ${
            notice.tone === 'ok'
              ? 'border-gain/25 bg-gain-soft text-gain'
              : 'border-loss/25 bg-loss-soft text-loss'
          }`}
        >
          <span>{notice.text}</span>
          <button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>
            关闭
          </button>
        </div>
      ) : null}

      <section className="mt-5 rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="text-[12.5px] font-semibold text-ink">账户</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              每个账户有独立的起始权益、手续费、交易台账、每日复盘与笔记。
            </p>
          </div>
          <button
            className="btn btn-secondary h-8 shrink-0 px-2.5 text-[11px]"
            onClick={() => setCreating(true)}
          >
            <Plus size={13} />
            新建账户
          </button>
        </div>
        <div className="divider" />
        <div className="divide-y divide-line">
          {accounts.map((entry) => {
            const active = entry.id === account.id
            const count = data.trades.filter((trade) => trade.accountId === entry.id).length
            const noteCount = data.notes.filter((note) => note.accountId === entry.id).length
            const reviewCount = data.dailyReviews.filter(
              (review) => review.accountId === entry.id,
            ).length
            return (
              <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                <button
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    active
                      ? 'border-accent bg-accent text-white'
                      : 'border-line-2 bg-white hover:border-accent/50'
                  }`}
                  onClick={() => setActiveAccount(entry.id)}
                  aria-label={active ? `${entry.name}（当前）` : `切换到 ${entry.name}`}
                >
                  {active ? <Check size={9} strokeWidth={3} /> : null}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12.5px] font-medium text-ink">
                      {entry.name}
                    </span>
                    {active ? (
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-medium text-accent">
                        当前
                      </span>
                    ) : null}
                  </div>
                  <div className="num mt-0.5 truncate text-[10.5px] text-faint">
                    权益 ${fmtMoney(equityOf(entry), false)} · 起始 $
                    {fmtMoney(entry.startingEquity, false)} · 手续费 $
                    {fmtMoney(entry.feePerContract)}/手 · {count} 笔 · {reviewCount} 篇复盘 ·{' '}
                    {noteCount} 篇笔记
                  </div>
                </div>

                {removing === entry.id ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      className="btn btn-danger h-7 px-2 text-[10.5px]"
                      onClick={() => {
                        deleteAccount(entry.id)
                        setRemoving(null)
                        setNotice({
                          tone: 'ok',
                          text: `已删除「${entry.name}」及其 ${count} 笔交易、${reviewCount} 篇复盘、${noteCount} 篇笔记。`,
                        })
                      }}
                    >
                      确认删除
                    </button>
                    <button
                      className="btn btn-secondary h-7 px-2 text-[10.5px]"
                      onClick={() => setRemoving(null)}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      className="icon-btn h-7 w-7"
                      title="编辑账户"
                      aria-label={`编辑 ${entry.name}`}
                      onClick={() => {
                        if (!active) setActiveAccount(entry.id)
                        setEditing(entry)
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="icon-btn h-7 w-7 hover:text-loss disabled:cursor-not-allowed disabled:opacity-35"
                      title={accounts.length <= 1 ? '至少保留一个账户' : '删除账户'}
                      aria-label={`删除 ${entry.name}`}
                      disabled={accounts.length <= 1}
                      onClick={() => setRemoving(entry.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="border-t border-line bg-list px-5 py-2.5 text-[10.5px] text-faint">
          共 {accounts.length} 个账户 · 删除账户会连同其交易、每日复盘、资金流水、笔记与 K 线图一起删除，无法恢复。
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div>
            <h2 className="text-[12.5px] font-semibold text-ink">资金流水</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              出入金与分红单独记录；权益曲线包含它们，收益率与回撤只衡量交易表现。
            </p>
          </div>
          <button
            className="btn btn-secondary h-8 shrink-0 px-2.5 text-[11px]"
            onClick={() => {
              setEditingFlow(null)
              setFlowOpen(true)
            }}
          >
            <Plus size={13} />
            记录资金变动
          </button>
        </div>
        <div className="divider" />
        <div className="grid grid-cols-4 divide-x divide-line border-b border-line">
          <div className="px-4 py-2.5">
            <div className="text-[9.5px] text-faint">净流入</div>
            <div
              className={`num mt-0.5 text-[12.5px] font-semibold ${
                flowSummary.net > 0 ? 'text-gain' : flowSummary.net < 0 ? 'text-loss' : 'text-ink'
              }`}
            >
              {fmtSignedMoney(flowSummary.net, true)}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[9.5px] text-faint">入金</div>
            <div className="num mt-0.5 text-[12.5px] font-medium text-ink">
              ${fmtMoney(flowSummary.deposits, false)}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[9.5px] text-faint">出金</div>
            <div className="num mt-0.5 text-[12.5px] font-medium text-ink">
              ${fmtMoney(flowSummary.withdrawals, false)}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[9.5px] text-faint">分红 / 利息</div>
            <div className="num mt-0.5 text-[12.5px] font-medium text-ink">
              ${fmtMoney(flowSummary.dividends, false)}
            </div>
          </div>
        </div>

        {cashFlows.length ? (
          <div className="divide-y divide-line">
            {cashFlows.map((flow) => {
              const kind = CASH_FLOW_KINDS.find((item) => item.key === flow.kind)
              const sign = kind?.sign ?? 1
              return (
                <div key={flow.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="num w-[74px] shrink-0 text-[10.5px] text-faint">
                    {flow.date}
                  </span>
                  <span
                    className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[9.5px] ${
                      sign > 0 ? 'bg-gain-soft text-gain' : 'bg-warn-soft text-warn'
                    }`}
                  >
                    {kind?.short ?? flow.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                    {flow.note || '—'}
                  </span>
                  <span
                    className={`num shrink-0 text-[11.5px] font-medium ${
                      sign > 0 ? 'text-gain' : 'text-loss'
                    }`}
                  >
                    {fmtSignedMoney(flow.amount * sign, true)}
                  </span>
                  {removingFlow === flow.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="btn btn-danger h-6 px-2 text-[10px]"
                        onClick={() => {
                          deleteCashFlow(flow.id)
                          setRemovingFlow(null)
                          setNotice({ tone: 'ok', text: '资金流水已删除，权益已重新计算。' })
                        }}
                      >
                        确认删除
                      </button>
                      <button
                        className="btn btn-secondary h-6 px-2 text-[10px]"
                        onClick={() => setRemovingFlow(null)}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        className="icon-btn h-6 w-6"
                        title="编辑资金流水"
                        aria-label="编辑资金流水"
                        onClick={() => {
                          setEditingFlow(flow)
                          setFlowOpen(true)
                        }}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        className="icon-btn h-6 w-6 hover:text-loss"
                        title="删除资金流水"
                        aria-label="删除资金流水"
                        onClick={() => setRemovingFlow(flow.id)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            <p className="text-[11px] text-muted">还没有资金流水</p>
            <p className="mt-1 text-[10px] text-faint">
              记录入金、出金或分红后，账户权益会按实际资金变化。
            </p>
          </div>
        )}
        <div className="border-t border-line bg-list px-5 py-2.5 text-[10.5px] text-faint">
          当前账户累计净流入 {fmtSignedMoney(flowSummary.net, true)} · 流水只影响「{account.name}」
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="px-5 py-4">
          <h2 className="text-[12.5px] font-semibold text-ink">交易字典</h2>
          <p className="mt-0.5 text-[10.5px] text-faint">
            合约、时段、形态、纪律项、错误标签与盘前检查清单都可以自己维护；改名会同步历史记录。
          </p>
        </div>
        <div className="divider" />

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11.5px] font-medium text-ink">合约</div>
              <div className="mt-0.5 text-[10px] text-faint">点值用于计算盈亏与 R 倍数</div>
            </div>
            <button
              className="btn btn-secondary h-7 shrink-0 px-2 text-[10.5px]"
              onClick={() => startContract()}
            >
              <Plus size={12} />
              添加合约
            </button>
          </div>
          <div className="mt-2.5 overflow-hidden rounded-lg border border-line">
            {config.contracts.map((contract) => {
              const usage = data.trades.filter((trade) => trade.symbol === contract.symbol).length
              return (
                <div
                  key={contract.symbol}
                  className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5 last:border-b-0"
                >
                  <span className="w-12 shrink-0 font-mono text-[11px] font-semibold text-ink">
                    {contract.symbol}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
                    {contract.name}
                  </span>
                  <span className="num shrink-0 text-[10.5px] text-muted">
                    ${fmtMoney(contract.pointValue, false)}/点
                  </span>
                  <span className="num w-9 shrink-0 text-right text-[10px] text-faint">
                    {usage} 笔
                  </span>
                  <button
                    className="icon-btn h-6 w-6"
                    title="编辑合约"
                    aria-label={`编辑 ${contract.symbol}`}
                    onClick={() => startContract(contract)}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    className="icon-btn h-6 w-6 hover:text-loss disabled:cursor-not-allowed disabled:opacity-30"
                    title={
                      usage > 0
                        ? '仍有交易使用该合约，不能删除'
                        : config.contracts.length <= 1
                          ? '至少保留一个合约'
                          : '删除合约'
                    }
                    aria-label={`删除 ${contract.symbol}`}
                    disabled={usage > 0 || config.contracts.length <= 1}
                    onClick={() => {
                      if (deleteContract(contract.symbol)) {
                        setNotice({ tone: 'ok', text: `已删除合约 ${contract.symbol}。` })
                      }
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="divider" />

        <div className="grid grid-cols-2 gap-5 px-5 py-4">
          {(['session', 'setup'] as const).map((kind) => {
            const list = kind === 'session' ? config.sessions : config.setups
            const label = kind === 'session' ? '时段' : '形态'
            const hint = kind === 'session' ? '记账时可选的时间段' : '交易形态与策略标签'
            return (
              <div key={kind}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11.5px] font-medium text-ink">{label}</div>
                    <div className="mt-0.5 text-[10px] text-faint">{hint}</div>
                  </div>
                  <button
                    className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10.5px]"
                    onClick={() => startWord(kind)}
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {list.map((name) => {
                    const usage = data.trades.filter((trade) =>
                      kind === 'session' ? trade.session === name : trade.setup === name,
                    ).length
                    const locked = usage > 0 || list.length <= 1
                    return (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-md border border-line bg-list py-1 pl-2 pr-1 text-[10.5px] text-ink-2"
                      >
                        <button
                          className="max-w-[120px] truncate hover:text-accent"
                          title="点击改名"
                          onClick={() => startWord(kind, name)}
                        >
                          {name}
                        </button>
                        {usage > 0 ? (
                          <span className="num text-[9px] text-faint">{usage}</span>
                        ) : null}
                        <button
                          className="flex h-4 w-4 items-center justify-center rounded text-faint hover:bg-white hover:text-loss disabled:cursor-not-allowed disabled:opacity-30"
                          title={
                            usage > 0
                              ? '仍有交易使用，不能删除'
                              : list.length <= 1
                                ? `至少保留一个${label}`
                                : `删除${label}`
                          }
                          aria-label={`删除${label} ${name}`}
                          disabled={locked}
                          onClick={() => {
                            const ok =
                              kind === 'session' ? deleteSession(name) : deleteSetup(name)
                            if (ok) setNotice({ tone: 'ok', text: `已删除${label}「${name}」。` })
                          }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    )
                  })}
                  {!list.length ? (
                    <span className="text-[10px] text-faint">还没有条目</span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        <div className="divider" />

        <div className="grid grid-cols-2 gap-5 px-5 py-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11.5px] font-medium text-ink">过程纪律项</div>
                <div className="mt-0.5 text-[10px] text-faint">每笔交易逐项勾选，参与执行分</div>
              </div>
              <button
                className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10.5px]"
                onClick={() => startDiscipline()}
              >
                <Plus size={12} />
                添加
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {config.disciplineItems.map((item) => {
                const usage = data.trades.filter(
                  (trade) => typeof trade.discipline[item.id] === 'boolean',
                ).length
                const locked = usage > 0 || config.disciplineItems.length <= 1
                return (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-list py-1 pl-2 pr-1 text-[10.5px] text-ink-2"
                  >
                    <button
                      className="max-w-[150px] truncate hover:text-accent"
                      title="点击改名"
                      onClick={() => startDiscipline(item.id, item.label)}
                    >
                      {item.label}
                    </button>
                    {usage > 0 ? (
                      <span className="num text-[9px] text-faint">{usage}</span>
                    ) : null}
                    <button
                      className="flex h-4 w-4 items-center justify-center rounded text-faint hover:bg-white hover:text-loss disabled:cursor-not-allowed disabled:opacity-30"
                      title={
                        usage > 0
                          ? '已有交易记录该项，不能删除'
                          : config.disciplineItems.length <= 1
                            ? '至少保留一个纪律项'
                            : '删除纪律项'
                      }
                      aria-label={`删除纪律项 ${item.label}`}
                      disabled={locked}
                      onClick={() => {
                        if (deleteDisciplineItem(item.id)) {
                          setNotice({ tone: 'ok', text: `已删除纪律项「${item.label}」。` })
                        }
                      }}
                    >
                      <X size={10} />
                    </button>
                  </span>
                )
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11.5px] font-medium text-ink">错误标签</div>
                <div className="mt-0.5 text-[10px] text-faint">标记过程错误，并计入错误成本</div>
              </div>
              <button
                className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10.5px]"
                onClick={() => startTag()}
              >
                <Plus size={12} />
                添加
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {config.mistakeTags.map((tag) => {
                const usage = data.trades.filter((trade) => trade.mistakes?.includes(tag)).length
                const reviewUsage = data.dailyReviews.filter((review) =>
                  review.violations.includes(tag),
                ).length
                const locked = usage > 0 || reviewUsage > 0
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-list py-1 pl-2 pr-1 text-[10.5px] text-ink-2"
                  >
                    <button
                      className="max-w-[130px] truncate hover:text-accent"
                      title="点击改名"
                      onClick={() => startTag(tag)}
                    >
                      {tag}
                    </button>
                    {usage + reviewUsage > 0 ? (
                      <span className="num text-[9px] text-faint">{usage + reviewUsage}</span>
                    ) : null}
                    <button
                      className="flex h-4 w-4 items-center justify-center rounded text-faint hover:bg-white hover:text-loss disabled:cursor-not-allowed disabled:opacity-30"
                      title={locked ? '已有交易或复盘使用该标签，不能删除' : '删除错误标签'}
                      aria-label={`删除错误标签 ${tag}`}
                      disabled={locked}
                      onClick={() => {
                        if (deleteMistakeTag(tag)) {
                          setNotice({ tone: 'ok', text: `已删除错误标签「${tag}」。` })
                        }
                      }}
                    >
                      <X size={10} />
                    </button>
                  </span>
                )
              })}
              {!config.mistakeTags.length ? (
                <span className="text-[10px] text-faint">还没有错误标签</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11.5px] font-medium text-ink">盘前检查清单</div>
              <div className="mt-0.5 text-[10px] text-faint">
                每个形态一组检查项，写每日复盘时按形态勾选；留空不会清空已有清单。
              </div>
            </div>
            <span className="num shrink-0 text-[10px] text-faint">
              {config.checklists.length} 个形态已配置
            </span>
          </div>
          <div className="mt-2.5 overflow-hidden rounded-lg border border-line">
            {config.setups.map((setup) => {
              const checklist = config.checklists.find((entry) => entry.setup === setup)
              return (
                <div
                  key={setup}
                  className="flex items-center gap-2 border-b border-line/70 px-2.5 py-1.5 last:border-b-0"
                >
                  <ListChecks
                    size={12}
                    className={checklist ? 'shrink-0 text-accent' : 'shrink-0 text-faint'}
                  />
                  <span className="w-[104px] shrink-0 truncate text-[11px] text-ink">
                    {setup}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-faint">
                    {checklist
                      ? checklist.items.map((item) => item.label).join(' · ')
                      : '未配置'}
                  </span>
                  {checklist ? (
                    <span className="num shrink-0 text-[9.5px] text-faint">
                      {checklist.items.length} 项
                    </span>
                  ) : null}
                  {checklist && removingChecklist === checklist.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="btn btn-danger h-6 px-2 text-[10px]"
                        onClick={() => {
                          deleteChecklist(checklist.id)
                          setRemovingChecklist(null)
                          setNotice({
                            tone: 'ok',
                            text: `已删除「${setup}」的盘前检查清单。`,
                          })
                        }}
                      >
                        确认删除
                      </button>
                      <button
                        className="btn btn-secondary h-6 px-2 text-[10px]"
                        onClick={() => setRemovingChecklist(null)}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        className="icon-btn h-6 w-6"
                        title={checklist ? '编辑检查清单' : '配置检查清单'}
                        aria-label={`${checklist ? '编辑' : '配置'} ${setup} 的检查清单`}
                        onClick={() => startChecklist(setup)}
                      >
                        <Pencil size={11} />
                      </button>
                      {checklist ? (
                        <button
                          className="icon-btn h-6 w-6 hover:text-loss"
                          title="删除检查清单"
                          aria-label={`删除 ${setup} 的检查清单`}
                          onClick={() => setRemovingChecklist(checklist.id)}
                        >
                          <Trash2 size={11} />
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="border-t border-line bg-list px-5 py-2.5 text-[10.5px] leading-relaxed text-faint">
          点击名称即可改名；纪律项改名不影响历史勾选，错误标签改名会同步历史交易与复盘。仍被使用的条目不能删除。
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Database size={15} />
          </span>
          <div>
            <h2 className="text-[12.5px] font-semibold text-ink">本机数据</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              Rust 后端写入 JSON 文件，改动后 250ms 自动保存，并保留一份备份。
            </p>
          </div>
        </div>
        <div className="divider" />
        <div className="px-5 py-4">
          <div className="field-label">数据文件路径</div>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-line bg-list px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-2">
              {storagePath || '浏览器预览模式：使用 localStorage 临时存储'}
            </code>
            <button
              className="btn btn-secondary h-8 shrink-0 px-2.5 text-[11px]"
              onClick={() => void copyPath()}
              disabled={!storagePath}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            K 线图保存在同目录下的
            <span className="font-mono"> charts/ </span>
            文件夹。同目录下的
            <span className="font-mono"> meridian.backup.json </span>
            是上一次的自动备份。若文件损坏，会保留为
            <span className="font-mono"> meridian.corrupt-时间戳.json</span> 而不会被覆盖。
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-list px-3 py-2 text-[10.5px] text-muted">
            <Wallet size={13} className="shrink-0 text-accent" />
            当前账户「{account.name}」：{trades.length} 笔交易（{openCount} 笔持仓中）·
            {reviews.length} 篇每日复盘 · {notes.length} 篇笔记 · 起始权益 $
            {fmtMoney(account.startingEquity, false)}
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="flex items-start gap-2.5 px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Database size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[12.5px] font-semibold text-ink">完整备份与恢复</h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
              包含全部账户、交易、笔记、交易字典与 K 线截图。每天首次启动或首次保存时自动生成一份，
              保留最近 {backupStatus?.keep ?? 14} 份。
            </p>
          </div>
        </div>
        <div className="divider" />
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => void exportBackup()}
              disabled={!backupSupported() || backupBusy !== null}
            >
              <Download size={14} />
              {backupBusy === 'export' ? '正在导出…' : '导出完整备份'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => void chooseRestore()}
              disabled={!backupSupported() || backupBusy !== null}
            >
              <Upload size={14} />
              从备份恢复
            </button>
            {!backupSupported() ? (
              <span className="text-[10.5px] text-faint">仅桌面版可用</span>
            ) : null}
          </div>
          <div className="mt-3 rounded-lg bg-list px-3 py-2.5 text-[10.5px] leading-relaxed text-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                每日自动备份：
                {backupStatus
                  ? backupStatus.count
                    ? `${backupStatus.count} 份`
                    : '尚未生成'
                  : backupSupported()
                    ? '读取中…'
                    : '仅桌面版生成'}
              </span>
              <span className="num text-faint">
                {backupStatus?.latest
                  ? `最近 ${backupStatus.latest.day} · ${fmtBytes(backupStatus.latest.size)}`
                  : `保留最近 ${backupStatus?.keep ?? 14} 份`}
              </span>
            </div>
            {backupStatus?.dir ? (
              <div className="mt-1 break-all font-mono text-[9.5px] text-faint">
                {backupStatus.dir}
              </div>
            ) : null}
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            恢复会替换当前所有账户的数据与 K 线图；操作前会先生成一份当前状态的安全备份，恢复完成后应用会自动重新加载。
          </p>
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-list text-muted ring-1 ring-line">
            <FileSpreadsheet size={15} />
          </span>
          <div>
            <h2 className="text-[12.5px] font-semibold text-ink">CSV 导入与导出</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              导入到当前账户「{account.name}」，支持中文或英文表头，重复交易会自动跳过。
            </p>
          </div>
        </div>
        <div className="divider" />
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void onImport(event.target.files?.[0] ?? null)}
          />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} />
            导入 CSV
          </button>
          <button
            className="btn btn-secondary"
            onClick={() =>
              downloadCsv(
                trades,
                `meridian-${account.name.replace(/[\\/:*?"<>|]+/g, '')}-${todayISO()}.csv`,
              )
            }
            disabled={!trades.length}
          >
            <Download size={14} />
            导出当前账户
          </button>
          <span className="ml-auto text-[10.5px] text-faint">
            识别列：日期、时间、合约、方向、手数、入场价、止损价、出场价、形态、备注
          </span>
        </div>
        <div className="border-t border-line bg-list px-5 py-2.5 text-[10.5px] leading-relaxed text-faint">
          缺少盈亏或 R 时，会按合约点值、入场/出场价与手续费自动计算；日期支持
          2026-11-04、2026/11/04 与 11/04/2026。
        </div>
      </section>

      <Mt5Sync />

      <section className="mt-3 rounded-xl border border-line bg-white">
        <div className="px-5 py-4">
          <h2 className="text-[12.5px] font-semibold text-ink">示例与重置</h2>
          <p className="mt-0.5 text-[10.5px] text-faint">
            示例数据只在你主动点击时写入，用于体验界面与统计。
          </p>
        </div>
        <div className="divider" />
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-medium text-ink">载入示例数据</div>
              <div className="mt-0.5 text-[10.5px] text-muted">
                会替换全部账户、交易与笔记，示例数据放在独立账户中。
              </div>
            </div>
            {demoConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-danger h-7 px-2.5 text-[11px]"
                  onClick={() => {
                    loadDemo()
                    setDemoConfirm(false)
                    setNotice({ tone: 'ok', text: '已载入示例账户，可随时删除。' })
                  }}
                >
                  确认载入
                </button>
                <button
                  className="btn btn-secondary h-7 px-2.5 text-[11px]"
                  onClick={() => setDemoConfirm(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => setDemoConfirm(true)}>
                <Sparkles size={13} />
                载入示例
              </button>
            )}
          </div>

          <div className="divider" />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-medium text-ink">
                清空当前账户的交易、复盘、资金流水与笔记
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted">
                只影响「{account.name}」，其他账户与账户设置保持不变。
              </div>
            </div>
            {clearConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-danger h-7 px-2.5 text-[11px]"
                  onClick={() => {
                    clearAll()
                    setClearConfirm(false)
                    setNotice({
                      tone: 'ok',
                      text: `已清空「${account.name}」的交易、每日复盘、资金流水与笔记。`,
                    })
                  }}
                >
                  确认清空
                </button>
                <button
                  className="btn btn-secondary h-7 px-2.5 text-[11px]"
                  onClick={() => setClearConfirm(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary text-loss"
                onClick={() => setClearConfirm(true)}
                disabled={!trades.length && !notes.length && !reviews.length && !cashFlows.length}
              >
                <Trash2 size={13} />
                清空数据
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-faint">
        <span>MERIDIAN 0.5.0 · Tauri 2 · Rust · React · Tailwind CSS</span>
        <span>数据仅保存在本机，不上传任何服务器。</span>
      </div>

      {contractDraft ? (
        <Modal
          open
          onClose={() => setContractDraft(null)}
          title={contractDraft.original ? '编辑合约' : '添加合约'}
          subtitle="点值参与盈亏与 R 倍数的计算"
          width={440}
          footer={
            <>
              <span className="text-[10.5px] text-faint">
                {contractDraft.original ? '修改代码会同步历史交易' : '保存后可立刻在记账时选择'}
              </span>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary" onClick={() => setContractDraft(null)}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={submitContract}>
                  <Check size={14} />
                  保存
                </button>
              </div>
            </>
          }
        >
          <div className="space-y-3.5">
            {dictError ? (
              <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
                {dictError}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">合约代码</span>
                <input
                  name="symbol"
                  className="input font-mono uppercase"
                  placeholder="例如：YM"
                  value={contractDraft.symbol}
                  onChange={(event) =>
                    setContractDraft({ ...contractDraft, symbol: event.target.value })
                  }
                />
              </label>
              <label>
                <span className="field-label">合约名称</span>
                <input
                  name="name"
                  className="input"
                  placeholder="例如：E-mini Dow"
                  value={contractDraft.name}
                  onChange={(event) =>
                    setContractDraft({ ...contractDraft, name: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="block">
              <span className="field-label">每点价值（USD）</span>
              <input
                name="pointValue"
                type="number"
                min={0}
                step="any"
                className="input num"
                value={contractDraft.pointValue}
                onChange={(event) =>
                  setContractDraft({ ...contractDraft, pointValue: event.target.value })
                }
              />
            </label>
          </div>
        </Modal>
      ) : null}

      {wordDraft ? (
        <Modal
          open
          onClose={() => setWordDraft(null)}
          title={`${wordDraft.original ? '重命名' : '添加'}${wordDraft.kind === 'session' ? '时段' : '形态'}`}
          subtitle={wordDraft.original ? '改名会同步更新所有历史交易' : '保存后立即可在记账时选择'}
          width={380}
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button className="btn btn-secondary" onClick={() => setWordDraft(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={submitWord}>
                <Check size={14} />
                保存
              </button>
            </div>
          }
        >
          <div className="space-y-3.5">
            {dictError ? (
              <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
                {dictError}
              </div>
            ) : null}
            <label className="block">
              <span className="field-label">名称</span>
              <input
                name="word"
                className="input"
                autoFocus
                placeholder={wordDraft.kind === 'session' ? '例如：夜盘' : '例如：二次突破'}
                value={wordDraft.value}
                onChange={(event) => setWordDraft({ ...wordDraft, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitWord()
                }}
              />
            </label>
          </div>
        </Modal>
      ) : null}

      {disciplineDraft ? (
        <Modal
          open
          onClose={() => setDisciplineDraft(null)}
          title={`${disciplineDraft.id ? '重命名' : '添加'}纪律项`}
          subtitle="每笔交易会逐项勾选，参与执行分与纪律通过率"
          width={380}
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button className="btn btn-secondary" onClick={() => setDisciplineDraft(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={submitDiscipline}>
                <Check size={14} />
                保存
              </button>
            </div>
          }
        >
          <div className="space-y-3.5">
            {dictError ? (
              <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
                {dictError}
              </div>
            ) : null}
            <label className="block">
              <span className="field-label">名称</span>
              <input
                name="discipline"
                className="input"
                autoFocus
                placeholder="例如：进场前确认盈亏比"
                value={disciplineDraft.label}
                onChange={(event) =>
                  setDisciplineDraft({ ...disciplineDraft, label: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitDiscipline()
                }}
              />
            </label>
            <p className="text-[10px] leading-relaxed text-faint">
              改名不会影响历史交易的勾选结果；已有交易记录的纪律项不能删除。
            </p>
          </div>
        </Modal>
      ) : null}

      {tagDraft ? (
        <Modal
          open
          onClose={() => setTagDraft(null)}
          title={`${tagDraft.original ? '重命名' : '添加'}错误标签`}
          subtitle={tagDraft.original ? '改名会同步历史交易与每日复盘' : '保存后可在记账与复盘时选择'}
          width={380}
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button className="btn btn-secondary" onClick={() => setTagDraft(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={submitTag}>
                <Check size={14} />
                保存
              </button>
            </div>
          }
        >
          <div className="space-y-3.5">
            {dictError ? (
              <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
                {dictError}
              </div>
            ) : null}
            <label className="block">
              <span className="field-label">名称</span>
              <input
                name="mistakeTag"
                className="input"
                autoFocus
                placeholder="例如：逆势加仓"
                value={tagDraft.label}
                onChange={(event) => setTagDraft({ ...tagDraft, label: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitTag()
                }}
              />
            </label>
            <p className="text-[10px] leading-relaxed text-faint">
              仍被交易或复盘使用的标签不能删除，改名后历史记录会一并更新。
            </p>
          </div>
        </Modal>
      ) : null}

      {checklistDraft ? (
        <Modal
          open
          onClose={() => setChecklistDraft(null)}
          title={`盘前检查清单 · ${checklistDraft.setup}`}
          subtitle="每行一项；保存后会出现在每日复盘的盘前检查里"
          width={480}
          footer={
            <>
              <span className="text-[10.5px] text-faint">留空无法保存；删除请用列表右侧按钮</span>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary" onClick={() => setChecklistDraft(null)}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={submitChecklist}>
                  <Check size={14} />
                  保存清单
                </button>
              </div>
            </>
          }
        >
          <div className="space-y-3.5">
            {dictError ? (
              <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
                {dictError}
              </div>
            ) : null}
            <label className="block">
              <span className="field-label">检查项</span>
              <textarea
                name="checklist"
                className="textarea min-h-[160px]"
                autoFocus
                placeholder={'等待回撤到关键均线\n回撤低点未跌破前一波段\n目标至少为风险的 2 倍'}
                value={checklistDraft.text}
                onChange={(event) =>
                  setChecklistDraft({ ...checklistDraft, text: event.target.value })
                }
              />
            </label>
            <p className="text-[10px] leading-relaxed text-faint">
              新增或改名会生成新的检查项；已有复盘中的旧勾选会保留但不再显示。
            </p>
          </div>
        </Modal>
      ) : null}

      {restoreSource ? (
        <Modal
          open
          onClose={() => {
            if (backupBusy !== 'restore') setRestoreSource(null)
          }}
          title="恢复完整备份"
          subtitle="当前数据将被替换"
          width={520}
          footer={
            <div className="ml-auto flex items-center gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => setRestoreSource(null)}
                disabled={backupBusy === 'restore'}
              >
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={() => void confirmRestore()}
                disabled={backupBusy === 'restore'}
              >
                {backupBusy === 'restore' ? '正在恢复…' : '确认恢复'}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-[11.5px] leading-relaxed text-ink-2">
            <div className="rounded-lg border border-warn/25 bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">
              恢复会替换当前所有账户、交易、笔记、交易字典与 K 线图，且无法撤销。
            </div>
            <div>
              <div className="field-label">备份文件</div>
              <div className="break-all rounded-md border border-line bg-list px-2.5 py-2 font-mono text-[10.5px] text-ink-2">
                {restoreSource.path}
              </div>
            </div>
            <p className="text-[10.5px] leading-relaxed text-faint">
              恢复前会自动生成一份当前数据的完整安全备份；恢复完成后应用会自动重新加载。
              恢复过程中请勿关闭应用。
            </p>
          </div>
        </Modal>
      ) : null}

      <AccountDialog
        open={creating}
        account={null}
        onClose={() => setCreating(false)}
        onSubmit={createAccount}
      />
      <AccountDialog
        open={Boolean(editing)}
        account={editing}
        onClose={() => setEditing(null)}
        onSubmit={saveAccount}
      />
      <CashFlowDialog
        open={flowOpen}
        flow={editingFlow}
        accountId={account.id}
        onClose={() => {
          setFlowOpen(false)
          setEditingFlow(null)
        }}
        onSubmit={(flow) => {
          saveCashFlow(flow)
          setFlowOpen(false)
          setEditingFlow(null)
          const label = CASH_FLOW_KINDS.find((item) => item.key === flow.kind)?.label ?? '资金变动'
          setNotice({
            tone: 'ok',
            text: `已保存 ${flow.date} ${label} ${fmtSignedMoney(
              flow.amount * (CASH_FLOW_KINDS.find((item) => item.key === flow.kind)?.sign ?? 1),
              true,
            )}，权益已重新计算。`,
          })
        }}
      />
    </div>
  )
}
