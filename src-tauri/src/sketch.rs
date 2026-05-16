//! Sketch-mode vector strokes and the AI-cleanup apply step (Phase 3).
//!
//! Strokes are the canonical freehand ink (never raster — see PLAN §4).
//! AI cleanup turns labelled strokes into editable beds/paths/structures;
//! the original strokes are *consumed* (stamped, not deleted) so the ink
//! stays recoverable. The apply step is one transaction: either every
//! shape lands and every source stroke is marked, or nothing changes.

use crate::error::{Result, SerializableError};
use crate::project::ProjectState;
use crate::shapes::{
    insert_bed, insert_path, insert_structure, Bed, BedInput, PathInput, PathShape, Structure,
    StructureInput, GARDEN_ID,
};
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SketchStroke {
    pub id: i64,
    pub garden_id: i64,
    pub label: Option<String>,
    pub points: Vec<[f64; 2]>,
    pub color: Option<String>,
    pub width: Option<f64>,
    pub closed: bool,
    pub created_at: String,
    pub consumed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StrokeInput {
    pub label: Option<String>,
    pub points: Vec<[f64; 2]>,
    pub color: Option<String>,
    pub width: Option<f64>,
    pub closed: bool,
}

fn row_to_stroke(row: &Row) -> rusqlite::Result<SketchStroke> {
    let points_json: String = row.get("points_json")?;
    let points: Vec<[f64; 2]> = serde_json::from_str(&points_json).unwrap_or_default();
    let closed: i64 = row.get("closed")?;
    Ok(SketchStroke {
        id: row.get("id")?,
        garden_id: row.get("garden_id")?,
        label: row.get("label")?,
        points,
        color: row.get("color")?,
        width: row.get("width")?,
        closed: closed != 0,
        created_at: row.get("created_at")?,
        consumed_at: row.get("consumed_at")?,
    })
}

pub fn list_strokes(conn: &Connection) -> Result<Vec<SketchStroke>> {
    let mut stmt = conn.prepare(
        "SELECT id, garden_id, label, points_json, color, width, closed,
                created_at, consumed_at
         FROM sketch_strokes WHERE garden_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![GARDEN_ID], row_to_stroke)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn insert_stroke(conn: &Connection, input: &StrokeInput) -> Result<SketchStroke> {
    let now = now_iso();
    let points_json = serde_json::to_string(&input.points)?;
    conn.execute(
        "INSERT INTO sketch_strokes
            (garden_id, label, points_json, color, width, closed, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            GARDEN_ID,
            input.label,
            points_json,
            input.color,
            input.width,
            input.closed as i64,
            now
        ],
    )?;
    get_stroke(conn, conn.last_insert_rowid())
}

pub fn update_stroke(conn: &Connection, id: i64, input: &StrokeInput) -> Result<SketchStroke> {
    let points_json = serde_json::to_string(&input.points)?;
    let rows = conn.execute(
        "UPDATE sketch_strokes
         SET label = ?2, points_json = ?3, color = ?4, width = ?5, closed = ?6
         WHERE id = ?1",
        params![
            id,
            input.label,
            points_json,
            input.color,
            input.width,
            input.closed as i64
        ],
    )?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("stroke {id} not found")));
    }
    get_stroke(conn, id)
}

pub fn delete_stroke(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute("DELETE FROM sketch_strokes WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("stroke {id} not found")));
    }
    Ok(())
}

fn get_stroke(conn: &Connection, id: i64) -> Result<SketchStroke> {
    Ok(conn.query_row(
        "SELECT id, garden_id, label, points_json, color, width, closed,
                created_at, consumed_at
         FROM sketch_strokes WHERE id = ?1",
        params![id],
        row_to_stroke,
    )?)
}

// =========================================================================
// AI cleanup apply
// =========================================================================

