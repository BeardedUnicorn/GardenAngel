//! Per-project key/value settings (the `settings` table). Non-secret
//! config only — API base URL, model name, coach voice. The API key
//! itself lives in the Keychain (see `secret.rs`).

use crate::error::Result;
use crate::project::ProjectState;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use tauri::State;

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn all_settings(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// =========================================================================
// Tauri commands
// =========================================================================

#[tauri::command]
pub fn settings_get_all(state: State<'_, ProjectState>) -> Result<HashMap<String, String>> {
    state.with_db(|conn| all_settings(conn))
}

#[tauri::command]
pub fn setting_get(
    key: String,
    state: State<'_, ProjectState>,
) -> Result<Option<String>> {
    state.with_db(|conn| get_setting(conn, &key))
}

#[tauri::command]
pub fn setting_set(
    key: String,
    value: String,
    state: State<'_, ProjectState>,
) -> Result<()> {
    state.with_db(|conn| set_setting(conn, &key, &value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_migrations;

    fn fresh_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        conn
    }

    #[test]
    fn upsert_and_read_back() {
        let conn = fresh_db();
        assert_eq!(get_setting(&conn, "model").unwrap(), None);
        set_setting(&conn, "model", "gpt-4o-mini").unwrap();
        set_setting(&conn, "base_url", "https://api.openai.com/v1").unwrap();
        set_setting(&conn, "model", "gpt-4o").unwrap(); // overwrite
        assert_eq!(get_setting(&conn, "model").unwrap().as_deref(), Some("gpt-4o"));
        let all = all_settings(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.get("base_url").map(String::as_str), Some("https://api.openai.com/v1"));
    }
}
