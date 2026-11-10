import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderSearch, RefreshCw } from 'lucide-react'
import { useApp } from '../store'
import { hasTauri } from '../lib/storage'
import {
  buildMt5Import,
  currencyScale,
  fetchMt5Env,
  runMt5Sync,
  type Mt5EnvResult,
} from '../lib/mt5'
import { todayISO } from '../lib/format'

type Tone = 'ok' | 'error' | 'info'

interface Notice {
  tone: Tone
  text: string
}

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 设置页的 MT5 同步面板：检测运行环境、按日期区间读取本机终端并增量入库。 */
export function Mt5Sync() {
  const { account, config, addContract, updateAccount, syncMt5 } = useApp()
  const [env, setEnv] = useState<Mt5EnvResult | null>(null)
  const [envError, setEnvError] = useState('')
  const [checking, setChecking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [from, setFrom] = useState(isoDaysAgo(30))
  const [to, setTo] = useState(todayISO())
  const [terminal, setTerminal] = useState(account.mt5?.terminalPath ?? '')
  const [offset, setOffset] = useState(
    String(account.mt5?.timeOffsetMinutes ?? -new Date().getTimezoneOffset()),
  )
  const [login, setLogin] = useState(account.mt5?.login ?? '')
  const [server, setServer] = useState(account.mt5?.server ?? '')
  const [password, setPassword] = useState('')
  const [autoLogin, setAutoLogin] = useState(false)

  const loadEnv = useCallback(async () => {
    if (!hasTauri()) {
      setEnvError('自动同步只在桌面版可用；浏览器预览无法调用本机 MT5。')
      return
    }
    setChecking(true)
    try {
      const result = await fetchMt5Env()
      setEnv(result)
      setEnvError('')
      if (!terminal && result.terminal) setTerminal(result.terminal)
    } catch (err) {
      setEnvError(errText(err))
    } finally {
      setChecking(false)
    }
  }, [terminal])

  useEffect(() => {
    void loadEnv()
    // 只在面板首次出现时检测，后续由用户点「重新检测」触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setTerminal(account.mt5?.terminalPath ?? '')
    setOffset(String(account.mt5?.timeOffsetMinutes ?? -new Date().getTimezoneOffset()))
    setLogin(account.mt5?.login ?? '')
    setServer(account.mt5?.server ?? '')
  }, [account.id, account.mt5?.terminalPath, account.mt5?.timeOffsetMinutes, account.mt5?.login, account.mt5?.server])

  const saveTerminal = (path: string) => {
    updateAccount({
      mt5: {
        login: account.mt5?.login ?? '',
        server: account.mt5?.server ?? '',
        terminalPath: path,
        timeOffsetMinutes: Number(offset) || 0,
        symbolMap: account.mt5?.symbolMap ?? {},
        lastSyncAt: account.mt5?.lastSyncAt ?? '',
      },
    })
  }

  const chooseTerminal = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        title: '选择 terminal64.exe',
        multiple: false,
        directory: false,
        filters: [{ name: 'MetaTrader 5', extensions: ['exe'] }],
      })
      if (typeof selected === 'string') setTerminal(selected)
    } catch (err) {
      setNotice({ tone: 'error', text: `选择终端失败：${errText(err)}` })
    }
  }

  const sync = async () => {
    if (!hasTauri()) {
      setNotice({ tone: 'error', text: '自动同步只在桌面版可用。' })
      return
    }
    if (!from || !to || from > to) {
      setNotice({ tone: 'error', text: '请选择有效的日期区间。' })
      return
    }
    setSyncing(true)
    setNotice(null)
    try {
      const payload = await runMt5Sync({
        from,
        to,
        terminal,
        login: autoLogin ? login : '',
        server: autoLogin ? server : '',
        password: autoLogin ? password : '',
      })
      const currency = payload.account?.currency ?? ''
      const scale = currencyScale(currency)
      const bundle = buildMt5Import(payload, {
        accountId: account.id,
        contracts: config.contracts,
        symbolMap: account.mt5?.symbolMap,
        timeOffsetMinutes: Number(offset) || 0,
        disciplineItems: config.disciplineItems,
        from,
        to,
        moneyScale: scale,
      })
      const created: string[] = []
      for (const item of bundle.unknown) {
        if (
          addContract({
            symbol: item.symbol,
            name: item.symbol,
            pointValue: item.inferredPointValue,
          })
        ) {
          created.push(item.symbol)
        }
      }
      const result = syncMt5(bundle.trades, bundle.flows, account.id)
      updateAccount({
        mt5: {
          login: bundle.login || login,
          server: bundle.server || server,
          terminalPath: terminal,
          timeOffsetMinutes: Number(offset) || 0,
          symbolMap: account.mt5?.symbolMap ?? {},
          lastSyncAt: new Date().toISOString(),
        },
      })
      setPassword('')
      const parts = [`新增 ${result.added} 笔`, `更新 ${result.updated} 笔`]
      if (result.flowsAdded) parts.push(`资金流水 ${result.flowsAdded} 笔`)
      if (created.length) parts.push(`新建合约 ${created.join('、')}`)
      if (bundle.skipped) parts.push(`跳过 ${bundle.skipped} 笔`)
      const currencyNote =
        scale !== 1
          ? ` · 已按 ${currency} 折算为 USD（÷${Math.round(1 / scale)}）`
          : currency && currency !== 'USD'
            ? ` · 账户币种 ${currency}（未做汇率换算）`
            : ''
      setNotice({
        tone: result.added || result.updated || result.flowsAdded ? 'ok' : 'info',
        text: `${parts.join('，')}${currencyNote}`,
      })
    } catch (err) {
      setNotice({ tone: 'error', text: errText(err) })
    } finally {
      setSyncing(false)
    }
  }

  const ready = Boolean(env?.package) && Boolean(env?.python)

  return (
    <section className="mt-3 rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-list text-muted ring-1 ring-line">
          <RefreshCw size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[12.5px] font-semibold text-ink">MT5 自动同步</h2>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
            直接读取本机 MetaTrader 5 终端的成交与持仓，按 position 聚合成交易后写入当前账户「
            {account.name}」。再次同步会更新已有记录，保留你填的复盘、评级与标注。
          </p>
        </div>
        <button
          className="btn btn-secondary h-7 px-2.5 text-[11px]"
          onClick={() => void loadEnv()}
          disabled={checking}
        >
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
          重新检测
        </button>
      </div>
      <div className="divider" />
      <div className="space-y-3 px-5 py-4">
        <div className="grid gap-2 rounded-lg bg-list px-3 py-2.5 text-[10.5px] leading-relaxed text-muted sm:grid-cols-3">
          <div>
            <div className="font-medium text-ink-2">Python</div>
            <div className="mt-0.5 break-all font-mono text-[9.5px]">
              {checking
                ? '检测中…'
                : env?.python
                  ? `${env.python} · ${env.python_version}`
                  : '未找到'}
            </div>
          </div>
          <div>
            <div className="font-medium text-ink-2">MetaTrader5 包</div>
            <div className="mt-0.5 break-all font-mono text-[9.5px]">
              {checking ? '检测中…' : env?.package ? `已安装 ${env.package_version}` : '未安装'}
            </div>
          </div>
          <div>
            <div className="font-medium text-ink-2">MT5 终端</div>
            <div className="mt-0.5 break-all font-mono text-[9.5px]">
              {checking ? '检测中…' : (env?.terminal ?? '未检测到，可手动填写')}
            </div>
          </div>
        </div>
        {envError ? (
          <div className="flex items-start gap-2 rounded-lg bg-loss-soft/40 px-3 py-2 text-[10.5px] leading-relaxed text-loss">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{envError}</span>
          </div>
        ) : null}
        {!envError && env && !ready ? (
          <div className="rounded-lg bg-list px-3 py-2 text-[10.5px] leading-relaxed text-muted">
            还差一步：安装 Python 3（python.org）后执行
            <code className="mx-1 rounded bg-white px-1 py-0.5 font-mono text-[9.5px] text-ink-2">
              py -3 -m pip install numpy MetaTrader5
            </code>
            并保持 MT5 已登录。
            {env.detail ? (
              <div className="mt-1 break-all font-mono text-[9.5px] text-faint">{env.detail}</div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="field-label">起始日期</span>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">结束日期</span>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">时间基准（相对 UTC 分钟）</span>
            <input
              type="number"
              className="input num"
              step={30}
              value={offset}
              onChange={(event) => setOffset(event.target.value)}
            />
          </label>
        </div>

        {env && env.terminals.length > 1 ? (
          <label className="block">
            <span className="field-label">检测到的 MT5 终端</span>
            <select
              className="input"
              value={env.terminals.includes(terminal) ? terminal : ''}
              onChange={(event) => {
                setTerminal(event.target.value)
                saveTerminal(event.target.value)
              }}
            >
              <option value="">自动探测（{env.terminals[0]}）</option>
              {env.terminals.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="field-label">终端路径</span>
            <input
              type="text"
              className="input"
              placeholder="留空则自动探测 terminal64.exe"
              value={terminal}
              onChange={(event) => setTerminal(event.target.value)}
              onBlur={() => saveTerminal(terminal)}
            />
          </label>
          <button className="btn btn-secondary" onClick={() => void chooseTerminal()}>
            <FolderSearch size={13} />
            浏览
          </button>
        </div>

        <button
          className="text-[10.5px] text-accent hover:underline"
          onClick={() => setAutoLogin((value) => !value)}
        >
          {autoLogin ? '取消指定账号登录' : '需要指定 MT5 账号登录？'}
        </button>
        {autoLogin ? (
          <div className="grid gap-3 rounded-lg bg-list px-3 py-3 sm:grid-cols-3">
            <label>
              <span className="field-label">MT5 账号</span>
              <input
                type="text"
                className="input num"
                placeholder="例如 12345678"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">服务器</span>
              <input
                type="text"
                className="input"
                placeholder="例如 ICMarkets-Live"
                value={server}
                onChange={(event) => setServer(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">密码（仅本次使用）</span>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? '正在读取 MT5…' : '立即同步'}
          </button>
          <span className="text-[10.5px] text-faint">
            {account.mt5?.lastSyncAt
              ? `上次同步：${new Date(account.mt5.lastSyncAt).toLocaleString('zh-CN')}`
              : '尚未同步过'}
          </span>
        </div>

        {notice ? (
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[10.5px] leading-relaxed ${
              notice.tone === 'error'
                ? 'bg-loss-soft/40 text-loss'
                : notice.tone === 'ok'
                  ? 'bg-gain-soft/40 text-gain'
                  : 'bg-list text-muted'
            }`}
          >
            {notice.tone === 'error' ? (
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            ) : notice.tone === 'ok' ? (
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
            ) : null}
            <span className="whitespace-pre-wrap">{notice.text}</span>
          </div>
        ) : null}

        <p className="text-[10px] leading-relaxed text-faint">
          新出现的品种会按成交反推点值自动建合约，建议同步后在「合约」里核对一次；不同券商的服务器时区通常是
          UTC+2 / UTC+3，按你的报表习惯调整即可。
        </p>
      </div>
    </section>
  )
}
