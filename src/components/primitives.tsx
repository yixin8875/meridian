import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { Side } from '../types'
import { fmtR, fmtSignedMoney } from '../lib/format'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function MeridianMark({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 15.5 8 9l3.5 3.5L16.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 2.5v6"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconBadge({
  symbol,
  size = 'md',
}: {
  symbol: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims =
    size === 'lg'
      ? 'h-11 w-11 rounded-lg text-xs'
      : size === 'sm'
        ? 'h-7 w-7 rounded-md text-xs'
        : 'h-8 w-8 rounded-md text-xs'
  return (
    <span
      className={`flex shrink-0 items-center justify-center border border-line bg-canvas font-mono font-medium text-ink-2 ${dims}`}
    >
      {symbol.slice(0, 2)}
    </span>
  )
}

export function SideBadge({ side }: { side: Side }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded px-2 text-xs font-medium ${
        side === 'L' ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'
      }`}
    >
      {side === 'L' ? '做多' : '做空'}
    </span>
  )
}

export function Pnl({
  value,
  cents = true,
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
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      {icon ? <div className="mb-4 text-faint">{icon}</div> : null}
      <p className="text-base font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-80 text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
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
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 truncate text-sm font-medium text-ink">{children}</div>
      {hint ? <div className="mt-1 text-xs text-faint">{hint}</div> : null}
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 px-5 py-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="fade-in flex max-h-[calc(100vh-80px)] w-full flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_8px_24px_rgba(32,28,23,0.08)]"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-medium text-ink">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button className="icon-btn -mr-1" onClick={onClose} aria-label="关闭">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-list px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
