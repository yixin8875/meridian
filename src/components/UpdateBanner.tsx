import { useEffect, useRef, useState } from 'react'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Download, X } from 'lucide-react'
import { hasTauri } from '../lib/storage'

type Phase = 'idle' | 'downloading' | 'installing' | 'error'

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<Update | null>(null)

  useEffect(() => {
    current.current = update
  }, [update])

  useEffect(() => {
    if (!hasTauri() || !import.meta.env.PROD) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void check({ timeout: 15000 })
        .then((next) => {
          if (cancelled) {
            if (next) void next.close()
            return
          }
          if (next) setUpdate(next)
        })
        .catch(() => {
          // 离线或尚未发布新版本时保持安静，不打断启动。
        })
    }, 3000)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (current.current) void current.current.close()
    }
  }, [])

  if (!update) return null

  const install = async () => {
    if (phase === 'downloading' || phase === 'installing') return
    setPhase('downloading')
    setError(null)
    setProgress(0)
    let total = 0
    let received = 0

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength
          if (total > 0) setProgress(Math.min(99, Math.round((received / total) * 100)))
        } else {
          setPhase('installing')
          setProgress(100)
        }
      })
      // Windows 安装器会自行退出并重启应用；其他平台需要手动重启。
      if (!/Windows/i.test(navigator.userAgent)) await relaunch()
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const dismiss = () => {
    if (phase === 'downloading' || phase === 'installing') return
    void update.close()
    setUpdate(null)
  }

  const busy = phase === 'downloading' || phase === 'installing'

  return (
    <div className="fade-in fixed bottom-4 right-4 z-40 w-90 max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-line bg-paper shadow-[0_8px_24px_rgba(32,28,23,0.08)]">
      <div className="flex items-start gap-3 px-4 py-4">
        <Download size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">发现新版本 v{update.version}</p>
          <p className="mt-1 text-xs text-muted">
            当前 v{update.currentVersion} · 更新后会自动重启
          </p>
          {phase === 'downloading' ? (
            <p className="num mt-1.5 text-xs text-accent">正在下载 {progress}%</p>
          ) : null}
          {phase === 'installing' ? (
            <p className="mt-1.5 text-xs text-accent">正在安装，应用即将重启…</p>
          ) : null}
          {error ? (
            <p className="mt-1.5 break-words text-xs leading-relaxed text-loss">
              更新失败：{error}
            </p>
          ) : null}
        </div>
        {!busy ? (
          <button
            className="icon-btn -mr-1 -mt-1 h-8 w-8"
            onClick={dismiss}
            aria-label="稍后更新"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      {phase === 'downloading' ? (
        <div className="h-0.5 w-full bg-canvas">
          <div
            className="h-full origin-left bg-accent transition-transform duration-200"
            style={{ transform: `scaleX(${Math.min(100, Math.max(0, progress)) / 100})` }}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-line bg-list px-4 py-3">
        {!busy ? (
          <button className="btn btn-ghost h-8 px-2.5 text-xs" onClick={dismiss}>
            稍后
          </button>
        ) : null}
        <button
          className="btn btn-primary h-8 px-3 text-xs"
          onClick={() => void install()}
          disabled={busy}
        >
          {phase === 'downloading'
            ? '正在下载…'
            : phase === 'installing'
              ? '正在安装…'
              : phase === 'error'
                ? '重试'
                : '下载并安装'}
        </button>
      </div>
    </div>
  )
}
