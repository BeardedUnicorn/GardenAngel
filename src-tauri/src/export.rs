//! PDF export write (Phase 7). The PDF is built in the renderer with
//! jsPDF; writing bytes to a user-chosen path is a filesystem op, so it
//! lives in Rust like every other file write (consistent with ADR-002).

use crate::error::Result;
use std::fs;
use std::io::Write;
use std::path::Path;

#[tauri::command]
pub fn pdf_save(path: String, bytes: Vec<u8>) -> Result<()> {
    let dest = Path::new(&path);
    let parent = dest.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    // tmp + rename so a crash mid-write can't leave a truncated PDF.
    let tmp = parent.join(format!(
        ".{}.tmp",
        dest.file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "export.pdf".to_string())
    ));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, dest)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_save_writes_bytes_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("plan.pdf");
        pdf_save(dest.to_string_lossy().to_string(), b"%PDF-1.7 fake".to_vec()).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"%PDF-1.7 fake");
        // No leftover tmp.
        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty());
    }
}
