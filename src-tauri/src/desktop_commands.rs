use tauri::State;

use crate::{
    app_state::AppState,
    models::{
        AggregateRequest, CollectionsResponse, ConnectionProfile, ConnectionProfileView, DeleteRequest,
        FindRequest, InsertRequest, NewConnectionProfileInput, UpdateRequest,
    },
    mongodb_service,
};

pub struct AppSharedState(pub AppState);

#[derive(serde::Deserialize)]
pub struct ConnectionIdInput {
    pub connection_id: String,
}

#[derive(serde::Deserialize)]
pub struct ListCollectionsInput {
    pub connection_id: String,
    pub database: String,
}

#[derive(serde::Serialize)]
pub struct InsertResponse {
    inserted_id: serde_json::Value,
}

#[derive(serde::Serialize)]
pub struct UpdateResponse {
    matched_count: u64,
    modified_count: u64,
    upserted_id: Option<serde_json::Value>,
}

#[derive(serde::Serialize)]
pub struct DeleteResponse {
    deleted_count: u64,
}

fn into_string_error<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}

#[tauri::command]
pub async fn list_connections(state: State<'_, AppSharedState>) -> Result<Vec<ConnectionProfileView>, String> {
    Ok(state
        .0
        .list_profiles()
        .await
        .into_iter()
        .map(|profile| profile.view())
        .collect())
}

#[tauri::command]
pub async fn save_connection(
    state: State<'_, AppSharedState>,
    payload: NewConnectionProfileInput,
) -> Result<ConnectionProfileView, String> {
    let profile = ConnectionProfile::from_input(payload);
    state
        .0
        .upsert_profile(profile.clone())
        .await
        .map_err(into_string_error)?;
    Ok(profile.view())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppSharedState>,
    payload: ConnectionIdInput,
) -> Result<String, String> {
    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    mongodb_service::test_connection(&client)
        .await
        .map_err(into_string_error)?;
    Ok("ok".to_string())
}

#[tauri::command]
pub async fn list_databases(
    state: State<'_, AppSharedState>,
    payload: ConnectionIdInput,
) -> Result<Vec<String>, String> {
    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    mongodb_service::list_database_names(&client)
        .await
        .map_err(into_string_error)
}

#[tauri::command]
pub async fn list_collections(
    state: State<'_, AppSharedState>,
    payload: ListCollectionsInput,
) -> Result<CollectionsResponse, String> {
    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    let collections = mongodb_service::list_collection_names(&client, &payload.database)
        .await
        .map_err(into_string_error)?;

    Ok(CollectionsResponse {
        database: payload.database,
        collections,
    })
}

#[tauri::command]
pub async fn run_find_query(
    state: State<'_, AppSharedState>,
    payload: FindRequest,
) -> Result<Vec<serde_json::Value>, String> {
    let filter = FindRequest::parse_document(payload.filter.as_ref()).map_err(into_string_error)?;
    let projection =
        FindRequest::parse_document(payload.projection.as_ref()).map_err(into_string_error)?;
    let sort = FindRequest::parse_document(payload.sort.as_ref()).map_err(into_string_error)?;
    let limit = payload.limit.unwrap_or(100).clamp(1, 1_000);

    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    mongodb_service::find_documents(
        &client,
        &payload.database,
        &payload.collection,
        filter,
        projection,
        sort,
        limit,
    )
    .await
    .map_err(into_string_error)
}

#[tauri::command]
pub async fn run_aggregate_query(
    state: State<'_, AppSharedState>,
    payload: AggregateRequest,
) -> Result<Vec<serde_json::Value>, String> {
    let pipeline = payload.parse_pipeline().map_err(into_string_error)?;
    let limit = payload.limit.unwrap_or(100).clamp(1, 1_000);
    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    mongodb_service::aggregate_documents(
        &client,
        &payload.database,
        &payload.collection,
        pipeline,
        limit,
    )
    .await
    .map_err(into_string_error)
}

#[tauri::command]
pub async fn insert_document(
    state: State<'_, AppSharedState>,
    payload: InsertRequest,
) -> Result<InsertResponse, String> {
    let doc = FindRequest::parse_document(Some(&payload.document)).map_err(into_string_error)?;
    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    let inserted_id = mongodb_service::insert_document(&client, &payload.database, &payload.collection, doc)
        .await
        .map_err(into_string_error)?;

    Ok(InsertResponse { inserted_id })
}

#[tauri::command]
pub async fn update_documents(
    state: State<'_, AppSharedState>,
    payload: UpdateRequest,
) -> Result<UpdateResponse, String> {
    let filter = FindRequest::parse_document(Some(&payload.filter)).map_err(into_string_error)?;
    let update = FindRequest::parse_document(Some(&payload.update)).map_err(into_string_error)?;
    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    let (matched_count, modified_count, upserted_id) = mongodb_service::update_documents(
        &client,
        &payload.database,
        &payload.collection,
        filter,
        update,
        payload.many.unwrap_or(false),
        payload.upsert.unwrap_or(false),
    )
    .await
    .map_err(into_string_error)?;

    Ok(UpdateResponse {
        matched_count,
        modified_count,
        upserted_id,
    })
}

#[tauri::command]
pub async fn delete_documents(
    state: State<'_, AppSharedState>,
    payload: DeleteRequest,
) -> Result<DeleteResponse, String> {
    let filter = FindRequest::parse_document(Some(&payload.filter)).map_err(into_string_error)?;
    let client = state
        .0
        .get_client(&payload.connection_id)
        .await
        .map_err(into_string_error)?;
    let deleted_count = mongodb_service::delete_documents(
        &client,
        &payload.database,
        &payload.collection,
        filter,
        payload.many.unwrap_or(false),
    )
    .await
    .map_err(into_string_error)?;

    Ok(DeleteResponse { deleted_count })
}
