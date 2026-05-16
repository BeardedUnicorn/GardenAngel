//! OS-keychain-backed secret storage (ADR-001). The coach API key never
//! touches the project file or logs — it lives in the macOS Keychain under
//! service `com.mike.gardenangel`, keyed by a caller-supplied account
//! string (e.g. "coach-api-key").

use crate::error::Result;
use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "com.mike.gardenangel";

fn entry(account: &str) -> Result<Entry> {
    Ok(Entry::new(SERVICE, account)?)
}

pub fn set(account: &str, value: &str) -> Result<()> {
    entry(account)?.set_password(value)?;
    Ok(())
}

pub fn get(account: &str) -> Result<Option<String>> {
    match entry(account)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete(account: &str) -> Result<()> {
    match entry(account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

// =========================================================================
// Tauri commands
// =========================================================================

#[tauri::command]
pub fn secret_set(account: String, value: String) -> Result<()> {
    set(&account, &value)
}

/// Returns whether a secret exists, not the value — the renderer never
/// needs the raw key (it's attached to requests in the adapter layer).
#[tauri::command]
pub fn secret_has(account: String) -> Result<bool> {
    Ok(get(&account)?.is_some())
}

#[tauri::command]
pub fn secret_get(account: String) -> Result<Option<String>> {
    get(&account)
}

#[tauri::command]
pub fn secret_delete(account: String) -> Result<()> {
    delete(&account)
}

// =========================================================================
// Tests (mock keyring backend — never touches the real Keychain)
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Once;

    static INIT: Once = Once::new();

    fn use_mock() {
        INIT.call_once(|| {
            keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
        });
    }

    // NOTE: keyring's mock backend stores the secret on the `Entry`
    // instance, not in a shared store, and our helpers open a fresh
    // `Entry` per call (matching real Keychain semantics). So a
    // cross-call set->get roundtrip can't be asserted against the mock;
    // that path is verified manually against the real Keychain. These
    // tests pin the plumbing and the NoEntry -> None / idempotent-delete
    // contracts the command layer depends on.

    #[test]
    fn get_missing_is_none() {
        use_mock();
        assert_eq!(get("never-set-account").unwrap(), None);
    }

    #[test]
    fn set_and_delete_do_not_error() {
        use_mock();
        let acct = "test-plumbing";
        set(acct, "sk-123").unwrap();
        // Deleting a never-stored (mock) credential must be idempotent.
        delete(acct).unwrap();
        delete(acct).unwrap();
    }
}
