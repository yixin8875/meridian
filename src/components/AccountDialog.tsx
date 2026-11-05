import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { Account } from '../types'
import { Modal } from './primitives'

export interface AccountValues {
  name: string
  startingEquity: number
  feePerContract: number
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
  const [equity, setEquity] = useState('100000')
  const [fee, setFee] = useState('2.5')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(account?.name ?? '')
    setEquity(String(account?.startingEquity ?? 100000))
    setFee(String(account?.feePerContract ?? 2.5))
    setError(null)
  }, [open, account])

  const submit = () => {
    const parsedEquity = Number(equity)
    const parsedFee = Number(fee)
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
    onSubmit({
      name: name.trim(),
      startingEquity: Math.round(parsedEquity * 100) / 100,
      feePerContract: Math.round(parsedFee * 100) / 100,
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
          <span className="text-[10.5px] text-faint">
            {account ? '修改起始权益会重算历史收益率与回撤' : '创建后自动切换到新账户'}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit}>
              <Check size={14} />
              {account ? '保存' : '创建账户'}
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-3.5">
        {error ? (
          <div className="rounded-lg border border-loss/25 bg-loss-soft px-3 py-2 text-[11.5px] text-loss">
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

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">起始权益（USD）</span>
            <input
              name="startingEquity"
              type="number"
              min={0}
              step={100}
              className="input num"
              value={equity}
              onChange={(event) => setEquity(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">每手手续费（USD）</span>
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

        <p className="rounded-lg bg-list px-3 py-2 text-[10.5px] leading-relaxed text-faint">
          账户之间完全隔离：交易台账、复盘笔记、权益曲线与镜像分析只显示当前账户。
        </p>
      </div>
    </Modal>
  )
}
