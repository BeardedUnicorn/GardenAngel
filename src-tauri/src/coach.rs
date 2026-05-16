//! Coach conversation + message persistence and observation reads for
//! context assembly (Phase 5). One conversation per project in v0.1
//! (the schema allows more; UI doesn't surface it).

use crate::error::{Result, SerializableError};
use crate::project::ProjectState;
use crate::shapes::GARDEN_ID;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: i64,
    pub garden_id: i64,
    pub started_at: String,
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CoachMessage {
    pub id: i64,
    pub conversation_id: i64,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Observation {
    pub id: i64,
    pub garden_id: i64,
    pub bed_id: Option<i64>,
    pub planting_id: Option<i64>,
    pub body: String,
    pub photo_path: Option<String>,
    pub observed_at: String,
    pub created_at: String,
}

fn row_to_message(row: &Row) -> rusqlite::Result<CoachMessage> {
    Ok(CoachMessage {
        id: row.get("id")?,
        conversation_id: row.get("conversation_id")?,
        role: row.get("role")?,
        content: row.get("content")?,
        model: row.get("model")?,
        created_at: row.get("created_at")?,
    })
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

/// The latest conversation for the garden, creating one if none exist.
pub fn ensure_conversation(conn: &Connection) -> Result<Conversation> {
    let existing = conn
        .query_row(
            "SELECT id, garden_id, started_at, title FROM coach_conversations
             WHERE garden_id = ?1 ORDER BY id DESC LIMIT 1",
            params![GARDEN_ID],
            |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    garden_id: row.get(1)?,
                    started_at: row.get(2)?,
                    title: row.get(3)?,
                })
            },
        )
        .ok();
    if let Some(c) = existing {
        return Ok(c);
    }
    let now = now_iso();
    conn.execute(
        "INSERT INTO coach_conversations (garden_id, started_at, title)
         VALUES (?1, ?2, NULL)",
        params![GARDEN_ID, now],
    )?;
    Ok(Conversation {
        id: conn.last_insert_rowid(),
        garden_id: GARDEN_ID,
        started_at: now,
        title: None,
    })
}

pub fn list_messages(conn: &Connection, conversation_id: i64) -> Result<Vec<CoachMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, model, created_at
         FROM coach_messages WHERE conversation_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![conversation_id], row_to_message)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn add_message(
    conn: &Connection,
    conversation_id: i64,
    role: &str,
    content: &str,
    model: Option<&str>,
) -> Result<CoachMessage> {
    if !matches!(role, "system" | "user" | "assistant") {
        return Err(SerializableError::Other(format!("bad role: {role}")));
    }
    let now = now_iso();
    conn.execute(
        "INSERT INTO coach_messages (conversation_id, role, content, model, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![conversation_id, role, content, model, now],
    )?;
    conn.query_row(
        "SELECT id, conversation_id, role, content, model, created_at
         FROM coach_messages WHERE id = ?1",
        params![conn.last_insert_rowid()],
        row_to_message,
    )
    .map_err(Into::into)
}

pub fn recent_observations(conn: &Connection, limit: i64) -> Result<Vec<Observation>> {
    let mut stmt = conn.prepare(
        "SELECT id, garden_id, bed_id, planting_id, body, photo_path,
                observed_at, created_at
         FROM observations WHERE garden_id = ?1
         ORDER BY observed_at DESC, id DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![GARDEN_ID, limit], row_to_observation)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn bed_observations(conn: &Connection, bed_id: i64) -> Result<Vec<Observation>> {
    let mut stmt = conn.prepare(
        "SELECT id, garden_id, bed_id, planting_id, body, photo_path,
                observed_at, created_at
         FROM observations WHERE garden_id = ?1 AND bed_id = ?2
         ORDER BY observed_at DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![GARDEN_ID, bed_id], row_to_observation)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// =========================================================================
// Tauri commands
// =========================================================================

#[tauri::command]
pub fn coach_conversation_ensure(state: State<'_, ProjectState>) -> Result<Conversation> {
    state.with_db(|conn| ensure_conversation(conn))
}

#[tauri::command]
pub fn coach_messages_list(
    conversation_id: i64,
    state: State<'_, ProjectState>,
) -> Result<Vec<CoachMessage>> {
    state.with_db(|conn| list_messages(conn, conversation_id))
}

#[tauri::command]
pub fn coach_message_add(
    conversation_id: i64,
    role: String,
    content: String,
    model: Option<String>,
    state: State<'_, ProjectState>,
) -> Result<CoachMessage> {
    state.with_db(|conn| add_message(conn, conversation_id, &role, &content, model.as_deref()))
}

#[tauri::command]
pub fn observations_recent(
    limit: i64,
    state: State<'_, ProjectState>,
) -> Result<Vec<Observation>> {
    state.with_db(|conn| recent_observations(conn, limit))
}

#[tauri::command]
pub fn observations_for_bed(
    bed_id: i64,
    state: State<'_, ProjectState>,
) -> Result<Vec<Observation>> {
    state.with_db(|conn| bed_observations(conn, bed_id))
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;

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
    fn ensure_conversation_is_idempotent_per_garden() {
        let conn = fresh_db();
        let c1 = ensure_conversation(&conn).unwrap();
        let c2 = ensure_conversation(&conn).unwrap();
        assert_eq!(c1.id, c2.id);
    }

    #[test]
    fn message_add_list_roundtrip_and_role_guard() {
        let conn = fresh_db();
        let c = ensure_conversation(&conn).unwrap();
        add_message(&conn, c.id, "user", "what grows with tomato?", None).unwrap();
        add_message(&conn, c.id, "assistant", "Basil.", Some("gpt-x")).unwrap();
        let msgs = list_messages(&conn, c.id).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1].model.as_deref(), Some("gpt-x"));
        assert!(add_message(&conn, c.id, "bogus", "x", None).is_err());
    }

    #[test]
    fn recent_observations_orders_newest_first() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO observations (garden_id, body, observed_at, created_at)
             VALUES (1, 'older', '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z'),
                    (1, 'newer', '2026-05-10T00:00:00Z', '2026-05-10T00:00:00Z')",
            [],
        )
        .unwrap();
        let obs = recent_observations(&conn, 5).unwrap();
        assert_eq!(obs.len(), 2);
        assert_eq!(obs[0].body, "newer");
    }
}
