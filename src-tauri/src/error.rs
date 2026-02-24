use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("mongodb error: {0}")]
    Mongo(String),
    #[error("storage error: {0}")]
    Storage(String),
}

impl AppError {
    pub fn not_found(msg: String) -> Self {
        Self::NotFound(msg)
    }

    pub fn bad_request(msg: String) -> Self {
        Self::BadRequest(msg)
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(value: mongodb::error::Error) -> Self {
        Self::Mongo(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::BadRequest(format!("invalid json: {value}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Storage(value.to_string())
    }
}
