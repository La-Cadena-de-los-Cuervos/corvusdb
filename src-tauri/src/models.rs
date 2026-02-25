use bson::Document;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub tls: bool,
    pub ca_file: Option<String>,
    pub auth_source: Option<String>,
    pub auth_mechanism: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub default_db: Option<String>,
    pub retry_writes: bool,
    pub direct_connection: bool,
    pub tls_allow_invalid_hostnames: bool,
    pub read_preference: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionProfileView {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub tls: bool,
    pub ca_file: Option<String>,
    pub auth_source: Option<String>,
    pub auth_mechanism: Option<String>,
    pub username: Option<String>,
    pub default_db: Option<String>,
    pub retry_writes: bool,
    pub direct_connection: bool,
    pub tls_allow_invalid_hostnames: bool,
    pub read_preference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewConnectionProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    pub tls: Option<bool>,
    pub ca_file: Option<String>,
    pub auth_source: Option<String>,
    pub auth_mechanism: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub default_db: Option<String>,
    pub retry_writes: Option<bool>,
    pub direct_connection: Option<bool>,
    pub tls_allow_invalid_hostnames: Option<bool>,
    pub tunnel_mode: Option<bool>,
    pub read_preference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub tls: bool,
    pub ca_file: Option<String>,
    pub auth_source: Option<String>,
    pub auth_mechanism: Option<String>,
    pub username: Option<String>,
    pub default_db: Option<String>,
    pub retry_writes: bool,
    pub direct_connection: bool,
    #[serde(default)]
    pub tls_allow_invalid_hostnames: bool,
    pub read_preference: Option<String>,
}

impl From<&ConnectionProfile> for StoredConnectionProfile {
    fn from(value: &ConnectionProfile) -> Self {
        Self {
            id: value.id.clone(),
            name: value.name.clone(),
            host: value.host.clone(),
            port: value.port,
            tls: value.tls,
            ca_file: value.ca_file.clone(),
            auth_source: value.auth_source.clone(),
            auth_mechanism: value.auth_mechanism.clone(),
            username: value.username.clone(),
            default_db: value.default_db.clone(),
            retry_writes: value.retry_writes,
            direct_connection: value.direct_connection,
            tls_allow_invalid_hostnames: value.tls_allow_invalid_hostnames,
            read_preference: value.read_preference.clone(),
        }
    }
}

impl From<StoredConnectionProfile> for ConnectionProfile {
    fn from(value: StoredConnectionProfile) -> Self {
        Self {
            id: value.id,
            name: value.name,
            host: value.host,
            port: value.port,
            tls: value.tls,
            ca_file: value.ca_file,
            auth_source: value.auth_source,
            auth_mechanism: value.auth_mechanism,
            username: value.username,
            password: None,
            default_db: value.default_db,
            retry_writes: value.retry_writes,
            direct_connection: value.direct_connection,
            tls_allow_invalid_hostnames: value.tls_allow_invalid_hostnames,
            read_preference: value.read_preference,
        }
    }
}

impl ConnectionProfile {
    pub fn from_input(input: NewConnectionProfileInput) -> Self {
        let tunnel_mode = input.tunnel_mode.unwrap_or(false);
        let direct_connection = if tunnel_mode {
            true
        } else {
            input.direct_connection.unwrap_or(false)
        };
        let tls_allow_invalid_hostnames = if tunnel_mode {
            true
        } else {
            input.tls_allow_invalid_hostnames.unwrap_or(false)
        };

        Self {
            id: input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            name: input.name,
            host: input.host,
            port: input.port.unwrap_or(27017),
            tls: input.tls.unwrap_or(true),
            ca_file: input.ca_file,
            auth_source: input.auth_source,
            auth_mechanism: input.auth_mechanism,
            username: input.username,
            password: input.password,
            default_db: input.default_db,
            retry_writes: input.retry_writes.unwrap_or(false),
            direct_connection,
            tls_allow_invalid_hostnames,
            read_preference: input.read_preference,
        }
    }

    pub fn view(&self) -> ConnectionProfileView {
        ConnectionProfileView {
            id: self.id.clone(),
            name: self.name.clone(),
            host: self.host.clone(),
            port: self.port,
            tls: self.tls,
            ca_file: self.ca_file.clone(),
            auth_source: self.auth_source.clone(),
            auth_mechanism: self.auth_mechanism.clone(),
            username: self.username.clone(),
            default_db: self.default_db.clone(),
            retry_writes: self.retry_writes,
            direct_connection: self.direct_connection,
            tls_allow_invalid_hostnames: self.tls_allow_invalid_hostnames,
            read_preference: self.read_preference.clone(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CollectionsResponse {
    pub database: String,
    pub collections: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct FindRequest {
    pub connection_id: String,
    pub database: String,
    pub collection: String,
    pub filter: Option<Value>,
    pub projection: Option<Value>,
    pub sort: Option<Value>,
    pub limit: Option<i64>,
}

impl FindRequest {
    pub fn parse_document(value: Option<&Value>) -> Result<Document, AppError> {
        match value {
            Some(v) => serde_json::from_value::<Document>(v.clone())
                .map_err(|e| AppError::bad_request(format!("invalid query json: {e}"))),
            None => Ok(Document::new()),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct AggregateRequest {
    pub connection_id: String,
    pub database: String,
    pub collection: String,
    pub pipeline: Value,
    pub limit: Option<i64>,
}

impl AggregateRequest {
    pub fn parse_pipeline(&self) -> Result<Vec<Document>, AppError> {
        let Value::Array(items) = &self.pipeline else {
            return Err(AppError::bad_request(
                "pipeline must be a JSON array".to_string(),
            ));
        };

        let mut out = Vec::with_capacity(items.len());
        for stage in items {
            out.push(
                serde_json::from_value::<Document>(stage.clone())
                    .map_err(|e| AppError::bad_request(format!("invalid pipeline stage: {e}")))?,
            );
        }
        Ok(out)
    }
}

#[derive(Debug, Deserialize)]
pub struct InsertRequest {
    pub connection_id: String,
    pub database: String,
    pub collection: String,
    pub document: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRequest {
    pub connection_id: String,
    pub database: String,
    pub collection: String,
    pub filter: Value,
    pub update: Value,
    pub many: Option<bool>,
    pub upsert: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteRequest {
    pub connection_id: String,
    pub database: String,
    pub collection: String,
    pub filter: Value,
    pub many: Option<bool>,
}
