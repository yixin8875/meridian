use std::{
  fs,
  path::PathBuf,
  time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

/// 数据文件：<app_data_dir>/meridian.json
fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法定位应用数据目录：{e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录：{e}"))?;
  Ok(dir.join("meridian.json"))
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
  read_state(&path)
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, state: serde_json::Value) -> Result<(), String> {
  let path = data_file(&app)?;
  write_state(&path, &state)
}

#[tauri::command]
fn data_path(app: tauri::AppHandle) -> Result<String, String> {
  Ok(data_file(&app)?.display().to_string())
}

/// K 线截图：<app_data_dir>/charts/<id>.jpg
fn charts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法定位应用数据目录：{e}"))?
    .join("charts");
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
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
      delete_chart
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
}
