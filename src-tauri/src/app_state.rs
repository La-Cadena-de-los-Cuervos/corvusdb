use std::{collections::HashMap, path::PathBuf, sync::Arc};

use mongodb::Client;
use tokio::sync::RwLock;

use crate::{
    error::AppError,
    models::{ConnectionProfile, StoredConnectionProfile},
    storage,
};

#[derive(Clone)]
pub struct AppState {
    inner: Arc<InnerState>,
}

struct InnerState {
    profiles_path: PathBuf,
    profiles: RwLock<HashMap<String, ConnectionProfile>>,
    clients: RwLock<HashMap<String, Client>>,
}

impl AppState {
    pub async fn new(profiles_path: PathBuf) -> Result<Self, AppError> {
        let persisted = storage::load_profiles(&profiles_path).await?;
        let mut by_natural_key: HashMap<String, ConnectionProfile> = HashMap::new();
        for profile in persisted.into_iter().map(ConnectionProfile::from) {
            let key = format!(
                "{}|{}|{}",
                profile.name.to_lowercase(),
                profile.host.to_lowercase(),
                profile.port
            );
            by_natural_key.insert(key, profile);
        }
        let profiles = by_natural_key
            .into_values()
            .map(|profile| (profile.id.clone(), profile))
            .collect();

        Ok(Self {
            inner: Arc::new(InnerState {
                profiles_path,
                profiles: RwLock::new(profiles),
                clients: RwLock::new(HashMap::new()),
            }),
        })
    }

    pub async fn list_profiles(&self) -> Vec<ConnectionProfile> {
        self.inner.profiles.read().await.values().cloned().collect()
    }

    pub async fn get_profile(&self, id: &str) -> Option<ConnectionProfile> {
        self.inner.profiles.read().await.get(id).cloned()
    }

    pub async fn upsert_profile(&self, mut profile: ConnectionProfile) -> Result<(), AppError> {
        let profile_id = profile.id.clone();
        let profile_name = profile.name.to_lowercase();
        let profile_host = profile.host.to_lowercase();
        let profile_port = profile.port;

        {
            let mut lock = self.inner.profiles.write().await;

            // If the client edits an existing profile without retyping password,
            // keep the in-memory password for the current process session.
            if profile.password.is_none() {
                if let Some(existing) = lock.get(&profile_id) {
                    profile.password = existing.password.clone();
                } else if let Some(existing) = lock.values().find(|candidate| {
                    candidate.name.eq_ignore_ascii_case(&profile_name)
                        && candidate.host.eq_ignore_ascii_case(&profile_host)
                        && candidate.port == profile_port
                        && candidate.password.is_some()
                }) {
                    profile.password = existing.password.clone();
                }
            }

            lock.retain(|id, candidate| {
                if id == &profile_id {
                    return true;
                }
                // Keep a natural-key uniqueness to avoid duplicate entries
                // when the user repeatedly saves the same connection.
                !(
                    candidate.name.eq_ignore_ascii_case(&profile_name)
                        && candidate.host.eq_ignore_ascii_case(&profile_host)
                        && candidate.port == profile_port
                )
            });
            lock.insert(profile.id.clone(), profile);
        }
        self.inner.clients.write().await.remove(&profile_id);
        self.persist_profiles().await?;
        Ok(())
    }

    pub async fn get_client(&self, connection_id: &str) -> Result<Client, AppError> {
        if let Some(client) = self.inner.clients.read().await.get(connection_id).cloned() {
            return Ok(client);
        }

        let profile = self
            .get_profile(connection_id)
            .await
            .ok_or_else(|| AppError::not_found(format!("connection profile not found: {connection_id}")))?;
        let client = crate::mongodb_service::build_client(&profile).await?;

        let mut clients = self.inner.clients.write().await;
        clients.insert(connection_id.to_string(), client.clone());

        Ok(client)
    }

    async fn persist_profiles(&self) -> Result<(), AppError> {
        let snapshot: Vec<StoredConnectionProfile> = self
            .inner
            .profiles
            .read()
            .await
            .values()
            .map(StoredConnectionProfile::from)
            .collect();
        storage::save_profiles(&self.inner.profiles_path, &snapshot).await
    }
}
