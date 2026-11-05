use chrono::Local;
use serde::Serialize;
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

const BACKUP_FORMAT: &str = "meridian-backup";
const BACKUP_FORMAT_VERSION: u64 = 1;
const DAILY_BACKUP_KEEP: usize = 14;
const MAX_STATE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CHART_BYTES: u64 = 12 * 1024 * 1024;
const MAX_BACKUP_BYTES: u64 = 512 * 1024 * 1024;

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录：{e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录：{e}"))?;
    Ok(dir)
}

/// 数据文件：<app_data_dir>/meridian.json
fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("meridian.json"))
}

fn read_state(path: &std::path::Path) -> Result<Option<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("读取数据失败：{e}"))?;
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(value) => Ok(Some(value)),
        Err(err) => {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_file_name(format!("meridian.corrupt-{stamp}.json"));
            let _ = fs::rename(path, &backup);
            Err(format!(
                "数据文件无法解析，已备份为 {}：{err}",
                backup.display()
            ))
        }
    }
}

fn write_state(path: &std::path::Path, state: &serde_json::Value) -> Result<(), String> {
    if !state.is_object() {
        return Err("拒绝写入：数据不是对象".into());
    }
    let tmp = path.with_extension("json.tmp");
    let backup = path.with_file_name("meridian.backup.json");

    let text = serde_json::to_string_pretty(state).map_err(|e| format!("序列化失败：{e}"))?;
    fs::write(&tmp, text).map_err(|e| format!("写入临时文件失败：{e}"))?;

    if path.exists() {
        let _ = fs::copy(path, &backup);
        fs::remove_file(path).map_err(|e| format!("替换旧数据失败：{e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("写入数据文件失败：{e}"))?;
    Ok(())
}

#[tauri::command]
fn load_state(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = data_file(&app)?;
    let value = read_state(&path)?;
    if value.is_some() {
        // 每天第一次启动时生成一份完整备份；失败不阻塞打开数据。
        let _ = ensure_daily_backup(&app, &path);
    }
    Ok(value)
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, state: serde_json::Value) -> Result<(), String> {
    let path = data_file(&app)?;
    write_state(&path, &state)?;
    let _ = ensure_daily_backup(&app, &path);
    Ok(())
}

#[tauri::command]
fn data_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_file(&app)?.display().to_string())
}

/// K 线截图：<app_data_dir>/charts/<id>.jpg
fn charts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("charts");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建图片目录：{e}"))?;
    Ok(dir)
}

fn chart_path(dir: &std::path::Path, id: &str) -> Result<PathBuf, String> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err("图片标识不合法".into());
    }
    Ok(dir.join(format!("{id}.jpg")))
}

fn write_chart(dir: &std::path::Path, id: &str, data: &[u8]) -> Result<(), String> {
    if data.is_empty() {
        return Err("图片内容为空".into());
    }
    if data.len() > 12 * 1024 * 1024 {
        return Err("图片过大（上限 12 MB）".into());
    }
    let path = chart_path(dir, id)?;
    let tmp = dir.join(format!("{id}.jpg.tmp"));
    fs::write(&tmp, data).map_err(|e| format!("写入图片失败：{e}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("替换旧图片失败：{e}"))?;
    }
    fs::rename(&tmp, &path).map_err(|e| format!("保存图片失败：{e}"))?;
    Ok(())
}

fn read_chart(dir: &std::path::Path, id: &str) -> Result<Vec<u8>, String> {
    let path = chart_path(dir, id)?;
    fs::read(&path).map_err(|e| format!("读取图片失败：{e}"))
}

fn remove_chart(dir: &std::path::Path, id: &str) -> Result<(), String> {
    let path = chart_path(dir, id)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("删除图片失败：{err}")),
    }
}

#[tauri::command]
fn save_chart(app: tauri::AppHandle, id: String, data: Vec<u8>) -> Result<(), String> {
    write_chart(&charts_dir(&app)?, &id, &data)
}

#[tauri::command]
fn load_chart(app: tauri::AppHandle, id: String) -> Result<Vec<u8>, String> {
    read_chart(&charts_dir(&app)?, &id)
}