/// The validated cleanup result the frontend asks us to commit. Geometry is
/// already Zod-validated on the frontend (PLAN §6.2); we re-shape it into
/// the existing shape inputs and persist atomically.
#[derive(Debug, Deserialize)]
pub struct CleanupApply {
    pub beds: Vec<BedInput>,
    pub paths: Vec<PathInput>,
    pub structures: Vec<StructureInput>,
    pub consumed_stroke_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct CleanupResult {
    pub beds: Vec<Bed>,
    pub paths: Vec<PathShape>,
    pub structures: Vec<Structure>,
    pub consumed_stroke_ids: Vec<i64>,
}

/// Create all shapes and mark the source strokes consumed in one
/// transaction. Strokes are stamped, not deleted (ADR-006).
pub fn apply_cleanup(conn: &Connection, apply: &CleanupApply) -> Result<CleanupResult> {
    let tx = conn.unchecked_transaction()?;
    let now = now_iso();

    let mut beds = Vec::with_capacity(apply.beds.len());
    for input in &apply.beds {
        beds.push(insert_bed(&tx, input)?);
    }
    let mut paths = Vec::with_capacity(apply.paths.len());
    for input in &apply.paths {
        paths.push(insert_path(&tx, input)?);
    }
    let mut structures = Vec::with_capacity(apply.structures.len());
    for input in &apply.structures {
        structures.push(insert_structure(&tx, input)?);
    }

    for stroke_id in &apply.consumed_stroke_ids {
        let rows = tx.execute(
            "UPDATE sketch_strokes SET consumed_at = ?2
             WHERE id = ?1 AND garden_id = ?3 AND consumed_at IS NULL",
            params![stroke_id, now, GARDEN_ID],
        )?;
        if rows == 0 {
            return Err(SerializableError::Other(format!(
                "stroke {stroke_id} not found or already consumed"
            )));
        }
    }

    tx.commit()?;
    Ok(CleanupResult {
        beds,
        paths,
        structures,
        consumed_stroke_ids: apply.consumed_stroke_ids.clone(),
    })
}

// =========================================================================
// Tauri commands
// =========================================================================

#[tauri::command]
pub fn strokes_list(state: State<'_, ProjectState>) -> Result<Vec<SketchStroke>> {
    state.with_db(|conn| list_strokes(conn))
}

#[tauri::command]
pub fn stroke_create(
    input: StrokeInput,
    state: State<'_, ProjectState>,
) -> Result<SketchStroke> {
    state.with_db(|conn| insert_stroke(conn, &input))
}

#[tauri::command]
pub fn stroke_update(
    id: i64,
    input: StrokeInput,
    state: State<'_, ProjectState>,
) -> Result<SketchStroke> {
    state.with_db(|conn| update_stroke(conn, id, &input))
}

#[tauri::command]
pub fn stroke_delete(id: i64, state: State<'_, ProjectState>) -> Result<()> {
    state.with_db(|conn| delete_stroke(conn, id))
}

#[tauri::command]
pub fn sketch_apply_cleanup(
    apply: CleanupApply,
    state: State<'_, ProjectState>,
) -> Result<CleanupResult> {
    state.with_db(|conn| apply_cleanup(conn, &apply))
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use serde_json::json;

    fn fresh_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO gardens (id, name, created_at, updated_at)
             VALUES (1, 'Test', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn stroke_crud_roundtrip() {
        let conn = fresh_db();
        let s = insert_stroke(
            &conn,
            &StrokeInput {
                label: Some("raised bed".into()),
                points: vec![[1.0, 2.0], [3.0, 4.0]],
                color: Some("#222".into()),
                width: Some(2.0),
                closed: true,
            },
        )
        .unwrap();
        assert_eq!(s.id, 1);
        assert!(s.closed);
        assert!(s.consumed_at.is_none());

        let listed = list_strokes(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].points, vec![[1.0, 2.0], [3.0, 4.0]]);

        delete_stroke(&conn, s.id).unwrap();
        assert!(list_strokes(&conn).unwrap().is_empty());
    }

    #[test]
    fn apply_cleanup_creates_shapes_and_consumes_strokes() {
        let conn = fresh_db();
        let s1 = insert_stroke(
            &conn,
            &StrokeInput {
                label: Some("raised bed".into()),
                points: vec![[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]],
                color: None,
                width: None,
                closed: true,
            },
        )
        .unwrap();
        let s2 = insert_stroke(
            &conn,
            &StrokeInput {
                label: Some("path".into()),
                points: vec![[0.0, 50.0], [80.0, 55.0]],
                color: None,
                width: None,
                closed: false,
            },
        )
        .unwrap();

        let result = apply_cleanup(
            &conn,
            &CleanupApply {
                beds: vec![BedInput {
                    name: Some("raised bed".into()),
                    shape_type: "rect".into(),
                    geometry: json!({ "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0 }),
                    soil_notes: None,
                    sun_exposure: None,
                }],
                paths: vec![PathInput {
                    name: Some("path".into()),
                    points: vec![[0.0, 50.0], [80.0, 55.0]],
                    width: 24.0,
                    material: None,
                }],
                structures: vec![],
                consumed_stroke_ids: vec![s1.id, s2.id],
            },
        )
        .unwrap();

        assert_eq!(result.beds.len(), 1);
        assert_eq!(result.paths.len(), 1);

        let strokes = list_strokes(&conn).unwrap();
        assert!(strokes.iter().all(|s| s.consumed_at.is_some()));
    }

    #[test]
    fn apply_cleanup_is_atomic_on_bad_stroke_id() {
        let conn = fresh_db();
        let result = apply_cleanup(
            &conn,
            &CleanupApply {
                beds: vec![BedInput {
                    name: None,
                    shape_type: "rect".into(),
                    geometry: json!({ "x": 0.0, "y": 0.0, "width": 5.0, "height": 5.0 }),
                    soil_notes: None,
                    sun_exposure: None,
                }],
                paths: vec![],
                structures: vec![],
                consumed_stroke_ids: vec![999],
            },
        );
        assert!(result.is_err());
        // Rolled back: no bed should have been committed.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM beds", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
