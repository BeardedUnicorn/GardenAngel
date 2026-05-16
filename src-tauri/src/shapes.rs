use crate::error::{Result, SerializableError};
use crate::project::ProjectState;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

const GARDEN_ID: i64 = 1;

// =========================================================================
// Common helpers
// =========================================================================

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// =========================================================================
// Bed
// =========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bed {
    pub id: i64,
    pub garden_id: i64,
    pub name: Option<String>,
    pub shape_type: String,
    pub geometry: serde_json::Value,
    pub soil_notes: Option<String>,
    pub sun_exposure: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct BedInput {
    pub name: Option<String>,
    pub shape_type: String,
    pub geometry: serde_json::Value,
    pub soil_notes: Option<String>,
    pub sun_exposure: Option<String>,
}

fn row_to_bed(row: &Row) -> rusqlite::Result<Bed> {
    let geometry_json: String = row.get("geometry_json")?;
    let geometry: serde_json::Value =
        serde_json::from_str(&geometry_json).unwrap_or(serde_json::Value::Null);
    Ok(Bed {
        id: row.get("id")?,
        garden_id: row.get("garden_id")?,
        name: row.get("name")?,
        shape_type: row.get("shape_type")?,
        geometry,
        soil_notes: row.get("soil_notes")?,
        sun_exposure: row.get("sun_exposure")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list_beds(conn: &Connection) -> Result<Vec<Bed>> {
    let mut stmt = conn.prepare(
        "SELECT id, garden_id, name, shape_type, geometry_json, soil_notes, sun_exposure,
                created_at, updated_at
         FROM beds WHERE garden_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![GARDEN_ID], row_to_bed)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn insert_bed(conn: &Connection, input: &BedInput) -> Result<Bed> {
    let now = now_iso();
    let geometry_json = serde_json::to_string(&input.geometry)?;
    conn.execute(
        "INSERT INTO beds (garden_id, name, shape_type, geometry_json, soil_notes,
                           sun_exposure, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![
            GARDEN_ID,
            input.name,
            input.shape_type,
            geometry_json,
            input.soil_notes,
            input.sun_exposure,
            now
        ],
    )?;
    let id = conn.last_insert_rowid();
    get_bed(conn, id)
}

pub fn update_bed(conn: &Connection, id: i64, input: &BedInput) -> Result<Bed> {
    let now = now_iso();
    let geometry_json = serde_json::to_string(&input.geometry)?;
    let rows = conn.execute(
        "UPDATE beds
         SET name = ?2, shape_type = ?3, geometry_json = ?4, soil_notes = ?5,
             sun_exposure = ?6, updated_at = ?7
         WHERE id = ?1",
        params![
            id,
            input.name,
            input.shape_type,
            geometry_json,
            input.soil_notes,
            input.sun_exposure,
            now
        ],
    )?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("bed {id} not found")));
    }
    get_bed(conn, id)
}

pub fn delete_bed(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute("DELETE FROM beds WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("bed {id} not found")));
    }
    Ok(())
}

fn get_bed(conn: &Connection, id: i64) -> Result<Bed> {
    let bed = conn.query_row(
        "SELECT id, garden_id, name, shape_type, geometry_json, soil_notes, sun_exposure,
                created_at, updated_at
         FROM beds WHERE id = ?1",
        params![id],
        row_to_bed,
    )?;
    Ok(bed)
}

// =========================================================================
// Path
// =========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PathShape {
    pub id: i64,
    pub garden_id: i64,
    pub name: Option<String>,
    pub points: Vec<[f64; 2]>,
    pub width: f64,
    pub material: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PathInput {
    pub name: Option<String>,
    pub points: Vec<[f64; 2]>,
    pub width: f64,
    pub material: Option<String>,
}

fn row_to_path(row: &Row) -> rusqlite::Result<PathShape> {
    let points_json: String = row.get("points_json")?;
    let points: Vec<[f64; 2]> = serde_json::from_str(&points_json).unwrap_or_default();
    Ok(PathShape {
        id: row.get("id")?,
        garden_id: row.get("garden_id")?,
        name: row.get("name")?,
        points,
        width: row.get("width")?,
        material: row.get("material")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list_paths(conn: &Connection) -> Result<Vec<PathShape>> {
    let mut stmt = conn.prepare(
        "SELECT id, garden_id, name, points_json, width, material, created_at, updated_at
         FROM paths WHERE garden_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![GARDEN_ID], row_to_path)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn insert_path(conn: &Connection, input: &PathInput) -> Result<PathShape> {
    let now = now_iso();
    let points_json = serde_json::to_string(&input.points)?;
    conn.execute(
        "INSERT INTO paths (garden_id, name, points_json, width, material, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            GARDEN_ID,
            input.name,
            points_json,
            input.width,
            input.material,
            now
        ],
    )?;
    let id = conn.last_insert_rowid();
    get_path(conn, id)
}

pub fn update_path(conn: &Connection, id: i64, input: &PathInput) -> Result<PathShape> {
    let now = now_iso();
    let points_json = serde_json::to_string(&input.points)?;
    let rows = conn.execute(
        "UPDATE paths SET name = ?2, points_json = ?3, width = ?4, material = ?5, updated_at = ?6
         WHERE id = ?1",
        params![id, input.name, points_json, input.width, input.material, now],
    )?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("path {id} not found")));
    }
    get_path(conn, id)
}

pub fn delete_path(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute("DELETE FROM paths WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("path {id} not found")));
    }
    Ok(())
}

fn get_path(conn: &Connection, id: i64) -> Result<PathShape> {
    let path = conn.query_row(
        "SELECT id, garden_id, name, points_json, width, material, created_at, updated_at
         FROM paths WHERE id = ?1",
        params![id],
        row_to_path,
    )?;
    Ok(path)
}

// =========================================================================
// Structure
// =========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Structure {
    pub id: i64,
    pub garden_id: i64,
    pub name: Option<String>,
    pub kind: String,
    pub geometry: serde_json::Value,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct StructureInput {
    pub name: Option<String>,
    pub kind: String,
    pub geometry: serde_json::Value,
    pub notes: Option<String>,
}

fn row_to_structure(row: &Row) -> rusqlite::Result<Structure> {
    let geometry_json: String = row.get("geometry_json")?;
    let geometry: serde_json::Value =
        serde_json::from_str(&geometry_json).unwrap_or(serde_json::Value::Null);
    Ok(Structure {
        id: row.get("id")?,
        garden_id: row.get("garden_id")?,
        name: row.get("name")?,
        kind: row.get("kind")?,
        geometry,
        notes: row.get("notes")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list_structures(conn: &Connection) -> Result<Vec<Structure>> {
    let mut stmt = conn.prepare(
        "SELECT id, garden_id, name, kind, geometry_json, notes, created_at, updated_at
         FROM structures WHERE garden_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![GARDEN_ID], row_to_structure)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn insert_structure(conn: &Connection, input: &StructureInput) -> Result<Structure> {
    let now = now_iso();
    let geometry_json = serde_json::to_string(&input.geometry)?;
    conn.execute(
        "INSERT INTO structures (garden_id, name, kind, geometry_json, notes,
                                 created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            GARDEN_ID,
            input.name,
            input.kind,
            geometry_json,
            input.notes,
            now
        ],
    )?;
    let id = conn.last_insert_rowid();
    get_structure(conn, id)
}

pub fn update_structure(conn: &Connection, id: i64, input: &StructureInput) -> Result<Structure> {
    let now = now_iso();
    let geometry_json = serde_json::to_string(&input.geometry)?;
    let rows = conn.execute(
        "UPDATE structures
         SET name = ?2, kind = ?3, geometry_json = ?4, notes = ?5, updated_at = ?6
         WHERE id = ?1",
        params![id, input.name, input.kind, geometry_json, input.notes, now],
    )?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("structure {id} not found")));
    }
    get_structure(conn, id)
}

pub fn delete_structure(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute("DELETE FROM structures WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("structure {id} not found")));
    }
    Ok(())
}

fn get_structure(conn: &Connection, id: i64) -> Result<Structure> {
    let structure = conn.query_row(
        "SELECT id, garden_id, name, kind, geometry_json, notes, created_at, updated_at
         FROM structures WHERE id = ?1",
        params![id],
        row_to_structure,
    )?;
    Ok(structure)
}

// =========================================================================
// Unified list (for project hydration)
// =========================================================================

#[derive(Debug, Serialize)]
pub struct ShapesSnapshot {
    pub beds: Vec<Bed>,
    pub paths: Vec<PathShape>,
    pub structures: Vec<Structure>,
}

// =========================================================================
// Tauri commands
// =========================================================================

#[tauri::command]
pub fn shapes_list(state: State<'_, ProjectState>) -> Result<ShapesSnapshot> {
    state.with_db(|conn| {
        Ok(ShapesSnapshot {
            beds: list_beds(conn)?,
            paths: list_paths(conn)?,
            structures: list_structures(conn)?,
        })
    })
}

#[tauri::command]
pub fn bed_create(input: BedInput, state: State<'_, ProjectState>) -> Result<Bed> {
    state.with_db(|conn| insert_bed(conn, &input))
}

#[tauri::command]
pub fn bed_update(id: i64, input: BedInput, state: State<'_, ProjectState>) -> Result<Bed> {
    state.with_db(|conn| update_bed(conn, id, &input))
}

#[tauri::command]
pub fn bed_delete(id: i64, state: State<'_, ProjectState>) -> Result<()> {
    state.with_db(|conn| delete_bed(conn, id))
}

#[tauri::command]
pub fn path_create(input: PathInput, state: State<'_, ProjectState>) -> Result<PathShape> {
    state.with_db(|conn| insert_path(conn, &input))
}

#[tauri::command]
pub fn path_update(id: i64, input: PathInput, state: State<'_, ProjectState>) -> Result<PathShape> {
    state.with_db(|conn| update_path(conn, id, &input))
}

#[tauri::command]
pub fn path_delete(id: i64, state: State<'_, ProjectState>) -> Result<()> {
    state.with_db(|conn| delete_path(conn, id))
}

#[tauri::command]
pub fn structure_create(
    input: StructureInput,
    state: State<'_, ProjectState>,
) -> Result<Structure> {
    state.with_db(|conn| insert_structure(conn, &input))
}

#[tauri::command]
pub fn structure_update(
    id: i64,
    input: StructureInput,
    state: State<'_, ProjectState>,
) -> Result<Structure> {
    state.with_db(|conn| update_structure(conn, id, &input))
}

#[tauri::command]
pub fn structure_delete(id: i64, state: State<'_, ProjectState>) -> Result<()> {
    state.with_db(|conn| delete_structure(conn, id))
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;
    use rusqlite::Connection;
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
    fn bed_crud_roundtrip() {
        let conn = fresh_db();
        let bed = insert_bed(
            &conn,
            &BedInput {
                name: Some("salsa bed".into()),
                shape_type: "rect".into(),
                geometry: json!({ "x": 10.0, "y": 20.0, "width": 50.0, "height": 30.0 }),
                soil_notes: None,
                sun_exposure: Some("full".into()),
            },
        )
        .unwrap();
        assert_eq!(bed.id, 1);
        assert_eq!(bed.name.as_deref(), Some("salsa bed"));

        let listed = list_beds(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].geometry["x"].as_f64(), Some(10.0));

        let updated = update_bed(
            &conn,
            bed.id,
            &BedInput {
                name: Some("salsa bed v2".into()),
                shape_type: "rect".into(),
                geometry: json!({ "x": 11.0, "y": 21.0, "width": 51.0, "height": 31.0 }),
                soil_notes: Some("compost".into()),
                sun_exposure: Some("partial".into()),
            },
        )
        .unwrap();
        assert_eq!(updated.name.as_deref(), Some("salsa bed v2"));
        assert_eq!(updated.soil_notes.as_deref(), Some("compost"));

        delete_bed(&conn, bed.id).unwrap();
        assert!(list_beds(&conn).unwrap().is_empty());
    }

    #[test]
    fn path_crud_roundtrip() {
        let conn = fresh_db();
        let path = insert_path(
            &conn,
            &PathInput {
                name: Some("main path".into()),
                points: vec![[0.0, 0.0], [10.0, 10.0], [20.0, 5.0]],
                width: 24.0,
                material: Some("mulch".into()),
            },
        )
        .unwrap();
        assert_eq!(path.points.len(), 3);
        assert_eq!(path.points[2], [20.0, 5.0]);
        assert_eq!(path.width, 24.0);

        let listed = list_paths(&conn).unwrap();
        assert_eq!(listed.len(), 1);
    }

    #[test]
    fn structure_crud_roundtrip() {
        let conn = fresh_db();
        let structure = insert_structure(
            &conn,
            &StructureInput {
                name: Some("shed".into()),
                kind: "shed".into(),
                geometry: json!({ "x": 100.0, "y": 100.0, "width": 80.0, "height": 60.0 }),
                notes: None,
            },
        )
        .unwrap();
        assert_eq!(structure.kind, "shed");
        assert_eq!(structure.geometry["width"].as_f64(), Some(80.0));
    }

    #[test]
    fn update_nonexistent_errors() {
        let conn = fresh_db();
        let result = update_bed(
            &conn,
            999,
            &BedInput {
                name: None,
                shape_type: "rect".into(),
                geometry: json!({}),
                soil_notes: None,
                sun_exposure: None,
            },
        );
        assert!(result.is_err());
    }
}
