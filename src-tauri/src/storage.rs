use std::path::Path;

use tokio::fs;

use crate::{error::AppError, models::StoredConnectionProfile};

pub async fn load_profiles(path: &Path) -> Result<Vec<StoredConnectionProfile>, AppError> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(path).await?;
    let profiles = serde_json::from_slice::<Vec<StoredConnectionProfile>>(&bytes)?;
    Ok(profiles)
}

pub async fn save_profiles(path: &Path, profiles: &[StoredConnectionProfile]) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let bytes = serde_json::to_vec_pretty(profiles).map_err(|e| AppError::Storage(e.to_string()))?;
    fs::write(path, bytes).await?;
    Ok(())
}
