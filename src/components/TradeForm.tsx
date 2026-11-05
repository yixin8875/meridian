import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import type {
  ChartRef,
  Discipline,
  Grade,
  Side,
  Trade,
  TradeStatus,
  TradingConfig,
} from '../types'
import { DISCIPLINE_ITEMS, MISTAKE_TAGS, pointValueOf } from '../data/contracts'
import { fmtMoney, fmtR, fmtSignedMoney, todayISO, uid } from '../lib/format'
import { currentEquity, riskStatus, suggestedQty } from '../lib/stats'
import { useApp } from '../store'
import { Modal } from './primitives'
import { ChartLightbox, ChartUploader } from './Charts'
import { deleteChart, prepareChart, saveChart } from '../lib/charts'

interface FormState {
  date: string
  entryTime: string
  exitTime: string
  symbol: string
  side: Side
  qty: string
  entry: string
  stop: string
  target: string
  exit: string
  current: string
  setup: string
  session: string
  status: TradeStatus
  note: string
  discipline: Discipline
  mistakes: string[]
}

const BLANK: FormState = {
  date: '',
  entryTime: '09:35',
  exitTime: '10:10',
  symbol: 'ES',
  side: 'L',
  qty: '1',
  entry: '',
  stop: '',
  target: '',
  exit: '',
  current: '',
  setup: '',
  session: '',
  status: 'closed',
  note: '',
  discipline: {
    stopPlanned: true,
    stopHonored: true,
    sizePlanned: true,
    journaled: false,
  },
  mistakes: [],
}

function toForm(trade: Trade | null, config: TradingConfig): FormState {
  const setup = config.setups[0] ?? '未分类'
  const session = config.sessions[0] ?? '早盘'
  if (!trade) {
    return {
      ...BLANK,
      date: todayISO(),
      setup,
      session,
      discipline: { ...BLANK.discipline },
    }
  }
  return {
    date: trade.date,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    symbol: trade.symbol,
    side: trade.side,
    qty: String(trade.qty),
    entry: trade.entry ? String(trade.entry) : '',
    stop: trade.stop ? String(trade.stop) : '',
    target: trade.target ? String(trade.target) : '',
    exit: trade.exit ? String(trade.exit) : '',
    current: trade.current ? String(trade.current) : '',
    setup: trade.setup,
    session: trade.session,
    status: trade.status,
    note: trade.note,
    discipline: { ...trade.discipline },
    mistakes: [...(trade.mistakes ?? [])],
  }
}

function gradeOf(r: number): Grade {
  if (r >= 1.5) return 'A'
  if (r >= -0.4) return 'B'
  return 'C'
}

const num = (value: string): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function chartName(file: File): string {
  const base = file.name ? file.name.replace(/\.[^.]+$/, '') : ''
  if (base && !/^image$/i.test(base) && base.length <= 60) return `${base}.jpg`
  const now = new Date()
  const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `K线截图-${stamp}.jpg`
}

