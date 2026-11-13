import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  ImageOff,
  Loader2,
  Pencil,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import type {
  AnnotationPoint,
  AnnotationTool,
  ChartAnnotation,
  ChartRef,
} from '../types'
import { uid } from '../lib/format'
import { loadChartUrl } from '../lib/charts'

export type ChartItem = ChartRef & { preview?: string }

const ANNOTATION_COLORS = ['#dd5a4d', '#d99024', '#5b8fc7', '#3f9e78', '#fdfbf4'] as const
const ANNOTATION_WIDTHS = [2, 4, 6] as const
const TOOLS = [
  { key: 'pen' as const, label: '画笔', Icon: Pencil },
  { key: 'arrow' as const, label: '箭头', Icon: ArrowUpRight },
  { key: 'rect' as const, label: '矩形', Icon: Square },
  { key: 'text' as const, label: '文字', Icon: Type },
]

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function AnnotationShape({
  annotation,
  width,
  height,
}: {
  annotation: ChartAnnotation
  width: number
  height: number
}) {
  if (annotation.type === 'pen') {
    const points = annotation.points
      .map((point) => `${(point.x * width).toFixed(1)},${(point.y * height).toFixed(1)}`)
      .join(' ')
    return (
      <polyline
        points={points}
        fill="none"
        stroke={annotation.color}
        strokeWidth={annotation.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )
  }

  if (annotation.type === 'text') {
    const x = annotation.x * width
    const y = annotation.y * height
    const labelHeight = annotation.size + 8
    const textWidth = Array.from(annotation.text).reduce(
      (sum, char) => sum + (char.charCodeAt(0) > 255 ? annotation.size : annotation.size * 0.6),
      0,
    )
    const labelWidth = Math.min(width - x, textWidth + 12)
    if (labelWidth <= 0) return null
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={labelWidth}
          height={labelHeight}
          rx={3}
          fill="rgba(15, 23, 42, 0.78)"
        />
        <text
          x={x + 6}
          y={y + annotation.size + 2}
          fill={annotation.color}
          fontSize={annotation.size}
          fontWeight={600}
        >
          {annotation.text}
        </text>
      </g>
    )
  }

  const x1 = annotation.start.x * width
  const y1 = annotation.start.y * height
  const x2 = annotation.end.x * width
  const y2 = annotation.end.y * height
  if (annotation.type === 'rect') {
    return (
      <rect
        x={Math.min(x1, x2)}
        y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)}
        height={Math.abs(y2 - y1)}
        rx={2}
        fill="none"
        stroke={annotation.color}
        strokeWidth={annotation.width}
      />
    )
  }

  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = Math.max(10, annotation.width * 4)
  const left = {
    x: x2 - head * Math.cos(angle - Math.PI / 6),
    y: y2 - head * Math.sin(angle - Math.PI / 6),
  }
  const right = {
    x: x2 - head * Math.cos(angle + Math.PI / 6),
    y: y2 - head * Math.sin(angle + Math.PI / 6),
  }
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={annotation.color}
        strokeWidth={annotation.width}
        strokeLinecap="round"
      />
      <polygon
        points={`${x2},${y2} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={annotation.color}
      />
    </g>
  )
}

export function useChartUrl(
  chartId: string,
  preview?: string,
): { url: string | null; loading: boolean } {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>({
    url: preview ?? null,
    loading: !preview && Boolean(chartId),
  })

  useEffect(() => {
    if (!chartId) {
      setState({ url: null, loading: false })
      return
    }
    if (preview) {
      setState({ url: preview, loading: false })
      return
    }
    let alive = true
    setState({ url: null, loading: true })
    void loadChartUrl(chartId).then((next) => {
      if (alive) setState({ url: next, loading: false })
    })
    return () => {
      alive = false
    }
  }, [chartId, preview])

  return state
}

export function ChartTile({
  chart,
  onOpen,
  onRemove,
  preview,
  heightClass = 'h-[104px]',
}: {
  chart: ChartRef
  onOpen?: () => void
  onRemove?: () => void
  preview?: string
  heightClass?: string
}) {
  const { url, loading } = useChartUrl(chart.id, preview)

  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-canvas">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className={`block w-full ${onOpen ? 'cursor-zoom-in' : 'cursor-default'}`}
        title={chart.name}
      >
        {url ? (
          <img src={url} alt={chart.name} className={`${heightClass} w-full object-cover`} />
        ) : (
          <div
            className={`${heightClass} flex w-full items-center justify-center gap-1.5 bg-list text-xs text-faint`}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                加载中
              </>
            ) : (
              <>
                <ImageOff size={14} />
                图片不可用
              </>
            )}
          </div>
        )}
      </button>
      <div className="flex items-center gap-1 border-t border-line bg-paper px-2 py-1">
        {chart.annotations?.length ? (
          <Pencil
            size={12}
            className="shrink-0 text-accent"
            aria-label={`${chart.annotations.length} 个标注`}
          />
        ) : (
          <ImageIcon size={12} className="shrink-0 text-faint" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-faint">{chart.name}</span>
        {onRemove ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint transition-colors hover:bg-loss-soft hover:text-loss"
            onClick={onRemove}
            aria-label="移除这张图"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function ChartUploader({
  items,
  busy,
  onFiles,
  onRemove,
  onOpen,
}: {
  items: ChartItem[]
  busy: boolean
  onFiles: (files: File[]) => void
  onRemove: (id: string) => void
  onOpen: (index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (files: FileList | null) => {
    if (!files?.length) return
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (images.length) onFiles(images)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="field-label mb-0">K 线图</span>
        <span className="text-xs text-faint">
          {items.length ? `${items.length} 张 · 自动压缩到 1800px` : '可选，最多建议 6 张'}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          pick(event.target.files)
          event.target.value = ''
        }}
      />

      <div
        role="button"
        tabIndex={0}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 transition-colors ${
          dragging
            ? 'border-accent bg-accent-soft/60'
            : 'border-line-2 bg-list hover:border-accent/40 hover:bg-accent-soft/30'
        }`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          pick(event.dataTransfer.files)
        }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-accent ring-1 ring-line">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={1.5} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-ink">
            {busy ? '正在处理图片…' : '粘贴截图，或点击 / 拖入图片'}
          </div>
          <div className="mt-0.5 text-xs text-faint">
            支持 Ctrl+V 直接粘贴剪贴板里的 K 线图 · PNG / JPG
          </div>
        </div>
      </div>

      {items.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {items.map((item, index) => (
            <ChartTile
              key={item.id}
              chart={item}
              preview={item.preview}
              onOpen={() => onOpen(index)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ChartGallery({
  items,
  onChartChange,
}: {
  items: ChartItem[]
  onChartChange?: (chart: ChartRef) => void
}) {
  const [index, setIndex] = useState<number | null>(null)
  if (!items.length) return null
  const charts: ChartRef[] = items

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {items.map((chart, position) => (
          <ChartTile
            key={chart.id}
            chart={chart}
            preview={chart.preview}
            heightClass="h-44"
            onOpen={() => setIndex(position)}
          />
        ))}
      </div>
      <ChartLightbox
        charts={charts}
        index={index}
        onClose={() => setIndex(null)}
        onNavigate={setIndex}
        onChartChange={onChartChange}
      />
    </>
  )
}

export function ChartLightbox({
  charts,
  index,
  onClose,
  onNavigate,
  onChartChange,
}: {
  charts: ChartRef[]
  index: number | null
  onClose: () => void
  onNavigate: (next: number) => void
  onChartChange?: (chart: ChartRef) => void
}) {
  if (index === null || !charts[index]) return null
  return (
    <LightboxBody
      charts={charts}
      index={index}
      onClose={onClose}
      onNavigate={onNavigate}
      onChartChange={onChartChange}
    />
  )
}

function LightboxBody({
  charts,
  index,
  onClose,
  onNavigate,
  onChartChange,
}: {
  charts: ChartRef[]
  index: number
  onClose: () => void
  onNavigate: (next: number) => void
  onChartChange?: (chart: ChartRef) => void
}) {
  const chart = charts[index]!
  const { url, loading } = useChartUrl(chart.id)
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState<AnnotationTool>('pen')
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0])
  const [strokeWidth, setStrokeWidth] = useState<number>(4)
  const [draft, setDraft] = useState<ChartAnnotation[]>(chart.annotations ?? [])
  const [history, setHistory] = useState<ChartAnnotation[][]>([])
  const [drawing, setDrawing] = useState<ChartAnnotation | null>(null)
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const imgRef = useRef<HTMLImageElement>(null)

  const measure = () => {
    const node = imgRef.current
    if (!node) return
    setBox({ width: node.clientWidth, height: node.clientHeight })
  }

  useEffect(() => {
    setDraft(chart.annotations ?? [])
    setHistory([])
    setDrawing(null)
    setTextDraft(null)
    setEditing(false)
  }, [chart.id])

  useEffect(() => {
    if (!url) return
    measure()
    const node = imgRef.current
    if (!node) return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [url])

  const persist = (next: ChartAnnotation[]) => {
    setDraft(next)
    onChartChange?.({ ...chart, annotations: next })
  }

  const commit = (annotation: ChartAnnotation) => {
    setHistory((prev) => [...prev.slice(-49), draft])
    persist([...draft, annotation])
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (!previous) return
    setHistory((prev) => prev.slice(0, -1))
    persist(previous)
  }

  const clear = () => {
    if (!draft.length) return
    setHistory((prev) => [...prev.slice(-49), draft])
    persist([])
  }

  const pointOf = (event: ReactPointerEvent<SVGSVGElement>): AnnotationPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
    }
  }

  const commitText = () => {
    if (!textDraft) return
    const value = textDraft.value.trim()
    setTextDraft(null)
    if (!value) return
    commit({
      id: uid('ann'),
      type: 'text',
      color,
      text: value.slice(0, 80),
      x: Math.min(0.94, textDraft.x),
      y: Math.min(0.92, textDraft.y),
      size: 12 + strokeWidth * 2,
    })
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!editing || event.button !== 0) return
    if (textDraft) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      return
    }
    const point = pointOf(event)
    if (tool === 'text') {
      setTextDraft({ ...point, value: '' })
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 合成事件或已释放的指针不支持捕获，不影响真实鼠标绘制。
    }
    if (tool === 'pen') {
      setDrawing({
        id: uid('ann'),
        type: 'pen',
        color,
        width: strokeWidth,
        points: [point],
      })
      return
    }
    setDrawing({
      id: uid('ann'),
      type: tool,
      color,
      width: strokeWidth,
      start: point,
      end: point,
    })
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing) return
    const point = pointOf(event)
    setDrawing((prev) => {
      if (!prev) return prev
      if (prev.type === 'pen') {
        const last = prev.points[prev.points.length - 1]
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.0015) return prev
        if (prev.points.length >= 3000) return prev
        return { ...prev, points: [...prev.points, point] }
      }
      return { ...prev, end: point }
    })
  }

  const finishDrawing = () => {
    if (!drawing) return
    const annotation = drawing
    setDrawing(null)
    if (annotation.type === 'pen') {
      if (annotation.points.length < 2) return
    } else if (annotation.type === 'arrow' || annotation.type === 'rect') {
      if (
        Math.hypot(annotation.end.x - annotation.start.x, annotation.end.y - annotation.start.y) <
        0.008
      ) {
        return
      }
    } else {
      return
    }
    commit(annotation)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (textDraft) {
          setTextDraft(null)
          return
        }
        if (editing) {
          setEditing(false)
          return
        }
        onClose()
        return
      }
      if (editing) return
      if (event.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (event.key === 'ArrowRight' && index < charts.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [charts.length, index, onClose, onNavigate, editing, textDraft])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[#17130e]/93"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={chart.name}
    >
      <div
        className="flex h-12 shrink-0 items-center justify-between gap-4 px-4 text-paper/85"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="min-w-0 truncate text-xs">{chart.name}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="num mr-1 text-xs text-paper/55">
            {index + 1} / {charts.length}
          </span>
          {url ? (
            <button
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${
                editing ? 'bg-paper/20 text-paper' : 'text-paper/80 hover:bg-paper/10'
              }`}
              onClick={() => {
                setEditing((value) => !value)
                setTextDraft(null)
              }}
              title="在截图上画线、框选或写文字"
            >
            <Pencil size={16} strokeWidth={1.5} />
              {editing ? '退出标注' : draft.length ? `标注 ${draft.length}` : '标注'}
            </button>
          ) : null}
          {url ? (
            <a
              href={url}
              download={chart.name}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-paper/80 hover:bg-paper/10"
            >
              <Download size={16} strokeWidth={1.5} />
              下载
            </a>
          ) : null}
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-paper/80 hover:bg-paper/10"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {editing ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-paper/10 bg-black/20 px-4 py-2"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-0.5 rounded-lg bg-paper/10 p-0.5">
            {TOOLS.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors ${
                  tool === key ? 'bg-paper text-ink' : 'text-paper/75 hover:bg-paper/10'
                }`}
                onClick={() => {
                  setTool(key)
                  setTextDraft(null)
                }}
                title={label}
              >
                <Icon size={16} strokeWidth={1.5} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 px-1">
            {ANNOTATION_COLORS.map((swatch) => (
              <button
                key={swatch}
                className={`h-4 w-4 rounded-full ring-2 transition-colors ${
                  color === swatch ? 'ring-paper' : 'ring-paper/20 hover:ring-paper/50'
                }`}
                style={{ backgroundColor: swatch }}
                onClick={() => setColor(swatch)}
                aria-label={`标注颜色 ${swatch}`}
                title={swatch}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-paper/10 px-1 py-0.5">
            {ANNOTATION_WIDTHS.map((width) => (
              <button
                key={width}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  strokeWidth === width ? 'bg-paper text-ink' : 'text-paper/70 hover:bg-paper/10'
                }`}
                onClick={() => setStrokeWidth(width)}
                aria-label={`线宽 ${width}`}
                title={`线宽 ${width}`}
              >
                <span
                  className="block rounded-full bg-current"
                  style={{ width: width * 2, height: width * 2 }}
                />
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-paper/75 transition-colors hover:bg-paper/10 disabled:cursor-not-allowed disabled:text-paper/30"
              onClick={undo}
              disabled={!history.length}
            >
              <Undo2 size={16} strokeWidth={1.5} />
              撤销
            </button>
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-paper/75 transition-colors hover:bg-paper/10 disabled:cursor-not-allowed disabled:text-paper/30"
              onClick={clear}
              disabled={!draft.length}
            >
              <Trash2 size={16} strokeWidth={1.5} />
              清空
            </button>
            <button
              className="inline-flex h-7 items-center rounded-md bg-paper px-2.5 text-xs font-medium text-ink transition-colors hover:bg-paper/90"
              onClick={() => {
                setEditing(false)
                setTextDraft(null)
              }}
            >
              完成
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {url ? (
          <div className="relative inline-flex max-w-full">
            <img
              ref={imgRef}
              src={url}
              alt={chart.name}
              onLoad={measure}
              draggable={false}
              className="block max-w-full rounded-md bg-paper object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
              style={{ maxHeight: editing ? 'calc(100vh - 156px)' : 'calc(100vh - 112px)' }}
            />
            {box.width > 0 && box.height > 0 ? (
              <svg
                viewBox={`0 0 ${box.width} ${box.height}`}
                className={`absolute inset-0 h-full w-full touch-none select-none ${
                  editing ? 'cursor-crosshair' : 'pointer-events-none'
                }`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishDrawing}
                onPointerCancel={() => setDrawing(null)}
              >
                {draft.map((annotation) => (
                  <AnnotationShape
                    key={annotation.id}
                    annotation={annotation}
                    width={box.width}
                    height={box.height}
                  />
                ))}
                {drawing ? (
                  <AnnotationShape
                    annotation={drawing}
                    width={box.width}
                    height={box.height}
                  />
                ) : null}
              </svg>
            ) : null}
            {textDraft && editing ? (
              <input
                autoFocus
                value={textDraft.value}
                onChange={(event) =>
                  setTextDraft((prev) =>
                    prev ? { ...prev, value: event.target.value } : prev,
                  )
                }
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitText()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setTextDraft(null)
                  }
                }}
                onBlur={commitText}
                onPointerDown={(event) => event.stopPropagation()}
                placeholder="输入标注文字，回车确认"
                className="absolute z-10 h-8 w-[190px] rounded-md border border-paper/50 bg-[#1c1813]/94 px-2 text-xs text-paper outline-none placeholder:text-paper/40"
                style={{
                  left: `${textDraft.x * 100}%`,
                  top: `${textDraft.y * 100}%`,
                  transform: textDraft.x > 0.62 ? 'translateX(-100%)' : undefined,
                }}
              />
            ) : null}
          </div>
        ) : (
          <span className="flex items-center gap-2 text-xs text-paper/60">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ImageOff size={16} />}
            {loading ? '正在读取图片…' : '图片文件不存在'}
          </span>
        )}

        {!editing && index > 0 ? (
          <button
            className="absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper/10 text-paper/80 transition-colors hover:bg-paper/20"
            onClick={() => onNavigate(index - 1)}
            aria-label="上一张"
          >
            <ChevronLeft size={18} />
          </button>
        ) : null}
        {!editing && index < charts.length - 1 ? (
          <button
            className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper/10 text-paper/80 transition-colors hover:bg-paper/20"
            onClick={() => onNavigate(index + 1)}
            aria-label="下一张"
          >
            <ChevronRight size={18} />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
