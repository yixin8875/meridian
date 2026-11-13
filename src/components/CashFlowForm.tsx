import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { AccountCurrency, CashFlow, CashFlowKind } from '../types'
import { CASH_FLOW_KINDS } from '../data/contracts'
import { currencyUnit, fmtSignedMoney, todayISO, uid } from '../lib/format'
import { Modal } from './primitives'

export function CashFlowDialog({
  open,
  flow,
  accountId,
  currency = 'USD',
  onClose,
  onSubmit,
}: {
  open: boolean
  flow: CashFlow | null
  accountId: string
  currency?: AccountCurrency
  onClose: () => void
  onSubmit: (flow: CashFlow) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [kind, setKind] = useState<CashFlowKind>('deposit')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDate(flow?.date ?? todayISO())
    setKind(flow?.kind ?? 'deposit')
    setAmount(flow ? String(flow.amount) : '')
    setNote(flow?.note ?? '')
    setError(null)
  }, [open, flow])

  const parsed = Number(amount)
  const sign = CASH_FLOW_KINDS.find((item) => item.key === kind)?.sign ?? 1

  const submit = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('请选择资金变动日期。')
      return
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('金额需要大于 0。')
      return
    }
    onSubmit({
      id: flow?.id ?? uid('cf'),
      accountId: flow?.accountId ?? accountId,
      date,
      kind,
      amount: Math.round(parsed * 100) / 100,
      note: note.trim(),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={flow ? '编辑资金变动' : '记录资金变动'}
      subtitle="出入金会改变账户权益，但不会计入交易盈亏"
      width={460}
      footer={
        <>
          <span className="num text-xs text-faint">
            {Number.isFinite(parsed) && parsed > 0
              ? fmtSignedMoney(parsed * sign, true, currency)
              : '—'}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit}>
              <Check size={16} strokeWidth={1.5} />
              保存
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

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">日期</span>
            <input
              type="date"
              name="date"
              className="input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">类型</span>
            <select
              name="kind"
              className="input"
              value={kind}
              onChange={(event) => setKind(event.target.value as CashFlowKind)}
            >
              {CASH_FLOW_KINDS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="field-label">金额（{currencyUnit(currency)}）</span>
          <input
            name="amount"
            type="number"
            min={0}
            step={100}
            className="input num"
            placeholder="10000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
        </label>

        <label className="block">
          <span className="field-label">备注</span>
          <input
            name="note"
            className="input"
            placeholder="例如：追加保证金、提取利润"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <p className="rounded-lg bg-list px-3 py-2 text-xs leading-relaxed text-faint">
          入金与分红增加权益，出金减少权益。收益率和回撤会剔除这些资金变动，只衡量交易表现。
        </p>
      </div>
    </Modal>
  )
}