export function TradeForm({
  open,
  trade,
  accountId,
  feePerContract,
  onClose,
  onSubmit,
}: {
  open: boolean
  trade: Trade | null
  accountId: string
  feePerContract: number
  onClose: () => void
  onSubmit: (trade: Trade) => void
}) {
  const { config, data, account } = useApp()
  const [form, setForm] = useState<FormState>(BLANK)
  const [error, setError] = useState<string | null>(null)
  const [charts, setCharts] = useState<ChartRef[]>([])
  const [chartBusy, setChartBusy] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const pending = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setForm(toForm(trade, config))
    setCharts(trade?.charts ?? [])
    pending.current = new Set()
    setLightbox(null)
    setError(null)
  }, [open, trade, config])

  const addFiles = useCallback(async (files: File[]) => {
    setChartBusy(true)
    setError(null)
    try {
      for (const file of files) {
        const prepared = await prepareChart(file)
        const id = uid('chart')
        await saveChart(id, prepared.dataUrl)
        pending.current.add(id)
        setCharts((prev) => [
          ...prev,
          {
            id,
            name: chartName(file),
            addedAt: todayISO(),
            width: prepared.width,
            height: prepared.height,
          },
        ])
      }
    } catch (err) {
      setError(`图片处理失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setChartBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))
      if (!files.length) return
      event.preventDefault()
      void addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, addFiles])

  const close = useCallback(() => {
    for (const id of pending.current) void deleteChart(id)
    pending.current.clear()
    setLightbox(null)
    onClose()
  }, [onClose])

  const removeChart = (id: string) => {
    if (pending.current.has(id)) {
      pending.current.delete(id)
      void deleteChart(id)
    }
    setCharts((prev) => prev.filter((chart) => chart.id !== id))
  }

  const accountTrades = useMemo(
    () => data.trades.filter((item) => item.accountId === account.id),
    [data.trades, account.id],
  )
  const equity = useMemo(
    () =>
      currentEquity(
        accountTrades,
        account.startingEquity,
        data.cashFlows.filter((flow) => flow.accountId === account.id),
      ),
    [accountTrades, account.startingEquity, account.id, data.cashFlows],
  )
  const riskState = useMemo(
    () => riskStatus(accountTrades, account.risk, todayISO()),
    [accountTrades, account.risk],
  )

  const calc = useMemo(() => {
    const pointValue = pointValueOf(form.symbol, config.contracts)
    const qty = Math.max(0, Math.round(num(form.qty)))
    const entry = num(form.entry)
    const stop = num(form.stop)
    const out = form.status === 'open' ? num(form.current) : num(form.exit)
    const direction = form.side === 'L' ? 1 : -1
    const gross = (out - entry) * direction * pointValue * qty
    const fees = qty * feePerContract
    const pnl = form.status === 'closed' && out ? gross - fees : gross
    const risk = Math.abs(entry - stop) * pointValue * qty
    const r = risk > 0 ? gross / risk : 0
    const session = form.session || config.sessions[0] || '早盘'
    const riskPct = equity > 0 ? (risk / equity) * 100 : 0
    const suggested = suggestedQty(
      equity,
      account.risk.riskPerTradePct,
      entry,
      stop,
      pointValue,
    )
    return {
      pointValue,
      qty,
      gross,
      fees,
      pnl,
      risk,
      riskPct,
      suggested,
      r,
      session,
      valid:
        Boolean(form.date) &&
        qty > 0 &&
        entry > 0 &&
        stop > 0 &&
        stop !== entry &&
        (form.status === 'open' ? num(form.current) > 0 : num(form.exit) > 0),
    }
  }, [
    form,
    feePerContract,
    config.contracts,
    config.sessions,
    equity,
    account.risk.riskPerTradePct,
  ])

  const riskWarnings = [
    riskState.dailyLimitHit
      ? `今日已实现 ${fmtSignedMoney(riskState.todayPnl, true)}，达到每日亏损上限 ${fmtSignedMoney(-riskState.dailyLimit, true)}`
      : '',
    riskState.streakHit
      ? `连续亏损 ${riskState.losingStreak} 笔，达到上限 ${riskState.streakLimit} 笔`
      : '',
  ].filter(Boolean)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = () => {
    if (!calc.valid) {
      setError(
        form.status === 'open'
          ? '请填写日期、手数、入场价、止损价与当前价（止损不能等于入场价）。'
          : '请填写日期、手数、入场价、止损价与出场价（止损不能等于入场价）。',
      )
      return
    }
    pending.current.clear()
    const next: Trade = {
      id: trade?.id ?? uid('t'),
      accountId: trade?.accountId ?? accountId,
      date: form.date,
      entryTime: form.entryTime || '09:30',
      exitTime: form.status === 'open' ? '' : form.exitTime,
      symbol: form.symbol,
      side: form.side,
      qty: calc.qty,
      entry: num(form.entry),
      stop: num(form.stop),
      target: num(form.target),
      exit: form.status === 'closed' ? num(form.exit) : 0,
      current: form.status === 'open' ? num(form.current) : 0,
      pnl: Math.round(calc.pnl * 100) / 100,
      rMultiple: Math.round(calc.r * 100) / 100,
      fees: Math.round(calc.fees * 100) / 100,
      setup: form.setup,
      session: calc.session,
      status: form.status,
      discipline: form.discipline,
      mistakes: form.mistakes,
      note: form.note.trim(),
      grade: gradeOf(calc.r),
      charts,
    }
    onSubmit(next)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={trade ? '编辑交易' : '记录交易'}
      subtitle={trade ? '修改后自动重新计算盈亏与 R 倍数' : '先记录事实，再记录感受'}
      width={680}
      footer={
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="text-faint">净盈亏</span>
            <span
              className={`num font-medium ${
                calc.pnl > 0 ? 'text-gain' : calc.pnl < 0 ? 'text-loss' : 'text-muted'
              }`}
            >
              {fmtSignedMoney(calc.pnl, true)}
            </span>
            <span className="text-faint">R</span>
            <span
              className={`num font-medium ${
                calc.r > 0 ? 'text-gain' : calc.r < 0 ? 'text-loss' : 'text-muted'
              }`}
            >
              {fmtR(calc.r)}
            </span>
            <span className="text-faint">风险</span>
            <span
              className={`num ${
                calc.riskPct > account.risk.riskPerTradePct ? 'text-loss' : 'text-ink-2'
              }`}
            >
              ${fmtMoney(calc.risk, false)} · {calc.riskPct.toFixed(2)}%
            </span>
            {calc.suggested > 0 ? (
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => set('qty', String(calc.suggested))}
              >
                建议 {calc.suggested} 手
              </button>
            ) : calc.risk > 0 ? (
              <span className="text-warn">预算不足 1 手</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={close}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={chartBusy}>
              <Check size={14} />
              {chartBusy ? '正在处理图片…' : '保存交易'}
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
            {error}
          </div>
        ) : null}

        {!trade && riskWarnings.length ? (
          <div className="flex items-start gap-2 rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11px] leading-relaxed text-loss">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{riskWarnings.join('；')}。建议停止开新仓，先复盘。</span>
          </div>
        ) : null}

        {calc.riskPct > account.risk.riskPerTradePct ? (
          <p className="text-[10px] text-loss">
            本笔计划风险占权益 {calc.riskPct.toFixed(2)}%，超过账户单笔上限{' '}
            {account.risk.riskPerTradePct}%。
          </p>
        ) : null}

        <div className="grid grid-cols-4 gap-3">
          <label className="col-span-1">
            <span className="field-label">日期</span>
            <input
              type="date"
              name="date"
              className="input"
              value={form.date}
              onChange={(event) => set('date', event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">合约</span>
            <select
              name="symbol"
              className="input"
              value={form.symbol}
              onChange={(event) => set('symbol', event.target.value)}
            >
              {config.contracts.map((contract) => (
                <option key={contract.symbol} value={contract.symbol}>
                  {contract.symbol} · {contract.name}
                </option>
              ))}
              {!config.contracts.some((contract) => contract.symbol === form.symbol) ? (
                <option value={form.symbol}>{form.symbol}（未在字典中）</option>
              ) : null}
            </select>
          </label>
          <label>
            <span className="field-label">方向</span>
            <select
              name="side"
              className="input"
              value={form.side}
              onChange={(event) => set('side', event.target.value as Side)}
            >
              <option value="L">做多</option>
              <option value="S">做空</option>
            </select>
          </label>
          <label>
            <span className="field-label">状态</span>
            <select
              name="status"
              className="input"
              value={form.status}
              onChange={(event) => set('status', event.target.value as TradeStatus)}
            >
              <option value="closed">已平仓</option>
              <option value="open">持仓中</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <label>
            <span className="field-label">入场时间</span>
            <input
              type="time"
              name="entryTime"
              className="input"
              value={form.entryTime}
              onChange={(event) => set('entryTime', event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">{form.status === 'open' ? '平仓时间（可空）' : '出场时间'}</span>
            <input
              type="time"
              name="exitTime"
              className="input"
              disabled={form.status === 'open'}
              value={form.status === 'open' ? '' : form.exitTime}
              onChange={(event) => set('exitTime', event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">时段</span>
            <select
              name="session"
              className="input"
              value={form.session}
              onChange={(event) => set('session', event.target.value)}
            >
              {config.sessions.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">形态</span>
            <select
              name="setup"
              className="input"
              value={form.setup}
              onChange={(event) => set('setup', event.target.value)}
            >
              {config.setups.map((setup) => (
                <option key={setup} value={setup}>
                  {setup}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <label>
            <span className="field-label">手数</span>
            <input
              type="number"
              name="qty"
              min={1}
              step={1}
              className="input num"
              value={form.qty}
              onChange={(event) => set('qty', event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">入场价</span>
            <input
              type="number"
              name="entry"
              step="any"
              className="input num"
              placeholder="0.00"
              value={form.entry}
              onChange={(event) => set('entry', event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">止损价</span>
            <input
              type="number"
              name="stop"
              step="any"
              className="input num"
              placeholder="0.00"
              value={form.stop}
              onChange={(event) => set('stop', event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">目标价</span>
            <input
              type="number"
              name="target"
              step="any"
              className="input num"
              placeholder="可选"
              value={form.target}
              onChange={(event) => set('target', event.target.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <label>
            <span className="field-label">{form.status === 'open' ? '当前价' : '出场价'}</span>
            <input
              type="number"
              name={form.status === 'open' ? 'current' : 'exit'}
              step="any"
              className="input num"
              placeholder={form.status === 'open' ? '最新价' : '0.00'}
              value={form.status === 'open' ? form.current : form.exit}
              onChange={(event) =>
                set(form.status === 'open' ? 'current' : 'exit', event.target.value)
              }
            />
          </label>
          <div>
            <span className="field-label">评级（按 R 自动）</span>
            <div className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-list px-2.5 text-[12px] text-ink-2">
              <span className="font-medium text-ink">{gradeOf(calc.r)} 级</span>
              <span className="text-[10px] text-faint">
                {gradeOf(calc.r) === 'A'
                  ? '≥ 1.5R'
                  : gradeOf(calc.r) === 'B'
                    ? '−0.4 ~ 1.5R'
                    : '< −0.4R'}
              </span>
            </div>
          </div>
          <div className="col-span-2 rounded-md border border-line bg-list px-3 py-2">
            <div className="flex items-center justify-between text-[10.5px] text-faint">
              <span>合约点值</span>
              <span className="num text-ink-2">${calc.pointValue} / 点</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10.5px] text-faint">
              <span>毛盈亏 / 手续费</span>
              <span className="num text-ink-2">
                {fmtSignedMoney(calc.gross, true)} / ${fmtMoney(calc.fees)}
              </span>
            </div>
          </div>
        </div>

        <div>
          <span className="field-label">过程纪律</span>
          <div className="grid grid-cols-2 gap-2">
            {DISCIPLINE_ITEMS.map((item) => {
              const active = form.discipline[item.key]
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() =>
                    set('discipline', {
                      ...form.discipline,
                      [item.key]: !active,
                    })
                  }
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[11.5px] transition-colors ${
                    active
                      ? 'border-accent/35 bg-accent-soft text-ink'
                      : 'border-line bg-white text-muted hover:bg-hover'
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border ${
                      active ? 'border-accent bg-accent text-white' : 'border-line-2 bg-white'
                    }`}
                  >
                    {active ? <Check size={9} strokeWidth={3} /> : null}
                  </span>
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="field-label">错误标签</span>
            <span className="text-[10px] text-faint">可选 · 用来区分“结果不好”和“过程做错”</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {MISTAKE_TAGS.map((tag) => {
              const active = form.mistakes.includes(tag)
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() =>
                    set(
                      'mistakes',
                      active
                        ? form.mistakes.filter((item) => item !== tag)
                        : [...form.mistakes, tag],
                    )
                  }
                  className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] transition-colors ${
                    active
                      ? 'border-loss/30 bg-loss-soft text-loss'
                      : 'border-line bg-white text-muted hover:bg-hover'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
          {form.mistakes.length ? (
            <p className="mt-1.5 text-[10px] text-faint">
              已标记 {form.mistakes.length} 项；保存后可在镜像分析查看错误成本。
            </p>
          ) : null}
        </div>

        <ChartUploader
          items={charts}
          busy={chartBusy}
          onFiles={(files) => void addFiles(files)}
          onRemove={removeChart}
          onOpen={setLightbox}
        />

        <label className="block">
          <span className="field-label">复盘备注</span>
          <textarea
            name="note"
            className="textarea min-h-[92px]"
            placeholder="进场理由、执行偏差、下次要改的一件事…"
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
          />
        </label>

        <ChartLightbox
          charts={charts}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      </div>
    </Modal>
  )
}
