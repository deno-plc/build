use std::{
    collections::HashMap,
    sync::{Arc, OnceLock},
};

use axum::{Json, Router, extract::Query, http::StatusCode, routing::get};
use deno_graph::ModuleSpecifier;
use serde::Serialize;

use crate::graph::ModuleGraph;

static GRAPH: OnceLock<Arc<ModuleGraph>> = OnceLock::new();
pub fn router(graph: Arc<ModuleGraph>) -> Router {
    GRAPH.set(graph).unwrap();
    Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/api/v1/graph/lookup_imports", get(get_module_lookup_table))
}

async fn get_module_lookup_table(
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, Json<ModuleLookupTableResponse>), (StatusCode, Json<ErrorResponse>)> {
    let module_id = params.get("module").ok_or((
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: "No module specified".to_string(),
            description: None,
        }),
    ))?;

    let module_specifier = ModuleSpecifier::parse(module_id).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid module specifier".to_string(),
                description: Some(e.to_string()),
            }),
        )
    })?;

    let table = GRAPH
        .get()
        .unwrap()
        .get_module(&module_specifier)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Module not found".to_string(),
                    description: Some(module_specifier.to_string()),
                }),
            )
        })?
        .esm()
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Specifier exists, but points to a non-esm module".to_string(),
                    description: Some(module_specifier.to_string()),
                }),
            )
        })?
        .lookup_table()
        .unwrap()
        .iter()
        .map(|(k, v)| (k.to_string(), v.specifier().to_string()))
        .collect::<HashMap<_, _>>();

    Ok((StatusCode::OK, Json(ModuleLookupTableResponse { table })))
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    description: Option<String>,
}

#[derive(Debug, Serialize)]
struct ModuleLookupTableResponse {
    table: HashMap<String, String>,
}
