use crate::db::apply_migrations;
use crate::error::{Result, SerializableError};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

const FORMAT_VERSION: u32 = 1;
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const DB_FILE_NAME: &str = "garden.sqlite";
const MANIFEST_FILE_NAME: &str = "manifest.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectMeta {
    pub path: String,
    pub garden_id: i64,
    pub name: String,
    pub created_at: String,
    pub format_version: u32,
    pub app_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Manifest {
    format_version: u32,
    app_version: String,
    created_at: String,
}

pub struct OpenProject {
    project_path: PathBuf,
    working_dir: tempfile::TempDir,
}

impl OpenProject {
    fn db_path(&self) -> PathBuf {
        self.working_dir.path().join(DB_FILE_NAME)
    }

    fn manifest_path(&self) -> PathBuf {
        self.working_dir.path().join(MANIFEST_FILE_NAME)
    }

    fn open_conn(&self) -> Result<Connection> {
        Ok(Connection::open(self.db_path())?)
    }
}

#[derive(Default)]
pub struct ProjectState(pub Mutex<Option<OpenProject>>);

#[tauri::command]
pub fn project_new(
    path: String,
    state: State<'_, ProjectState>,
) -> Result<ProjectMeta> {
    let mut slot = state.0.lock().map_err(|e| SerializableError::Other(e.to_string()))?;
    if let Some(existing) = slot.as_ref() {
        return Err(SerializableError::ProjectAlreadyOpen(
            existing.project_path.display().to_string(),
        ));
    }

    let working_dir = tempfile::Builder::new()
        .prefix("gardenangel-")
        .tempdir()?;
    fs::create_dir_all(working_dir.path().join("assets/photos"))?;
    fs::create_dir_all(working_dir.path().join("assets/sketches"))?;

    let now = chrono::Utc::now().to_rfc3339();
    let manifest = Manifest {
        format_version: FORMAT_VERSION,
        app_version: APP_VERSION.to_string(),
        created_at: now.clone(),
    };
    fs::write(
        working_dir.path().join(MANIFEST_FILE_NAME),
        serde_json::to_vec_pretty(&manifest)?,
    )?;

    let db_path = working_dir.path().join(DB_FILE_NAME);
    let mut conn = Connection::open(&db_path)?;
    apply_migrations(&mut conn)?;
    conn.execute(
        "INSERT INTO gardens (id, name, created_at, updated_at) VALUES (1, ?1, ?2, ?2)",
        params!["Untitled Garden", now],
    )?;

    let project = OpenProject {
        project_path: PathBuf::from(&path),
        working_dir,
    };

    zip_to(&project.working_dir.path().to_path_buf(), Path::new(&path))?;

    let meta = ProjectMeta {
        path: path.clone(),
        garden_id: 1,
        name: "Untitled Garden".to_string(),
        created_at: now,
        format_version: FORMAT_VERSION,
        app_version: APP_VERSION.to_string(),
    };

    *slot = Some(project);
    Ok(meta)
}

#[tauri::command]
pub fn project_open(
    path: String,
    state: State<'_, ProjectState>,
) -> Result<ProjectMeta> {
    let mut slot = state.0.lock().map_err(|e| SerializableError::Other(e.to_string()))?;
    if let Some(existing) = slot.as_ref() {
        return Err(SerializableError::ProjectAlreadyOpen(
            existing.project_path.display().to_string(),
        ));
    }

    let working_dir = tempfile::Builder::new()
        .prefix("gardenangel-")
        .tempdir()?;
    unzip_to(Path::new(&path), working_dir.path())?;

    let manifest_bytes = fs::read(working_dir.path().join(MANIFEST_FILE_NAME))
        .map_err(|_| SerializableError::InvalidProjectFile("missing manifest.json".into()))?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)?;
    if manifest.format_version != FORMAT_VERSION {
        return Err(SerializableError::UnsupportedFormatVersion(
            manifest.format_version,
        ));
    }

    let project = OpenProject {
        project_path: PathBuf::from(&path),
        working_dir,
    };

    let mut conn = project.open_conn()?;
    apply_migrations(&mut conn)?;

    let (garden_id, name, created_at): (i64, String, String) = conn.query_row(
        "SELECT id, name, created_at FROM gardens WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let meta = ProjectMeta {
        path,
        garden_id,
        name,
        created_at,
        format_version: manifest.format_version,
        app_version: manifest.app_version,
    };

    *slot = Some(project);
    Ok(meta)
}

