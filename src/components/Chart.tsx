import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { EquityPointView } from '../lib/stats'
import {
  fmtCompactMoney,
  fmtDateShort,
  fmtMoney,
  fmtSignedMoney,
  monthEN,
  parseISO,
} from '../lib/format'
import { EmptyState } from './primitives'

const W = 1000
const H = 300
const PAD = { top: 20, right: 66, bottom: 28, left: 6 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(count, 1)
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
  const norm = raw / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * mag
}

function buildTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min]
  const step = niceStep(max - min, count)
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v)
  return ticks
}

export function EquityChart({ points }: { points: EquityPointView[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1000)
  const narrow = width < 720

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const model = useMemo(() => {
    if (points.length < 2) return null
    const times = points.map((p) => parseISO(p.date).getTime())
    const t0 = times[0]!
    const t1 = times[times.length - 1]!
    const values = points.flatMap((p) => [p.equity, p.mean])
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const span = Math.max(rawMax - rawMin, 1)
    const min = rawMin - span * 0.14
    const max = rawMax + span * 0.16
    const xOf = (t: number) => PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * PLOT_W
    const yOf = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * PLOT_H
    const coords = points.map((p, i) => ({
      x: xOf(times[i]!),
      y: yOf(p.equity),
      my: yOf(p.mean),
      point: p,
      i,
    }))
    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(' ')
    const meanLine = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.my.toFixed(2)}`)
      .join(' ')
    const area = `${line} L ${coords[coords.length - 1]!.x.toFixed(2)} ${PAD.top + PLOT_H} L ${coords[0]!.x.toFixed(2)} ${PAD.top + PLOT_H} Z`

    const yTicks = buildTicks(min, max, 4)
    const spanDays = (t1 - t0) / 86_400_000
    const maxXTicks = narrow ? 4 : 8
    const xTicks: { x: number; label: string }[] = []

    if (spanDays > 80) {
      let lastMonth = -1
      points.forEach((p, i) => {
        const month = parseISO(p.date).getMonth()
        if (month !== lastMonth) {
          lastMonth = month
          xTicks.push({ x: coords[i]!.x, label: monthEN(p.date) })
        }
      })
      if (xTicks.length > maxXTicks) {
        const stride = Math.ceil(xTicks.length / maxXTicks)
        const kept = xTicks.filter((_, i) => i % stride === 0 || i === xTicks.length - 1)
        xTicks.splice(0, xTicks.length, ...kept)
      }
    } else {
      const n = Math.min(narrow ? 4 : 6, points.length)
      for (let k = 0; k < n; k += 1) {
        const idx = Math.round((k / Math.max(n - 1, 1)) * (points.length - 1))
        xTicks.push({ x: coords[idx]!.x, label: fmtDateShort(points[idx]!.date) })
      }
    }

    return { coords, line, meanLine, area, yTicks, xTicks, min, max }
  }, [points, narrow])

  function onMove(event: MouseEvent<HTMLDivElement>) {
    if (!model) return
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestDistance = Infinity
    model.coords.forEach((c, i) => {
      const distance = Math.abs(c.x - px)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    })
    setHover(best)
  }

  if (!model) {
    return (
      <EmptyState
        title="还没有权益曲线"
        description="记录第一笔已平仓交易后，这里会开始生长。"
      />
    )
  }

  const active = hover !== null ? model.coords[hover] : null
  const last = model.coords[model.coords.length - 1]!
  const tooltipLeft = active ? Math.min(86, Math.max(14, (active.x / W) * 100)) : 50
  const axisSize = Math.max(9, 10_000 / Math.max(width, 1))
  const valueSize = Math.max(10.5, 11_000 / Math.max(width, 1))

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        className="block h-auto w-full overflow-visible"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="权益曲线"
      >
        <defs>
          <linearGradient id="meridianArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b6cf0" stopOpacity="0.14" />
            <stop offset="75%" stopColor="#0b6cf0" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {model.yTicks.map((value) => {
          const y = PAD.top + (1 - (value - model.min) / (model.max - model.min)) * PLOT_H
          return (
            <g key={`y${value}`}>
              <line
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={y}
                y2={y}
                stroke="#efede9"
                strokeWidth="1"
              />
              <text
                x={W - 6}
                y={y + axisSize * 0.35}
                textAnchor="end"
                fill="#98989e"
                fontSize={axisSize}
              >
                {fmtCompactMoney(value)}
              </text>
            </g>
          )
        })}

        {model.xTicks.map((tick, index) => (
          <text
            key={`x${index}`}
            x={tick.x}
            y={H - 8}
            textAnchor="middle"
            fill="#98989e"
            fontSize={axisSize}
          >
            {tick.label}
          </text>
        ))}

        <path d={model.area} fill="url(#meridianArea)" />
        <path
          d={model.meanLine}
          fill="none"
          stroke="#c3c9d1"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        <path
          d={model.line}
          fill="none"
          stroke="#0b6cf0"
          strokeWidth="1.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <circle cx={last.x} cy={last.y} r="6" fill="#0b6cf0" opacity="0.12" />
        <circle cx={last.x} cy={last.y} r="3" fill="#0b6cf0" stroke="#fff" strokeWidth="1.6" />
        <text
          x={last.x - 8}
          y={Math.max(last.y - 11, 14)}
          textAnchor="end"
          fill="#0b6cf0"
          fontSize={valueSize}
          fontWeight="600"
          stroke="#ffffff"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {fmtCompactMoney(last.point.equity)}
        </text>

        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#b9c0c9"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={active.y}
              y2={active.y}
              stroke="#d8d6d0"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <circle cx={active.x} cy={active.y} r="4" fill="#fff" stroke="#0b6cf0" strokeWidth="2" />
          </g>
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[168px] -translate-x-1/2 rounded-lg border border-line bg-white/95 p-3 shadow-lg backdrop-blur"
          style={{ left: `${tooltipLeft}%` }}
        >
          <div className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
            {monthEN(active.point.date)} {fmtDateShort(active.point.date)} · 第 {active.i + 1} 个交易日
          </div>
          <div className="num mt-1 text-[17px] font-semibold text-ink">
            ${fmtMoney(active.point.equity, false)}
          </div>
          <div className="mt-2 space-y-1 border-t border-line pt-2 text-[10.5px]">
            <div className="flex justify-between gap-6">
              <span className="text-muted">当日</span>
              <span className={active.point.pnl >= 0 ? 'text-gain' : 'text-loss'}>
                {fmtSignedMoney(active.point.pnl, false)}
              </span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted">成交</span>
              <span className="text-ink">{active.point.trades} 笔</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
