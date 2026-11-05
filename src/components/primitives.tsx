import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { Side } from '../types'
import { fmtR, fmtSignedMoney } from '../lib/format'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const BADGE_COLORS: Record<string, [string, string]> = {
  ES: ['#e8f0fe', '#175cc4'],
  MES: ['#e8f0fe', '#175cc4'],
  NQ: ['#efe9fd', '#6446bc'],
  MNQ: ['#e9f7f2', '#157257'],
  RTY: ['#fdeee6', '#a1542b'],
  M2K: ['#fdeee6', '#a1542b'],
  CL: ['#fbf1df', '#8f6118'],
  MCL: ['#fbf1df', '#8f6118'],
  GC: ['#f6f0d6', '#81630f'],
  MGC: ['#f6f0d6', '#81630f'],
}

export function IconBadge({
  symbol,
  size = 'md',
}: {
  symbol: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const [bg, fg] = BADGE_COLORS[symbol] ?? ['#efece7', '#6e6e73']
  const dims =
    size === 'lg'
      ? 'h-11 w-11 rounded-lg text-[12px]'
      : size === 'sm'
        ? 'h-7 w-7 rounded-md text-[9px]'
        : 'h-8 w-8 rounded-md text-[10px]'
  return (
    <span
      className={`flex shrink-0 items-center justify-center font-semibold tracking-[0.04em] ${dims}`}
      style={{ backgroundColor: bg, color: fg }}
    >
      {symbol.slice(0, 2)}
    </span>
  )
}

export function SideBadge({ side }: { side: Side }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded px-1.5 text-[10.5px] font-medium ${
        side === 'L' ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'
      }`}
    >
      {side === 'L' ? '做多' : '做空'}
    </span>
  )
}

export function Pnl({
  value,
  cents = false,
  className,
}: {
  value: number
  cents?: boolean
  className?: string
}) {
  return (
    <span
      className={`num ${
        value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : 'text-muted'
      } ${className ?? ''}`}
    >
      {fmtSignedMoney(value, cents)}
    </span>
  )
}

export function RValue({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={`num ${
        value > 0 ? 'text-gain' : value < 0 ? 'text-loss' : 'text-muted'
      } ${className ?? ''}`}
    >
      {fmtR(value)}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-list text-faint">
          {icon}
        </div>
      ) : null}
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-[320px] text-[11.5px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Metric({
  label,
  children,
  hint,
  className,
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-faint">{label}</div>
      <div className="num mt-1 truncate text-[15px] font-medium text-ink">{children}</div>
      {hint ? <div className="mt-0.5 text-[10.5px] text-faint">{hint}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 620,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1c1c1f]/25 px-5 py-10 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="fade-in flex max-h-[calc(100vh-80px)] w-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_24px_80px_-24px_rgba(20,20,25,0.35)]"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p> : null}
          </div>
          <button className="icon-btn -mr-1" onClick={onClose} aria-label="关闭">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-list px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
