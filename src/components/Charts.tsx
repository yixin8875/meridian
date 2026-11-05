import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  ImageOff,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import type { ChartRef } from '../types'
import { loadChartUrl } from '../lib/charts'

export type ChartItem = ChartRef & { preview?: string }

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
            className={`${heightClass} flex w-full items-center justify-center gap-1.5 bg-list text-[10.5px] text-faint`}
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                加载中
              </>
            ) : (
              <>
                <ImageOff size={13} />
                图片不可用
              </>
            )}
          </div>
        )}
      </button>
      <div className="flex items-center gap-1 border-t border-line bg-white px-2 py-1">
        <ImageIcon size={10} className="shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[9.5px] text-faint">{chart.name}</span>
        {onRemove ? (
          <button
            type="button"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint transition-colors hover:bg-loss-soft hover:text-loss"
            onClick={onRemove}
            aria-label="移除这张图"
          >
            <X size={11} />
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
        <span className="text-[10px] text-faint">
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
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-accent ring-1 ring-line">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-medium text-ink">
            {busy ? '正在处理图片…' : '粘贴截图，或点击 / 拖入图片'}
          </div>
          <div className="mt-0.5 text-[10px] text-faint">
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

export function ChartGallery({ items }: { items: ChartItem[] }) {
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
            heightClass="h-[150px]"
            onOpen={() => setIndex(position)}
          />
        ))}
      </div>
      <ChartLightbox
        charts={charts}
        index={index}
        onClose={() => setIndex(null)}
        onNavigate={setIndex}
      />
    </>
  )
}

export function ChartLightbox({
  charts,
  index,
  onClose,
  onNavigate,
}: {
  charts: ChartRef[]
  index: number | null
  onClose: () => void
  onNavigate: (next: number) => void
}) {
  if (index === null || !charts[index]) return null
  return <LightboxBody charts={charts} index={index} onClose={onClose} onNavigate={onNavigate} />
}

function LightboxBody({
  charts,
  index,
  onClose,
  onNavigate,
}: {
  charts: ChartRef[]
  index: number
  onClose: () => void
  onNavigate: (next: number) => void
}) {
  const chart = charts[index]!
  const { url, loading } = useChartUrl(chart.id)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (event.key === 'ArrowRight' && index < charts.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [charts.length, index, onClose, onNavigate])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[#16161a]/88 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={chart.name}
    >
      <div
        className="flex h-12 shrink-0 items-center justify-between gap-4 px-4 text-white/85"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="min-w-0 truncate text-[11.5px]">{chart.name}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="num mr-1 text-[11px] text-white/55">
            {index + 1} / {charts.length}
          </span>
          {url ? (
            <a
              href={url}
              download={chart.name}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-white/80 hover:bg-white/10"
            >
              <Download size={13} />
              下载
            </a>
          ) : null}
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {url ? (
          <img
            src={url}
            alt={chart.name}
            className="max-h-full max-w-full rounded-md bg-white object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
          />
        ) : (
          <span className="flex items-center gap-2 text-[12px] text-white/60">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ImageOff size={15} />}
            {loading ? '正在读取图片…' : '图片文件不存在'}
          </span>
        )}

        {index > 0 ? (
          <button
            className="absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            onClick={() => onNavigate(index - 1)}
            aria-label="上一张"
          >
            <ChevronLeft size={18} />
          </button>
        ) : null}
        {index < charts.length - 1 ? (
          <button
            className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
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
