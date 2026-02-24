use bson::{Bson, Document, doc};
use mongodb::{Client, options::{ClientOptions, FindOptions}};
use percent_encoding::{AsciiSet, CONTROLS, utf8_percent_encode};
use serde_json::Value;

use crate::{error::AppError, models::ConnectionProfile};

const USERINFO_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}')
    .add(b'/')
    .add(b':');
const QUERY_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'&')
    .add(b'+')
    .add(b'=')
    .add(b'?');

pub fn build_uri(profile: &ConnectionProfile) -> String {
    let mut uri = String::from("mongodb://");

    if let (Some(username), Some(password)) = (&profile.username, &profile.password) {
        let encoded_user = utf8_percent_encode(username, USERINFO_ENCODE_SET).to_string();
        let encoded_pass = utf8_percent_encode(password, USERINFO_ENCODE_SET).to_string();
        uri.push_str(&format!("{encoded_user}:{encoded_pass}@"));
    }

    uri.push_str(&format!("{}:{}", profile.host, profile.port));

    let force_local_tunnel_tls_relax = profile.tls && is_local_host(&profile.host);
    let force_tls_insecure = force_local_tunnel_tls_relax;

    let mut params = vec![format!("retryWrites={}", profile.retry_writes)];
    params.push(format!("directConnection={}", profile.direct_connection));
    if force_tls_insecure {
        params.push("tlsInsecure=true".to_string());
    }

    if profile.tls {
        params.push("tls=true".to_string());
    }
    if let Some(ca_file) = &profile.ca_file {
        let encoded = utf8_percent_encode(ca_file, QUERY_ENCODE_SET).to_string();
        params.push(format!("tlsCAFile={encoded}"));
    }
    if let Some(auth_source) = &profile.auth_source {
        let encoded = utf8_percent_encode(auth_source, QUERY_ENCODE_SET).to_string();
        params.push(format!("authSource={encoded}"));
    }
    if let Some(auth_mechanism) = &profile.auth_mechanism {
        let encoded = utf8_percent_encode(auth_mechanism, QUERY_ENCODE_SET).to_string();
        params.push(format!("authMechanism={encoded}"));
    }
    if let Some(read_preference) = &profile.read_preference {
        let encoded = utf8_percent_encode(read_preference, QUERY_ENCODE_SET).to_string();
        params.push(format!("readPreference={encoded}"));
    }

    uri.push('?');
    uri.push_str(&params.join("&"));
    uri
}

fn is_local_host(host: &str) -> bool {
    matches!(host.trim().to_ascii_lowercase().as_str(), "localhost" | "127.0.0.1" | "::1")
}

fn map_mongo_op_error(
    err: mongodb::error::Error,
    operation: &str,
    database: Option<&str>,
    collection: Option<&str>,
) -> AppError {
    let raw = err.to_string();
    let lower = raw.to_lowercase();
    if lower.contains("error code 13") || lower.contains("authorization failure") {
        let target = match (database, collection) {
            (Some(db), Some(coll)) => format!("{db}.{coll}"),
            (Some(db), None) => db.to_string(),
            _ => "target resource".to_string(),
        };
        return AppError::bad_request(format!(
            "Authorization failure during {operation} on {target}. Verify authSource and that this user has at least read/readWrite role on that database/collection."
        ));
    }
    AppError::from(err)
}

pub async fn build_client(profile: &ConnectionProfile) -> Result<Client, AppError> {
    let uri = build_uri(profile);
    let options = ClientOptions::parse(uri).await?;
    Client::with_options(options).map_err(AppError::from)
}

pub async fn test_connection(client: &Client) -> Result<(), AppError> {
    client
        .database("admin")
        .run_command(doc! { "ping": 1i32 })
        .await
        .map(|_| ())
        .map_err(|err| map_mongo_op_error(err, "ping", Some("admin"), None))
}

pub async fn list_collection_names(client: &Client, database: &str) -> Result<Vec<String>, AppError> {
    let db = client.database(database);
    match db.list_collection_names().await {
        Ok(names) => Ok(names),
        Err(primary_err) => {
            // Fallback for restricted users: ask only for authorized collection names.
            let fallback = db
                .run_command(doc! {
                    "listCollections": 1i32,
                    "nameOnly": true,
                    "authorizedCollections": true
                })
                .await;

            match fallback {
                Ok(doc) => Ok(parse_collection_names_from_list_collections(doc)),
                Err(_) => {
                    Err(map_mongo_op_error(
                        primary_err,
                        "list collections",
                        Some(database),
                        None,
                    ))
                }
            }
        }
    }
}