#[tauri::command]
fn delete_chart(app: tauri::AppHandle, id: String) -> Result<(), String> {
    remove_chart(&charts_dir(&app)?, &id)
}

/* ---------- 完整备份与恢复 ---------- */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupInfo {
    path: String,
    size: u64,
    trades: usize,
    notes: usize,
    charts: usize,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupSummary {
    name: String,
    path: String,
    size: u64,
    day: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupStatus {
    dir: String,
    count: usize,
    keep: usize,
    latest: Option<BackupSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreInfo {
    source: String,
    trades: usize,
    notes: usize,
    charts: usize,
    safety_backup: Option<String>,
}

struct RemoveDirOnDrop(PathBuf);

impl Drop for RemoveDirOnDrop {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn now_stamp() -> String {
    Local::now().format("%Y-%m-%d-%H%M%S").to_string()
}

fn backup_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建备份目录：{e}"))?;
    Ok(dir)
}

fn daily_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = backup_root(app)?.join("daily");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建每日备份目录：{e}"))?;
    Ok(dir)
}

fn safety_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = backup_root(app)?.join("safety");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建安全备份目录：{e}"))?;
    Ok(dir)
}

fn list_chart_files(dir: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(format!("读取图片目录失败：{err}")),
    };
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取图片目录失败：{e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some(id) = name.strip_suffix(".jpg") else {
            continue;
        };
        if chart_path(dir, id).is_err() {
            continue;
        }
        out.push((id.to_string(), path));
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

fn read_entry<R: Read>(entry: R, limit: u64) -> Result<Vec<u8>, String> {
    let mut data = Vec::new();
    entry
        .take(limit.saturating_add(1))
        .read_to_end(&mut data)
        .map_err(|e| format!("读取备份内容失败：{e}"))?;
    if data.len() as u64 > limit {
        return Err("备份中的单项内容过大，已拒绝恢复。".into());
    }
    Ok(data)
}

/// 把 meridian.json 与 charts/ 打成完整备份。
fn write_backup(
    state_path: &Path,
    charts_path: &Path,
    destination: &Path,
) -> Result<BackupInfo, String> {
    let raw = fs::read_to_string(state_path).map_err(|e| format!("读取数据失败：{e}"))?;
    if raw.len() as u64 > MAX_STATE_BYTES {
        return Err("数据文件过大，无法备份。".into());
    }
    let state: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("数据文件无法解析：{e}"))?;
    if !state.is_object() {
        return Err("数据文件不是对象，无法备份。".into());
    }

    let charts = list_chart_files(charts_path)?;
    let trades = state
        .get("trades")
        .and_then(serde_json::Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    let notes = state
        .get("notes")
        .and_then(serde_json::Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    let created_at = Local::now().to_rfc3339();
    let manifest = serde_json::json!({
      "format": BACKUP_FORMAT,
      "formatVersion": BACKUP_FORMAT_VERSION,
      "appVersion": env!("CARGO_PKG_VERSION"),
      "createdAt": created_at,
      "dataVersion": state.get("version").cloned().unwrap_or(serde_json::Value::Null),
      "trades": trades,
      "notes": notes,
      "charts": charts.len(),
    });

    if let Some(parent) = destination.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建备份目录：{e}"))?;
        }
    }
    let file_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("meridian-backup.zip");
    let tmp = destination.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));

    let build = || -> Result<(), String> {
        let file = File::create(&tmp).map_err(|e| format!("无法写入备份：{e}"))?;
        let mut zip = ZipWriter::new(file);
        let deflated =
            || SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let stored = || SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

        zip.start_file("manifest.json", deflated())
            .map_err(|e| format!("写入备份清单失败：{e}"))?;
        zip.write_all(
            serde_json::to_string_pretty(&manifest)
                .map_err(|e| e.to_string())?
                .as_bytes(),
        )
        .map_err(|e| format!("写入备份清单失败：{e}"))?;

        zip.start_file("meridian.json", deflated())
            .map_err(|e| format!("写入数据备份失败：{e}"))?;
        zip.write_all(raw.as_bytes())
            .map_err(|e| format!("写入数据备份失败：{e}"))?;

        for (id, path) in &charts {
            let data = fs::read(path).map_err(|e| format!("读取 K 线图失败：{e}"))?;
            if data.len() as u64 > MAX_CHART_BYTES {
                return Err(format!("K 线图 {id} 超过 12 MB，无法备份。"));
            }
            zip.start_file(format!("charts/{id}.jpg"), stored())
                .map_err(|e| format!("写入 K 线图失败：{e}"))?;
            zip.write_all(&data)
                .map_err(|e| format!("写入 K 线图失败：{e}"))?;
        }
        zip.finish().map_err(|e| format!("完成备份失败：{e}"))?;
        Ok(())
    };

    if let Err(err) = build() {
        let _ = fs::remove_file(&tmp);
        return Err(err);
    }

    if destination.exists() {
        // Windows 的 rename 不能覆盖已有文件：先把旧备份挪开，再原子替换。
        let old = destination.with_file_name(format!(".{file_name}.{}.old", std::process::id()));
        let _ = fs::remove_file(&old);
        if let Err(err) = fs::rename(destination, &old) {
            let _ = fs::remove_file(&tmp);
            return Err(format!("保存备份失败：{err}"));
        }
        if let Err(err) = fs::rename(&tmp, destination) {
            let _ = fs::rename(&old, destination);
            let _ = fs::remove_file(&tmp);
            return Err(format!("保存备份失败：{err}"));
        }
        let _ = fs::remove_file(&old);
    } else if let Err(err) = fs::rename(&tmp, destination) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("保存备份失败：{err}"));
    }

    let size = fs::metadata(destination)
        .map(|meta| meta.len())
        .unwrap_or(0);
    Ok(BackupInfo {
        path: destination.display().to_string(),
        size,
        trades,
        notes,
        charts: charts.len(),
        created_at,
    })
}

