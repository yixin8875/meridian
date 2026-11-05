import { hasTauri } from './storage'

export interface PreparedChart {
  dataUrl: string
  width: number
  height: number
}

const MAX_EDGE = 1800
const QUALITY = 0.88
const DB_NAME = 'meridian.charts'
const STORE = 'charts'

const urlCache = new Map<string, string>()

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadImageElement(file))
  }
  return loadImageElement(file)
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片无法解码'))
    }
    image.src = url
  })
}

/** 把截图缩到最长边 1800px 并转成 JPEG，控制本机文件体积。 */
export async function prepareChart(file: File): Promise<PreparedChart> {
  if (!file.type.startsWith('image/')) throw new Error('只支持图片文件')
  const source = await loadBitmap(file)
  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height
  if (!sourceWidth || !sourceHeight) throw new Error('图片尺寸无效')

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  // K 线截图多为透明背景，铺白底避免转 JPEG 后发黑。
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  if ('close' in source && typeof source.close === 'function') source.close()

  return { dataUrl: canvas.toDataURL('image/jpeg', QUALITY), width, height }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function revoke(id: string): void {
  const url = urlCache.get(id)
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
  urlCache.delete(id)
}

async function invokeChart<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export async function saveChart(id: string, dataUrl: string): Promise<void> {
  revoke(id)
  urlCache.set(id, dataUrl)
  if (hasTauri()) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    await invokeChart('save_chart', { id, data: Array.from(base64ToBytes(base64)) })
    return
  }
  const blob = await (await fetch(dataUrl)).blob()
  await idbPut(id, blob)
}

export async function loadChartUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id)
  if (cached) return cached
  try {
    if (hasTauri()) {
      const bytes = await invokeChart<number[]>('load_chart', { id })
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }))
      urlCache.set(id, url)
      return url
    }
    const blob = await idbGet(id)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(id, url)
    return url
  } catch {
    return null
  }
}

export async function deleteChart(id: string): Promise<void> {
  revoke(id)
  try {
    if (hasTauri()) {
      await invokeChart('delete_chart', { id })
      return
    }
    await idbDelete(id)
  } catch {
    // 删图失败不应阻塞交易本身的保存。
  }
}

/* ---------- 浏览器预览模式的 IndexedDB 兜底 ---------- */

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
  return dbPromise
}

async function idbPut(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  if (!db) throw new Error('当前环境不支持图片存储')
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('图片写入失败'))
  })
}

async function idbGet(id: string): Promise<Blob | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(id)
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null)
    request.onerror = () => resolve(null)
  })
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
