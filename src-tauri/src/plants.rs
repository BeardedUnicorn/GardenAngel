//! Plant cache + plantings (Phase 4).
//!
//! `plant_cache` is a write-through store: the frontend cache wrapper
//! reads here first and only hits the network on a miss, writing the
//! normalized record back. Plantings pair a cached plant with a bed.

use crate::error::{Result, SerializableError};
use crate::project::ProjectState;
use crate::shapes::GARDEN_ID;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// =========================================================================
// Plant cache
// =========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedPlant {
    pub external_id: String,
    pub provider: String,
    pub common_name: String,
    pub scientific_name: Option<String>,
    pub data_json: serde_json::Value,
    pub fetched_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CachedPlantInput {
    pub external_id: String,
    pub provider: String,
    pub common_name: String,
    pub scientific_name: Option<String>,
    pub data_json: serde_json::Value,
}

fn row_to_cached(row: &Row) -> rusqlite::Result<CachedPlant> {
    let data_json: String = row.get("data_json")?;
    Ok(CachedPlant {
        external_id: row.get("external_id")?,
        provider: row.get("provider")?,
        common_name: row.get("common_name")?,
        scientific_name: row.get("scientific_name")?,
        data_json: serde_json::from_str(&data_json).unwrap_or(serde_json::Value::Null),
        fetched_at: row.get("fetched_at")?,
    })
}

pub fn cache_get(conn: &Connection, external_id: &str) -> Result<Option<CachedPlant>> {
    let mut stmt = conn.prepare(
        "SELECT external_id, provider, common_name, scientific_name, data_json, fetched_at
         FROM plant_cache WHERE external_id = ?1",
    )?;
    let mut rows = stmt.query(params![external_id])?;
    match rows.next()? {
        Some(row) => Ok(Some(row_to_cached(row)?)),
        None => Ok(None),
    }
}

