use crate::error::Result;
use rusqlite::{params, Connection};

const MIGRATIONS: &[(u32, &str, &str)] = &[
    (1, "0001_init", include_str!("../migrations/0001_init.sql")),
    (
        2,
        "0002_sketch_consumed",
        include_str!("../migrations/0002_sketch_consumed.sql"),
    ),
    (
        3,
        "0003_path_color",
        include_str!("../migrations/0003_path_color.sql"),
    ),
];

pub fn apply_migrations(conn: &mut Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;

    let applied: std::collections::HashSet<u32> = {
        let mut stmt = conn.prepare("SELECT version FROM _migrations")?;
        let rows = stmt.query_map([], |row| row.get::<_, u32>(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    for (version, name, sql) in MIGRATIONS {
        if applied.contains(version) {
            continue;
        }
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO _migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
            params![version, name, chrono::Utc::now().to_rfc3339()],
        )?;
        tx.commit()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_initial_migration() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        for expected in [
            "_migrations",
            "beds",
            "coach_conversations",
            "coach_messages",
            "gardens",
            "observations",
            "paths",
            "plant_cache",
            "plantings",
            "settings",
            "sketch_strokes",
            "structures",
        ] {
            assert!(
                tables.iter().any(|t| t == expected),
                "missing table: {expected}"
            );
        }
    }

    #[test]
    fn migration_0002_adds_consumed_at() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();

        let cols: Vec<String> = conn
            .prepare("PRAGMA table_info(sketch_strokes)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(
            cols.iter().any(|c| c == "consumed_at"),
            "sketch_strokes missing consumed_at column: {cols:?}"
        );

        let path_cols: Vec<String> = conn
            .prepare("PRAGMA table_info(paths)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(
            path_cols.iter().any(|c| c == "color"),
            "paths missing color column (migration 0003): {path_cols:?}"
        );

        let applied: Vec<u32> = conn
            .prepare("SELECT version FROM _migrations ORDER BY version")
            .unwrap()
            .query_map([], |row| row.get::<_, u32>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(applied, vec![1, 2, 3]);
    }

    #[test]
    fn migrations_are_idempotent() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_migrations(&mut conn).unwrap();
        apply_migrations(&mut conn).unwrap();

        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM _migrations WHERE version = 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }
}