#[tauri::command]
pub fn project_save(state: State<'_, ProjectState>) -> Result<()> {
    let slot = state.0.lock().map_err(|e| SerializableError::Other(e.to_string()))?;
    let project = slot.as_ref().ok_or(SerializableError::NoProjectOpen)?;
    zip_to(
        &project.working_dir.path().to_path_buf(),
        &project.project_path,
    )?;
    Ok(())
}

#[tauri::command]
pub fn project_close(state: State<'_, ProjectState>) -> Result<()> {
    let mut slot = state.0.lock().map_err(|e| SerializableError::Other(e.to_string()))?;
    slot.take();
    Ok(())
}

#[tauri::command]
pub fn project_current(state: State<'_, ProjectState>) -> Result<Option<ProjectMeta>> {
    let slot = state.0.lock().map_err(|e| SerializableError::Other(e.to_string()))?;
    let Some(project) = slot.as_ref() else {
        return Ok(None);
    };

    let manifest_bytes = fs::read(project.manifest_path())?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)?;
    let conn = project.open_conn()?;
    let (garden_id, name, created_at): (i64, String, String) = conn.query_row(
        "SELECT id, name, created_at FROM gardens WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    Ok(Some(ProjectMeta {
        path: project.project_path.display().to_string(),
        garden_id,
        name,
        created_at,
        format_version: manifest.format_version,
        app_version: manifest.app_version,
    }))
}

fn zip_to(src_dir: &PathBuf, dest_path: &Path) -> Result<()> {
    let parent = dest_path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let tmp_path = parent.join(format!(
        ".{}.tmp",
        dest_path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "gardenangel".to_string())
    ));

    {
        let file = fs::File::create(&tmp_path)?;
        let mut zip = zip::ZipWriter::new(file);
        let options: zip::write::FileOptions<()> =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        zip_dir_recursive(&mut zip, src_dir, src_dir, options)?;
        let writer = zip.finish()?;
        writer.sync_all()?;
    }

    fs::rename(&tmp_path, dest_path)?;
    Ok(())
}

fn zip_dir_recursive(
    zip: &mut zip::ZipWriter<fs::File>,
    root: &Path,
    dir: &Path,
    options: zip::write::FileOptions<()>,
) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .map_err(|e| SerializableError::Other(e.to_string()))?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            if !rel_str.is_empty() {
                zip.add_directory(format!("{rel_str}/"), options)?;
            }
            zip_dir_recursive(zip, root, &path, options)?;
        } else {
            zip.start_file(rel_str, options)?;
            let mut f = fs::File::open(&path)?;
            std::io::copy(&mut f, zip)?;
        }
    }
    Ok(())
}

