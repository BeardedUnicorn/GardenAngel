//! Living journal (Phase 6). Observations are text + an optional photo.
//! Photos are copied *into* the project working dir (assets/photos/) so
//! they ride inside the .gardenangel zip — never external references.

use crate::coach::Observation;
use crate::error::{Result, SerializableError};
use crate::project::ProjectState;
use crate::shapes::GARDEN_ID;
use rusqlite::{params, Connection, Row};
use serde::Deserialize;
use std::fs;
use std::path::Path;
use tauri::State;

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[derive(Debug, Deserialize)]
pub struct ObservationInput {
    pub body: String,
    pub bed_id: Option<i64>,
    pub planting_id: Option<i64>,
    pub observed_at: Option<String>,
    /// Absolute path the user picked in the file dialog. Copied in.
    pub photo_source_path: Option<String>,
}

fn row_to_observation(row: &Row) -> rusqlite::Result<Observation> {
    Ok(Observation {
        id: row.get("id")?,
        garden_id: row.get("garden_id")?,
        bed_id: row.get("bed_id")?,
        planting_id: row.get("planting_id")?,
        body: row.get("body")?,
        photo_path: row.get("photo_path")?,
        observed_at: row.get("observed_at")?,
        created_at: row.get("created_at")?,
    })
}

fn safe_relative(rel: &str) -> Result<()> {
    if rel.starts_with("assets/")
        && !rel.contains("..")
        && !Path::new(rel).is_absolute()
    {
        Ok(())
    } else {
        Err(SerializableError::Other(format!("unsafe asset path: {rel}")))
    }
}

fn copy_photo(working_dir: &Path, source: &str) -> Result<String> {
    let src = Path::new(source);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .filter(|e| matches!(e.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif"))
        .unwrap_or_else(|| "jpg".to_string());
    let rel = format!("assets/photos/{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = working_dir.join(&rel);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, &dest)?;
    Ok(rel)
}

pub fn create_observation(
    conn: &Connection,
    working_dir: &Path,
    input: &ObservationInput,
) -> Result<Observation> {
    if input.body.trim().is_empty() && input.photo_source_path.is_none() {
        return Err(SerializableError::Other(
            "an observation needs text or a photo".into(),
        ));
    }
    let photo_path = match &input.photo_source_path {
        Some(p) => Some(copy_photo(working_dir, p)?),
        None => None,
    };
    let now = now_iso();
    let observed_at = input.observed_at.clone().unwrap_or_else(|| now.clone());
    conn.execute(
        "INSERT INTO observations
            (garden_id, bed_id, planting_id, body, photo_path, observed_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            GARDEN_ID,
            input.bed_id,
            input.planting_id,
            input.body,
            photo_path,
            observed_at,
            now
        ],
    )?;
    conn.query_row(
        "SELECT id, garden_id, bed_id, planting_id, body, photo_path,
                observed_at, created_at
         FROM observations WHERE id = ?1",
        params![conn.last_insert_rowid()],
        row_to_observation,
    )
    .map_err(Into::into)
}

pub fn list_observations(conn: &Connection) -> Result<Vec<Observation>> {
    let mut stmt = conn.prepare(
        "SELECT id, garden_id, bed_id, planting_id, body, photo_path,
                observed_at, created_at
         FROM observations WHERE garden_id = ?1
         ORDER BY observed_at DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![GARDEN_ID], row_to_observation)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn delete_observation(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute("DELETE FROM observations WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("observation {id} not found")));
    }
    Ok(())
}

// =========================================================================
// Tauri commands
// =========================================================================

#[tauri::command]
pub fn observation_create(
    input: ObservationInput,
    state: State<'_, ProjectState>,
) -> Result<Observation> {
    state.with_db_and_dir(|conn, dir| create_observation(conn, dir, &input))
}

#[tauri::command]
pub fn observations_list(state: State<'_, ProjectState>) -> Result<Vec<Observation>> {
    state.with_db(|conn| list_observations(conn))
}

#[tauri::command]
pub fn observation_delete(id: i64, state: State<'_, ProjectState>) -> Result<()> {
    state.with_db(|conn| delete_observation(conn, id))
}

/// Raw bytes of a photo inside the project zip, for rendering as a blob.
#[tauri::command]
pub fn observation_photo_read(
    photo_path: String,
    state: State<'_, ProjectState>,
) -> Result<Vec<u8>> {
    state.with_db_and_dir(|_conn, dir| {
        safe_relative(&photo_path)?;
        Ok(fs::read(dir.join(&photo_path))?)
    })
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;

    fn fresh() -> (Connection, tempfile::TempDir) {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO gardens (id, name, created_at, updated_at)
             VALUES (1, 'T', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("assets/photos")).unwrap();
        (conn, dir)
    }

    #[test]
    fn create_text_only_then_list_newest_first() {
        let (conn, dir) = fresh();
        create_observation(
            &conn,
            dir.path(),
            &ObservationInput {
                body: "sprouts up".into(),
                bed_id: None,
                planting_id: None,
                observed_at: Some("2026-05-01T00:00:00Z".into()),
                photo_source_path: None,
            },
        )
        .unwrap();
        create_observation(
            &conn,
            dir.path(),
            &ObservationInput {
                body: "flowering".into(),
                bed_id: None,
                planting_id: None,
                observed_at: Some("2026-05-10T00:00:00Z".into()),
                photo_source_path: None,
            },
        )
        .unwrap();
        let all = list_observations(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].body, "flowering");
    }

    #[test]
    fn photo_is_copied_into_working_dir_and_readable() {
        let (conn, dir) = fresh();
        let src = dir.path().join("source.png");
        fs::write(&src, b"\x89PNG fake bytes").unwrap();

        let obs = create_observation(
            &conn,
            dir.path(),
            &ObservationInput {
                body: "with photo".into(),
                bed_id: None,
                planting_id: None,
                observed_at: None,
                photo_source_path: Some(src.to_string_lossy().to_string()),
            },
        )
        .unwrap();
        let rel = obs.photo_path.unwrap();
        assert!(rel.starts_with("assets/photos/"));
        assert!(rel.ends_with(".png"));
        let bytes = fs::read(dir.path().join(&rel)).unwrap();
        assert_eq!(bytes, b"\x89PNG fake bytes");
    }

    #[test]
    fn empty_observation_rejected_and_path_traversal_blocked() {
        let (conn, dir) = fresh();
        assert!(create_observation(
            &conn,
            dir.path(),
            &ObservationInput {
                body: "   ".into(),
                bed_id: None,
                planting_id: None,
                observed_at: None,
                photo_source_path: None,
            },
        )
        .is_err());
        assert!(safe_relative("assets/photos/x.jpg").is_ok());
        assert!(safe_relative("../../etc/passwd").is_err());
        assert!(safe_relative("assets/../secrets").is_err());
    }
}