fn parse_collection_names_from_list_collections(doc: Document) -> Vec<String> {
    let mut names = Vec::new();
    if let Some(Bson::Document(cursor)) = doc.get("cursor")
        && let Some(Bson::Array(batch)) = cursor.get("firstBatch")
    {
        for item in batch {
            if let Bson::Document(entry) = item
                && let Some(Bson::String(name)) = entry.get("name")
            {
                names.push(name.clone());
            }
        }
    }
    names
}

pub async fn find_documents(
    client: &Client,
    database: &str,
    collection: &str,
    filter: Document,
    projection: Document,
    sort: Document,
    limit: i64,
) -> Result<Vec<Value>, AppError> {
    let options = FindOptions::builder()
        .projection(if projection.is_empty() {
            None
        } else {
            Some(projection)
        })
        .sort(if sort.is_empty() { None } else { Some(sort) })
        .limit(Some(limit))
        .build();

    let mut cursor = client
        .database(database)
        .collection::<Document>(collection)
        .find(filter)
        .with_options(options)
        .await
        .map_err(|err| map_mongo_op_error(err, "find", Some(database), Some(collection)))?;

    let mut out = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|err| map_mongo_op_error(err, "find", Some(database), Some(collection)))?
    {
        let doc = cursor.deserialize_current()?;
        let bson_value = Bson::Document(doc);
        let json_value = bson_value.into_relaxed_extjson();
        out.push(json_value);
    }
    Ok(out)
}

pub async fn aggregate_documents(
    client: &Client,
    database: &str,
    collection: &str,
    mut pipeline: Vec<Document>,
    limit: i64,
) -> Result<Vec<Value>, AppError> {
    if limit > 0 {
        pipeline.push(doc! { "$limit": limit });
    }
    let mut cursor = client
        .database(database)
        .collection::<Document>(collection)
        .aggregate(pipeline)
        .await
        .map_err(|err| map_mongo_op_error(err, "aggregate", Some(database), Some(collection)))?;

    let mut out = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|err| map_mongo_op_error(err, "aggregate", Some(database), Some(collection)))?
    {
        let doc = cursor.deserialize_current()?;
        out.push(Bson::Document(doc).into_relaxed_extjson());
    }
    Ok(out)
}

pub async fn insert_document(
    client: &Client,
    database: &str,
    collection: &str,
    document: Document,
) -> Result<Value, AppError> {
    let result = client
        .database(database)
        .collection::<Document>(collection)
        .insert_one(document)
        .await
        .map_err(|err| map_mongo_op_error(err, "insert", Some(database), Some(collection)))?;
    Ok(result.inserted_id.into_relaxed_extjson())
}

pub async fn update_documents(
    client: &Client,
    database: &str,
    collection: &str,
    filter: Document,
    update: Document,
    many: bool,
    upsert: bool,
) -> Result<(u64, u64, Option<Value>), AppError> {
    let coll = client.database(database).collection::<Document>(collection);
    let result = if many {
        coll.update_many(filter, update)
            .upsert(upsert)
            .await
            .map_err(|err| map_mongo_op_error(err, "update many", Some(database), Some(collection)))?
    } else {
        coll.update_one(filter, update)
            .upsert(upsert)
            .await
            .map_err(|err| map_mongo_op_error(err, "update one", Some(database), Some(collection)))?
    };

    Ok((
        result.matched_count,
        result.modified_count,
        result
            .upserted_id
            .map(|id| id.into_relaxed_extjson()),
    ))
}

pub async fn delete_documents(
    client: &Client,
    database: &str,
    collection: &str,
    filter: Document,
    many: bool,
) -> Result<u64, AppError> {
    let coll = client.database(database).collection::<Document>(collection);
    let result = if many {
        coll.delete_many(filter)
            .await
            .map_err(|err| map_mongo_op_error(err, "delete many", Some(database), Some(collection)))?
    } else {
        coll.delete_one(filter)
            .await
            .map_err(|err| map_mongo_op_error(err, "delete one", Some(database), Some(collection)))?
    };
    Ok(result.deleted_count)
}
