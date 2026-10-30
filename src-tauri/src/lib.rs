mod app;
mod storage;

use app::{EnvEntry, EnvSource};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
struct Bootstrap {
    entries: Vec<EnvEntry>,
    source: String,
    path: String,
    elevated: bool,
}

fn app_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn resolve_dotenv_path(path: Option<String>) -> PathBuf {
    let requested = path
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".env"));
    if requested.is_absolute() {
        return requested;
    }

    let working_directory = std::env::current_dir().unwrap_or_default();
    let working_path = working_directory.join(&requested);
    if working_path.exists() {
        return working_path;
    }

    #[cfg(debug_assertions)]
    {
        let project_directory = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")));
        let project_path = project_directory.join(&requested);
        if project_path.exists() {
            return project_path;
        }
    }

    working_path
}

#[tauri::command]
fn load_workspace(path: Option<String>) -> Result<Bootstrap, String> {
    let path = resolve_dotenv_path(path);
    #[cfg(windows)]
    let mut entries = storage::load_env(&path).map_err(app_error)?;
    #[cfg(windows)]
    if path.exists() {
        entries.extend(storage::load_dotenv(&path).map_err(app_error)?);
    }
    #[cfg(not(windows))]
    let entries = if path.exists() {
        storage::load_dotenv(&path).map_err(app_error)?
    } else {
        Vec::new()
    };
    #[cfg(windows)]
    let source = "windows".to_owned();
    #[cfg(not(windows))]
    let source = "dotenv".to_owned();
    Ok(Bootstrap {
        entries,
        source,
        path: path.to_string_lossy().into_owned(),
        elevated: storage::has_admin_privileges(),
    })
}

#[tauri::command]
fn save_workspace(
    path: String,
    original: Vec<EnvEntry>,
    entries: Vec<EnvEntry>,
) -> Result<(), String> {
    let file_original: Vec<_> = original
        .iter()
        .filter(|entry| matches!(entry.source, EnvSource::Dotenv | EnvSource::Process))
        .cloned()
        .collect();
    let file_entries: Vec<_> = entries
        .iter()
        .filter(|entry| matches!(entry.source, EnvSource::Dotenv | EnvSource::Process))
        .cloned()
        .collect();
    if !file_original.is_empty() || !file_entries.is_empty() {
        storage::save_changes(&path, &file_original, &file_entries).map_err(app_error)?;
    }
    let registry_original: Vec<_> = original
        .into_iter()
        .filter(|entry| matches!(entry.source, EnvSource::User | EnvSource::System))
        .collect();
    let registry_entries: Vec<_> = entries
        .into_iter()
        .filter(|entry| matches!(entry.source, EnvSource::User | EnvSource::System))
        .collect();
    if !registry_original.is_empty() || !registry_entries.is_empty() {
        storage::save_changes(path, &registry_original, &registry_entries).map_err(app_error)?;
    }
    Ok(())
}

#[tauri::command]
fn load_dotenv_file(path: String) -> Result<Vec<EnvEntry>, String> {
    storage::load_dotenv(path).map_err(app_error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            load_dotenv_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
