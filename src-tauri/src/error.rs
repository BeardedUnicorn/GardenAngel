use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum SerializableError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Zip error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Keychain error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("No project is currently open")]
    NoProjectOpen,

    #[error("Project file already open at {0}; close it first")]
    ProjectAlreadyOpen(String),

    #[error("Unsupported project file format version: {0}")]
    UnsupportedFormatVersion(u32),

    #[error("Invalid project file: {0}")]
    InvalidProjectFile(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for SerializableError {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, SerializableError>;