pub fn cache_put(conn: &Connection, input: &CachedPlantInput) -> Result<CachedPlant> {
    let now = now_iso();
    let data_json = serde_json::to_string(&input.data_json)?;
    conn.execute(
        "INSERT INTO plant_cache
            (external_id, provider, common_name, scientific_name, data_json, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(external_id) DO UPDATE SET
            provider = excluded.provider,
            common_name = excluded.common_name,
            scientific_name = excluded.scientific_name,
            data_json = excluded.data_json,
            fetched_at = excluded.fetched_at",
        params![
            input.external_id,
            input.provider,
            input.common_name,
            input.scientific_name,
            data_json,
            now
        ],
    )?;
    cache_get(conn, &input.external_id)?
        .ok_or_else(|| SerializableError::Other("plant_cache put failed".into()))
}

// =========================================================================
// Plantings
// =========================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Planting {
    pub id: i64,
    pub bed_id: i64,
    pub plant_id: String,
    pub planted_at: Option<String>,
    pub harvested_at: Option<String>,
    pub quantity: Option<i64>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PlantingInput {
    pub bed_id: i64,
    pub plant_id: String,
    pub quantity: Option<i64>,
    pub notes: Option<String>,
}

fn row_to_planting(row: &Row) -> rusqlite::Result<Planting> {
    Ok(Planting {
        id: row.get("id")?,
        bed_id: row.get("bed_id")?,
        plant_id: row.get("plant_id")?,
        planted_at: row.get("planted_at")?,
        harvested_at: row.get("harvested_at")?,
        quantity: row.get("quantity")?,
        status: row.get("status")?,
        notes: row.get("notes")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn list_plantings(conn: &Connection, bed_id: i64) -> Result<Vec<Planting>> {
    let mut stmt = conn.prepare(
        "SELECT id, bed_id, plant_id, planted_at, harvested_at, quantity, status,
                notes, created_at, updated_at
         FROM plantings WHERE bed_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![bed_id], row_to_planting)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn insert_planting(conn: &Connection, input: &PlantingInput) -> Result<Planting> {
    // Guard the bed exists in this garden — plantings have no UI for an
    // orphaned bed and FKs aren't enforced (see ARCHITECTURE).
    let bed_ok: bool = conn
        .query_row(
            "SELECT 1 FROM beds WHERE id = ?1 AND garden_id = ?2",
            params![input.bed_id, GARDEN_ID],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !bed_ok {
        return Err(SerializableError::Other(format!(
            "bed {} not found",
            input.bed_id
        )));
    }
    let now = now_iso();
    conn.execute(
        "INSERT INTO plantings
            (bed_id, plant_id, quantity, status, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'planned', ?4, ?5, ?5)",
        params![
            input.bed_id,
            input.plant_id,
            input.quantity,
            input.notes,
            now
        ],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, bed_id, plant_id, planted_at, harvested_at, quantity, status,
                notes, created_at, updated_at
         FROM plantings WHERE id = ?1",
        params![id],
        row_to_planting,
    )
    .map_err(Into::into)
}

pub fn delete_planting(conn: &Connection, id: i64) -> Result<()> {
    let rows = conn.execute("DELETE FROM plantings WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(SerializableError::Other(format!("planting {id} not found")));
    }
    Ok(())
}

// =========================================================================
// Tauri commands
// =========================================================================

#[tauri::command]
pub fn plant_cache_get(
    external_id: String,
    state: State<'_, ProjectState>,
) -> Result<Option<CachedPlant>> {
    state.with_db(|conn| cache_get(conn, &external_id))
}

#[tauri::command]
pub fn plant_cache_put(
    input: CachedPlantInput,
    state: State<'_, ProjectState>,
) -> Result<CachedPlant> {
    state.with_db(|conn| cache_put(conn, &input))
}

#[tauri::command]
pub fn plantings_list(bed_id: i64, state: State<'_, ProjectState>) -> Result<Vec<Planting>> {
    state.with_db(|conn| list_plantings(conn, bed_id))
}

#[tauri::command]
pub fn planting_create(
    input: PlantingInput,
    state: State<'_, ProjectState>,
) -> Result<Planting> {
    state.with_db(|conn| insert_planting(conn, &input))
}

#[tauri::command]
pub fn planting_delete(id: i64, state: State<'_, ProjectState>) -> Result<()> {
    state.with_db(|conn| delete_planting(conn, id))
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
        conn.execute(
            "INSERT INTO beds (id, garden_id, name, shape_type, geometry_json,
                               created_at, updated_at)
             VALUES (1, 1, 'salsa', 'rect', '{}', '2026-01-01T00:00:00Z',
                     '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn cache_put_is_upsert_and_readback_roundtrips_json() {
        let conn = fresh_db();
        assert!(cache_get(&conn, "pp:101").unwrap().is_none());

        let rec = cache_put(
            &conn,
            &CachedPlantInput {
                external_id: "pp:101".into(),
                provider: "permapeople".into(),
                common_name: "Tomato".into(),
                scientific_name: Some("Solanum lycopersicum".into()),
                data_json: json!({ "companions": ["basil"], "family": "Solanaceae" }),
            },
        )
        .unwrap();
        assert_eq!(rec.common_name, "Tomato");
        assert_eq!(rec.data_json["companions"][0], "basil");

        // Upsert: same id, new data overwrites.
        let rec2 = cache_put(
            &conn,
            &CachedPlantInput {
                external_id: "pp:101".into(),
                provider: "permapeople".into(),
                common_name: "Tomato (cherry)".into(),
                scientific_name: None,
                data_json: json!({ "companions": ["basil", "marigold"] }),
            },
        )
        .unwrap();
        assert_eq!(rec2.common_name, "Tomato (cherry)");
        assert_eq!(
            cache_get(&conn, "pp:101").unwrap().unwrap().data_json["companions"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn planting_create_list_delete_roundtrip() {
        let conn = fresh_db();
        let p = insert_planting(
            &conn,
            &PlantingInput {
                bed_id: 1,
                plant_id: "pp:101".into(),
                quantity: Some(3),
                notes: Some("south corner".into()),
            },
        )
        .unwrap();
        assert_eq!(p.status, "planned");
        assert_eq!(p.quantity, Some(3));

        let listed = list_plantings(&conn, 1).unwrap();
        assert_eq!(listed.len(), 1);

        delete_planting(&conn, p.id).unwrap();
        assert!(list_plantings(&conn, 1).unwrap().is_empty());
    }

    #[test]
    fn planting_on_missing_bed_errors() {
        let conn = fresh_db();
        let r = insert_planting(
            &conn,
            &PlantingInput {
                bed_id: 999,
                plant_id: "pp:1".into(),
                quantity: None,
                notes: None,
            },
        );
        assert!(r.is_err());
    }
}