fn list_daily(dir: &Path) -> Result<Vec<BackupSummary>, String> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(format!("读取备份目录失败：{err}")),
    };
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取备份目录失败：{e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("meridian-daily-") || !name.ends_with(".zip") {
            continue;
        }
        let day = name
            .trim_start_matches("meridian-daily-")
            .trim_end_matches(".zip")
            .to_string();
        let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        out.push(BackupSummary {
            name,
            path: path.display().to_string(),
            size,
            day,
        });
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

fn prune_daily(dir: &Path) -> Result<usize, String> {
    let entries = list_daily(dir)?;
    let mut removed = 0;
    for entry in entries.into_iter().skip(DAILY_BACKUP_KEEP) {
        if fs::remove_file(&entry.path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

fn ensure_daily_backup(
    app: &tauri::AppHandle,
    state_path: &Path,
) -> Result<Option<BackupInfo>, String> {
    if !state_path.exists() {
        return Ok(None);
    }
    let dir = daily_dir(app)?;
    let day = Local::now().format("%Y-%m-%d").to_string();
    let destination = dir.join(format!("meridian-daily-{day}.zip"));
    if destination.exists() {
        return Ok(None);
    }
    let charts = charts_dir(app)?;
    let info = write_backup(state_path, &charts, &destination)?;
    let _ = prune_daily(&dir);
    Ok(Some(info))
}

fn default_backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = backup_root(app)?.join("manual");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建备份目录：{e}"))?;
    Ok(dir.join(format!("meridian-backup-{}.zip", now_stamp())))
}

#[tauri::command]
fn create_backup(app: tauri::AppHandle, destination: Option<String>) -> Result<BackupInfo, String> {
    let state_path = data_file(&app)?;
    if !state_path.exists() {
        return Err("还没有可备份的数据文件，请先保存一笔数据。".into());
    }
    let mut destination = match destination {
        Some(value) if !value.trim().is_empty() => PathBuf::from(value.trim()),
        _ => default_backup_path(&app)?,
    };
    if destination
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| !value.eq_ignore_ascii_case("zip"))
        .unwrap_or(true)
    {
        destination.set_extension("zip");
    }
    let charts = charts_dir(&app)?;
    write_backup(&state_path, &charts, &destination)
}

#[tauri::command]
fn backup_status(app: tauri::AppHandle) -> Result<BackupStatus, String> {
    let dir = daily_dir(&app)?;
    let entries = list_daily(&dir)?;
    Ok(BackupStatus {
        dir: dir.display().to_string(),
        count: entries.len(),
        keep: DAILY_BACKUP_KEEP,
        latest: entries.into_iter().next(),
    })
}

fn replace_state(path: &Path, state: &serde_json::Value) -> Result<(), String> {
    let stamp = now_stamp();
    let tmp = path.with_extension(format!("json.restore-{}-{stamp}.tmp", std::process::id()));
    let old = path.with_extension(format!("json.restore-{}-{stamp}.old", std::process::id()));
    let text = serde_json::to_string_pretty(state).map_err(|e| format!("序列化失败：{e}"))?;
    fs::write(&tmp, text).map_err(|e| format!("写入恢复数据失败：{e}"))?;
    if path.exists() {
        if old.exists() {
            let _ = fs::remove_file(&old);
        }
        if let Err(err) = fs::rename(path, &old) {
            let _ = fs::remove_file(&tmp);
            return Err(format!("无法暂存当前数据：{err}"));
        }
    }
    match fs::rename(&tmp, path) {
        Ok(()) => {
            let _ = fs::remove_file(&old);
            Ok(())
        }
        Err(err) => {
            if old.exists() {
                let _ = fs::rename(&old, path);
            }
            let _ = fs::remove_file(&tmp);
            Err(format!("写入恢复数据失败：{err}"))
        }
    }
}

fn apply_restore(
    data_path: &Path,
    current_charts: &Path,
    state: &serde_json::Value,
    incoming_charts: &Path,
    stamp: &str,
) -> Result<(), String> {
    let old_charts = current_charts
        .parent()
        .ok_or_else(|| "无法定位图片目录。".to_string())?
        .join(format!("charts.pre-restore-{stamp}"));
    let had_old = current_charts.exists();
    if had_old {
        if old_charts.exists() {
            let _ = fs::remove_dir_all(&old_charts);
        }
        fs::rename(current_charts, &old_charts)
            .map_err(|e| format!("无法替换图片目录，请关闭正在查看的图片后重试：{e}"))?;
    }
    if let Err(err) = fs::rename(incoming_charts, current_charts) {
        if had_old {
            let _ = fs::rename(&old_charts, current_charts);
        }
        return Err(format!("写入恢复图片失败：{err}"));
    }
    if let Err(err) = replace_state(data_path, state) {
        let _ = fs::remove_dir_all(current_charts);
        if had_old {
            let _ = fs::rename(&old_charts, current_charts);
        }
        return Err(err);
    }
    if had_old {
        let _ = fs::remove_dir_all(&old_charts);
    }
    Ok(())
}

struct ExtractedBackup {
    state: serde_json::Value,
    charts: usize,
}

/// 校验 ZIP 备份并解压到临时目录；调用方负责在结束时清理 `temp_root`。
fn extract_backup(source_path: &Path, temp_root: &Path) -> Result<ExtractedBackup, String> {
    if !source_path.is_file() {
        return Err("备份文件不存在。".into());
    }
    let file = File::open(source_path).map_err(|e| format!("无法打开备份：{e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("不是有效的 ZIP 备份：{e}"))?;
    if archive.len() > 10_000 {
        return Err("备份内文件过多，已拒绝恢复。".into());
    }
    let mut total = 0u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| format!("读取备份目录失败：{e}"))?;
        if entry.is_dir() {
            continue;
        }
        total = total.saturating_add(entry.size());
        if total > MAX_BACKUP_BYTES {
            return Err("备份解压后超过 512 MB，已拒绝恢复。".into());
        }
    }

    let temp_charts = temp_root.join("charts");
    let _ = fs::remove_dir_all(temp_root);
    fs::create_dir_all(&temp_charts).map_err(|e| format!("无法准备恢复目录：{e}"))?;

    let mut manifest: Option<serde_json::Value> = None;
    let mut state: Option<serde_json::Value> = None;
    let mut chart_count = 0usize;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| format!("读取备份内容失败：{e}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry
            .name()
            .map_err(|e| format!("读取备份文件名失败：{e}"))?
            .to_string();
        if name == "manifest.json" {
            let bytes = read_entry(entry, MAX_STATE_BYTES)?;
            manifest =
                Some(serde_json::from_slice(&bytes).map_err(|e| format!("备份清单无法解析：{e}"))?);
        } else if name == "meridian.json" {
            let bytes = read_entry(entry, MAX_STATE_BYTES)?;
            state =
                Some(serde_json::from_slice(&bytes).map_err(|e| format!("备份数据无法解析：{e}"))?);
        } else if let Some(id) = name
            .strip_prefix("charts/")
            .and_then(|value| value.strip_suffix(".jpg"))
        {
            let target =
                chart_path(&temp_charts, id).map_err(|e| format!("备份中包含非法图片路径：{e}"))?;
            let bytes = read_entry(entry, MAX_CHART_BYTES)?;
            fs::write(&target, bytes).map_err(|e| format!("写入恢复图片失败：{e}"))?;
            chart_count += 1;
        }
    }

    let manifest = manifest.ok_or_else(|| "备份缺少清单文件，无法确认格式。".to_string())?;
    if manifest.get("format").and_then(serde_json::Value::as_str) != Some(BACKUP_FORMAT) {
        return Err("这不是 MERIDIAN 的完整备份。".into());
    }
    let format_version = manifest
        .get("formatVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    if format_version == 0 || format_version > BACKUP_FORMAT_VERSION {
        return Err("备份格式版本不受支持，请升级应用后再试。".into());
    }
    let state = state.ok_or_else(|| "备份缺少 meridian.json。".to_string())?;
    if !state.is_object() {
        return Err("备份中的数据格式不正确。".into());
    }
    if !state
        .get("accounts")
        .map(serde_json::Value::is_array)
        .unwrap_or(false)
    {
        return Err("备份缺少账户数据，无法恢复。".into());
    }

    Ok(ExtractedBackup {
        state,
        charts: chart_count,
    })
}

#[tauri::command]
fn restore_backup(app: tauri::AppHandle, source: String) -> Result<RestoreInfo, String> {
    let source_path = PathBuf::from(source.trim());
    let stamp = format!("{}-{}", now_stamp(), std::process::id());
    let temp_root = app_data_dir(&app)?.join(format!("restore-{stamp}"));
    let _temp_guard = RemoveDirOnDrop(temp_root.clone());
    let extracted = extract_backup(&source_path, &temp_root)?;
    let state = extracted.state;

    let data_path = data_file(&app)?;
    let current_charts = charts_dir(&app)?;
    let safety_backup = if data_path.exists() {
        let path = safety_dir(&app)?.join(format!("pre-restore-{stamp}.zip"));
        Some(
            write_backup(&data_path, &current_charts, &path)
                .map_err(|e| format!("创建恢复前安全备份失败，已取消恢复：{e}"))?
                .path,
        )
    } else {
        None
    };

    apply_restore(
        &data_path,
        &current_charts,
        &state,
        &temp_root.join("charts"),
        &stamp,
    )?;

    let trades = state
        .get("trades")
        .and_then(serde_json::Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    let notes = state
        .get("notes")
        .and_then(serde_json::Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);

    Ok(RestoreInfo {
        source: source_path.display().to_string(),
        trades,
        notes,
        charts: extracted.charts,
        safety_backup,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            data_path,
            save_chart,
            load_chart,
            delete_chart,
            create_backup,
            backup_status,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meridian-test-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir.join("meridian.json")
    }

    #[test]
    fn roundtrip_and_backup() {
        let path = temp_file("roundtrip");
        let first = serde_json::json!({
          "accountName": "测试账户",
          "startingEquity": 100000,
          "trades": [],
          "notes": []
        });
        write_state(&path, &first).expect("first write");
        assert_eq!(read_state(&path).expect("read first"), Some(first.clone()));

        let second = serde_json::json!({ "accountName": "第二个账户", "startingEquity": 120000 });
        write_state(&path, &second).expect("second write");
        assert_eq!(read_state(&path).expect("read second"), Some(second));

        let backup = path.with_file_name("meridian.backup.json");
        let raw = fs::read_to_string(backup).expect("backup exists");
        let restored: serde_json::Value = serde_json::from_str(&raw).expect("backup parses");
        assert_eq!(restored, first);
        assert!(!path.with_extension("json.tmp").exists());
        let _ = fs::remove_dir_all(path.parent().expect("parent dir"));
    }

    #[test]
    fn corrupt_file_is_archived() {
        let path = temp_file("corrupt");
        fs::write(&path, "{ not json").expect("write corrupt file");
        assert!(read_state(&path).is_err());
        assert!(!path.exists());
        let archived = fs::read_dir(path.parent().expect("parent dir"))
            .expect("list dir")
            .filter_map(|entry| entry.ok())
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("meridian.corrupt-")
            });
        assert!(archived, "corrupt file should be archived");
        let _ = fs::remove_dir_all(path.parent().expect("parent dir"));
    }

    #[test]
    fn rejects_non_object_state() {
        let path = temp_file("reject");
        assert!(write_state(&path, &serde_json::json!([1, 2, 3])).is_err());
        assert!(!path.exists());
        let _ = fs::remove_dir_all(path.parent().expect("parent dir"));
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meridian-chart-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn chart_roundtrip_and_delete() {
        let dir = temp_dir("roundtrip");
        let id = "chart_m3x8_ab12cd";
        let bytes = vec![0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4];
        write_chart(&dir, id, &bytes).expect("write chart");
        assert_eq!(read_chart(&dir, id).expect("read chart"), bytes);
        assert!(chart_path(&dir, id).expect("path").exists());

        remove_chart(&dir, id).expect("delete chart");
        assert!(!chart_path(&dir, id).expect("path").exists());
        // 删除不存在的图片不算错误。
        remove_chart(&dir, id).expect("delete again");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn chart_rejects_unsafe_ids() {
        let dir = temp_dir("unsafe");
        for id in ["../evil", "..", "a/b", "a\\b", "", "查询"] {
            assert!(chart_path(&dir, id).is_err(), "{id} 应被拒绝");
            assert!(write_chart(&dir, id, &[1, 2, 3]).is_err());
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn chart_rejects_empty_payload() {
        let dir = temp_dir("empty");
        assert!(write_chart(&dir, "chart_1", &[]).is_err());
        assert!(!chart_path(&dir, "chart_1").expect("path").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn backup_contains_state_and_charts() {
        let dir = temp_dir("backup-roundtrip");
        let data = dir.join("meridian.json");
        let state = serde_json::json!({
          "version": 4,
          "accounts": [{ "id": "a" }],
          "activeAccountId": "a",
          "trades": [{ "id": "t1" }],
          "notes": [{ "id": "n1" }]
        });
        fs::write(&data, serde_json::to_string(&state).unwrap()).expect("write state");
        let charts = dir.join("charts");
        fs::create_dir_all(&charts).expect("create charts");
        fs::write(charts.join("chart_a.jpg"), b"jpeg").expect("write chart");

        let dest = dir.join("out.zip");
        let info = write_backup(&data, &charts, &dest).expect("backup");
        assert_eq!(info.trades, 1);
        assert_eq!(info.notes, 1);
        assert_eq!(info.charts, 1);
        assert!(info.size > 0);

        let mut archive = ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        let mut names = Vec::new();
        for index in 0..archive.len() {
            names.push(archive.by_index(index).unwrap().name().unwrap().to_string());
        }
        assert!(names.iter().any(|name| name == "meridian.json"));
        assert!(names.iter().any(|name| name == "manifest.json"));
        assert!(names.iter().any(|name| name == "charts/chart_a.jpg"));

        let mut manifest_file = archive.by_name("manifest.json").unwrap();
        let mut text = String::new();
        manifest_file.read_to_string(&mut text).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(manifest["format"], BACKUP_FORMAT);
        assert_eq!(manifest["formatVersion"], BACKUP_FORMAT_VERSION);

        // 覆盖已有备份时也必须留下一个完整、可读取的 ZIP。
        let second = write_backup(&data, &charts, &dest).expect("overwrite backup");
        assert!(second.size > 0);
        let mut replaced = ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        assert!(replaced.by_name("meridian.json").is_ok());
        assert!(replaced.by_name("charts/chart_a.jpg").is_ok());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn prunes_old_daily_backups() {
        let dir = temp_dir("daily-prune");
        for day in 1..=16 {
            fs::write(
                dir.join(format!("meridian-daily-2026-01-{day:02}.zip")),
                b"x",
            )
            .expect("write daily");
        }
        let removed = prune_daily(&dir).expect("prune");
        assert_eq!(removed, 2);
        let entries = list_daily(&dir).expect("list");
        assert_eq!(entries.len(), DAILY_BACKUP_KEEP);
        assert_eq!(entries[0].day, "2026-01-16");
        assert_eq!(entries.last().unwrap().day, "2026-01-03");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn extracts_archive_and_restores_state_and_charts() {
        let dir = temp_dir("restore-archive");
        let source = dir.join("source");
        fs::create_dir_all(&source).expect("create source");
        let source_data = source.join("meridian.json");
        let state = serde_json::json!({
          "version": 4,
          "accounts": [{ "id": "new" }],
          "activeAccountId": "new",
          "trades": [{ "id": "t1" }],
          "notes": [{ "id": "n1" }]
        });
        fs::write(&source_data, serde_json::to_string(&state).unwrap())
            .expect("write source state");
        let source_charts = source.join("charts");
        fs::create_dir_all(&source_charts).expect("create source charts");
        fs::write(source_charts.join("chart_new.jpg"), b"new-jpeg").expect("write source chart");
        let archive = dir.join("backup.zip");
        write_backup(&source_data, &source_charts, &archive).expect("write backup");

        let target = dir.join("target");
        fs::create_dir_all(&target).expect("create target");
        let target_data = target.join("meridian.json");
        fs::write(
            &target_data,
            r#"{"version":4,"accounts":[{"id":"old"}],"trades":[],"notes":[]}"#,
        )
        .expect("write old state");
        let target_charts = target.join("charts");
        fs::create_dir_all(&target_charts).expect("create target charts");
        fs::write(target_charts.join("old.jpg"), b"old-jpeg").expect("write old chart");

        let temp_root = target.join("restore-temp");
        let extracted = extract_backup(&archive, &temp_root).expect("extract");
        assert_eq!(extracted.charts, 1);
        assert_eq!(extracted.state["accounts"][0]["id"], "new");
        assert_eq!(
            fs::read(temp_root.join("charts/chart_new.jpg")).expect("extracted chart"),
            b"new-jpeg"
        );

        apply_restore(
            &target_data,
            &target_charts,
            &extracted.state,
            &temp_root.join("charts"),
            "test",
        )
        .expect("restore");

        let restored: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&target_data).unwrap()).unwrap();
        assert_eq!(restored["accounts"][0]["id"], "new");
        assert_eq!(restored["trades"][0]["id"], "t1");
        assert_eq!(
            fs::read(target_charts.join("chart_new.jpg")).expect("restored chart"),
            b"new-jpeg"
        );
        assert!(!target_charts.join("old.jpg").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn apply_restore_replaces_state_and_charts() {
        let dir = temp_dir("restore");
        let data = dir.join("meridian.json");
        fs::write(
            &data,
            r#"{"version":4,"accounts":[{"id":"old"}],"trades":[],"notes":[]}"#,
        )
        .expect("write old state");
        let charts = dir.join("charts");
        fs::create_dir_all(&charts).expect("create charts");
        fs::write(charts.join("old.jpg"), b"old").expect("write old chart");
        let incoming = dir.join("incoming");
        fs::create_dir_all(&incoming).expect("create incoming");
        fs::write(incoming.join("new.jpg"), b"new").expect("write new chart");

        let state = serde_json::json!({
          "version": 4,
          "accounts": [{ "id": "new" }],
          "trades": [{ "id": "t1" }],
          "notes": [{ "id": "n1" }]
        });
        apply_restore(&data, &charts, &state, &incoming, "test").expect("restore");

        let restored: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&data).unwrap()).unwrap();
        assert_eq!(restored["accounts"][0]["id"], "new");
        assert!(charts.join("new.jpg").exists());
        assert!(!charts.join("old.jpg").exists());
        assert!(!dir.join("charts.pre-restore-test").exists());
        assert!(!incoming.exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
