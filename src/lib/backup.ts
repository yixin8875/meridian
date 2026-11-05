import { hasTauri } from './storage'

export interface BackupInfo {
  path: string
  size: number
  trades: number
  notes: number
  charts: number
  createdAt: string
}

export interface BackupSummary {
  name: string
  path: string
  size: number
  day: string
}

export interface BackupStatus {
  dir: string
  count: number
  keep: number
  latest: BackupSummary | null
}

export interface RestoreInfo {
  source: string
  trades: number
  notes: number
  charts: number
  safetyBackup: string | null
}

export function backupSupported(): boolean {
  return hasTauri()
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

/** 导出包含数据、笔记、账户设置与 K 线图的完整 ZIP。 */
export async function createBackup(destination?: string | null): Promise<BackupInfo> {
  return call<BackupInfo>('create_backup', { destination: destination ?? null })
}

export async function getBackupStatus(): Promise<BackupStatus> {
  return call<BackupStatus>('backup_status')
}

export async function restoreBackup(source: string): Promise<RestoreInfo> {
  return call<RestoreInfo>('restore_backup', { source })
}

export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}