fn unzip_to(src: &Path, dest: &Path) -> Result<()> {
    let file = fs::File::open(src)?;
    let mut archive = zip::ZipArchive::new(file)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(name) = entry.enclosed_name() else {
            continue;
        };
        let out_path = dest.join(name);
        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut out = fs::File::create(&out_path)?;
            let mut buf = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut buf)?;
            out.write_all(&buf)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("assets/photos")).unwrap();
        fs::write(dir.path().join("garden.sqlite"), b"fake-sqlite-bytes").unwrap();
        fs::write(
            dir.path().join("manifest.json"),
            br#"{"format_version":1,"app_version":"0.1.0","created_at":"2026-01-01T00:00:00Z"}"#,
        )
        .unwrap();
        dir
    }

    #[test]
    fn zip_unzip_roundtrip() {
        let src = roundtrip_dir();
        let target = tempfile::NamedTempFile::new().unwrap();
        zip_to(&src.path().to_path_buf(), target.path()).unwrap();

        let restored = tempfile::tempdir().unwrap();
        unzip_to(target.path(), restored.path()).unwrap();

        let restored_db = fs::read(restored.path().join("garden.sqlite")).unwrap();
        assert_eq!(restored_db, b"fake-sqlite-bytes");
        let restored_manifest = fs::read(restored.path().join("manifest.json")).unwrap();
        assert!(restored_manifest.starts_with(b"{\"format_version\":1"));
    }

    #[test]
    fn save_uses_tmp_then_rename() {
        let src = roundtrip_dir();
        let dest_dir = tempfile::tempdir().unwrap();
        let dest = dest_dir.path().join("project.gardenangel");

        fs::write(&dest, b"existing").unwrap();
        zip_to(&src.path().to_path_buf(), &dest).unwrap();

        assert!(dest.exists());
        let leftover_tmp: Vec<_> = fs::read_dir(dest_dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(".project.gardenangel.tmp")
            })
            .collect();
        assert!(leftover_tmp.is_empty(), "tmp file was not cleaned up");

        let bytes = fs::read(&dest).unwrap();
        assert_ne!(bytes, b"existing");
    }

    #[test]
    fn project_new_and_open_roundtrip() {
        let dest_dir = tempfile::tempdir().unwrap();
        let dest = dest_dir.path().join("test.gardenangel");
        let state = ProjectState::default();

        let meta = {
            let mut slot = state.0.lock().unwrap();
            assert!(slot.is_none());
            drop(slot);

            let working_dir = tempfile::Builder::new()
                .prefix("gardenangel-")
                .tempdir()
                .unwrap();
            fs::create_dir_all(working_dir.path().join("assets/photos")).unwrap();
            fs::create_dir_all(working_dir.path().join("assets/sketches")).unwrap();

            let now = chrono::Utc::now().to_rfc3339();
            let manifest = Manifest {
                format_version: FORMAT_VERSION,
                app_version: APP_VERSION.to_string(),
                created_at: now.clone(),
            };
            fs::write(
                working_dir.path().join(MANIFEST_FILE_NAME),
                serde_json::to_vec_pretty(&manifest).unwrap(),
            )
            .unwrap();

            let db_path = working_dir.path().join(DB_FILE_NAME);
            let mut conn = Connection::open(&db_path).unwrap();
            apply_migrations(&mut conn).unwrap();
            conn.execute(
                "INSERT INTO gardens (id, name, created_at, updated_at) VALUES (1, ?1, ?2, ?2)",
                params!["My Test Garden", now.clone()],
            )
            .unwrap();
            drop(conn);

            zip_to(&working_dir.path().to_path_buf(), &dest).unwrap();
            slot = state.0.lock().unwrap();
            *slot = Some(OpenProject {
                project_path: dest.clone(),
                working_dir,
            });

            ProjectMeta {
                path: dest.display().to_string(),
                garden_id: 1,
                name: "My Test Garden".to_string(),
                created_at: now,
                format_version: FORMAT_VERSION,
                app_version: APP_VERSION.to_string(),
            }
        };

        {
            let mut slot = state.0.lock().unwrap();
            slot.take();
        }

        let restored = tempfile::tempdir().unwrap();
        unzip_to(&dest, restored.path()).unwrap();
        let conn = Connection::open(restored.path().join(DB_FILE_NAME)).unwrap();
        let (id, name, created_at): (i64, String, String) = conn
            .query_row(
                "SELECT id, name, created_at FROM gardens WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(id, meta.garden_id);
        assert_eq!(name, meta.name);
        assert_eq!(created_at, meta.created_at);
    }
}
