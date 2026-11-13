import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { Account, AccountCurrency, RiskConfig } from '../types'
import { DEFAULT_RISK } from '../data/contracts'
import { currencyUnit } from '../lib/format'
import { Modal } from './primitives'

export interface AccountValues {
  name: string
  currency: AccountCurrency
  startingEquity: number
  feePerContract: number
  risk: RiskConfig
}

export function AccountDialog({
  open,
  account,
  onClose,
  onSubmit,
}: {
  open: boolean
  /** 传入账户表示编辑，不传表示新建。 */
  account: Account | null
  onClose: () => void
  onSubmit: (values: AccountValues) => void
}) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<AccountCurrency>('USD')
  const [equity, setEquity] = useState('100000')
  const [fee, setFee] = useState('2.5')
  const [riskPct, setRiskPct] = useState(String(DEFAULT_RISK.riskPerTradePct))
  const [dailyLimit, setDailyLimit] = useState(String(DEFAULT_RISK.dailyLossLimit))
  const [streakLimit, setStreakLimit] = useState(String(DEFAULT_RISK.maxConsecutiveLosses))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const risk = account?.risk ?? DEFAULT_RISK
    setName(account?.name ?? '')
    setCurrency(account?.currency ?? 'USD')
    setEquity(String(account?.startingEquity ?? 100000))
    setFee(String(account?.feePerContract ?? 2.5))
    setRiskPct(String(risk.riskPerTradePct))
    setDailyLimit(String(risk.dailyLossLimit))
    setStreakLimit(String(risk.maxConsecutiveLosses))
    setError(null)
  }, [open, account])

  const changeCurrency = (next: AccountCurrency) => {
    if (next === currency) return
    const factor = next === 'USC' ? 100 : 0.01
    const convert = (value: string) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? String(Math.round(parsed * factor * 1e6) / 1e6) : value
    }
    setCurrency(next)
    setEquity((value) => convert(value))
    setFee((value) => convert(value))
    setDailyLimit((value) => convert(value))
  }

  const submit = () => {
    const parsedEquity = Number(equity)
    const parsedFee = Number(fee)
    const parsedRisk = Number(riskPct)
    const parsedLimit = Number(dailyLimit)
    const parsedStreak = Number(streakLimit)
    if (!name.trim()) {
      setError('请填写账户名称。')
      return
    }
    if (!Number.isFinite(parsedEquity) || parsedEquity <= 0) {
      setError('起始权益需要大于 0。')
      return
    }
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      setError('每手手续费不能为负数。')
      return
    }
    if (!Number.isFinite(parsedRisk) || parsedRisk <= 0 || parsedRisk > 100) {
      setError('单笔风险需要大于 0 且不超过 100%。')
      return
    }
    if (!Number.isFinite(parsedLimit) || parsedLimit < 0) {
      setError('每日亏损上限不能为负数；填 0 表示不限制。')
      return
    }
    if (!Number.isFinite(parsedStreak) || parsedStreak < 0) {
      setError('连续亏损上限不能为负数；填 0 表示不限制。')
      return
    }
    onSubmit({
      name: name.trim(),
      currency,
      startingEquity: Math.round(parsedEquity * 100) / 100,
      feePerContract: Math.round(parsedFee * 100) / 100,
      risk: {
        riskPerTradePct: Math.round(parsedRisk * 100) / 100,
        dailyLossLimit: Math.round(parsedLimit * 100) / 100,
        maxConsecutiveLosses: Math.round(parsedStreak),
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? '编辑账户' : '新建账户'}
      subtitle={
        account
          ? '交易、笔记与统计都按账户独立保存'
          : '新账户有独立的起始权益、手续费与交易记录'
      }
      width={460}
      footer={
        <>
          <span className="text-xs text-faint">
            {account ? '修改起始权益会重算历史收益率与回撤' : '创建后自动切换到新账户'}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit}>
              <Check size={16} strokeWidth={1.5} />
              {account ? '保存' : '创建账户'}
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-xs text-loss">
            {error}
          </div>
        ) : null}

        <label className="block">
          <span className="field-label">账户名称</span>
          <input
            name="name"
            className="input"
            placeholder="例如：主账户、小账户、Abacus"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
        </label>

        <label className="block">
          <span className="field-label">账户币种</span>
          <select
            name="currency"
            className="input"
            value={currency}
            onChange={(event) => changeCurrency(event.target.value as AccountCurrency)}
          >
            <option value="USD">美元账户（USD）</option>
            <option value="USC">美分账户（USC）</option>
          </select>
          <span className="mt-1 block text-xs leading-relaxed text-faint">
            美分账户的权益、盈亏与流水都以美分保存和显示，例如 5,000.00 ¢ = $50.00。
            {account && account.currency !== currency
              ? ' 切换币种会把已有金额按 ×100 / ÷100 换算，真实价值不变。'
              : ''}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">起始权益（{currencyUnit(currency)}）</span>
            <input
              name="startingEquity"
              type="number"
              min={0}
              step={currency === 'USC' ? 1000 : 100}
              className="input num"
              value={equity}
              onChange={(event) => setEquity(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">每手手续费（{currencyUnit(currency)}）</span>
            <input
              name="feePerContract"
              type="number"
              min={0}
              step={0.25}
              className="input num"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </label>
        </div>

        <div className="divider my-1" />

        <div>
          <div className="field-label">风险参数</div>
          <div className="mt-1 grid grid-cols-3 gap-3">
            <label>
              <span className="text-xs text-faint">单笔风险 %</span>
              <input
                name="riskPerTradePct"
                type="number"
                min={0.1}
                max={100}
                step={0.1}
                className="input num mt-1"
                value={riskPct}
                onChange={(event) => setRiskPct(event.target.value)}
              />
            </label>
            <label>
              <span className="text-xs text-faint">
                日亏损上限（{currencyUnit(currency)}）
              </span>
              <input
                name="dailyLossLimit"
                type="number"
                min={0}
                step={100}
                className="input num mt-1"
                value={dailyLimit}
                onChange={(event) => setDailyLimit(event.target.value)}
              />
            </label>
            <label>
              <span className="text-xs text-faint">连续亏损上限</span>
              <input
                name="maxConsecutiveLosses"
                type="number"
                min={0}
                step={1}
                className="input num mt-1"
                value={streakLimit}
                onChange={(event) => setStreakLimit(event.target.value)}
              />
            </label>
          </div>
          <p className="mt-1.5 text-xs text-faint">
            日亏损上限与连续亏损上限填 0 表示不限制；单笔风险用于交易表单的建议手数。
          </p>
        </div>

        <p className="rounded-lg bg-list px-3 py-2 text-xs leading-relaxed text-faint">
          账户之间完全隔离：交易台账、复盘笔记、资金流水、权益曲线与镜像分析只显示当前账户。
        </p>
      </div>
    </Modal>
  )
}
