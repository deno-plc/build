use std::{
    collections::HashMap,
    sync::{Arc, OnceLock},
};

use crate::{
    npm::id::NPMPackageId,
    specifier::ModuleSpecifier,
    transpiler::{
        TransformPool,
        transform::{TransformOptions, TransformResult},
    },
};
use axum::{Json, Router, extract::Query, http::StatusCode, routing::get};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::graph::ModuleGraph;

static GRAPH: OnceLock<Arc<ModuleGraph>> = OnceLock::new();
pub fn router(graph: Arc<ModuleGraph>) -> Router {
    GRAPH.set(graph).unwrap();
    Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/api/v1/graph/lookup_imports", get(get_module_lookup_table))
        .route("/api/v1/transform/module", get(translate_module))
        .route("/api/v1/npm/metadata", get(get_npm_metadata))
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

async fn translate_module(
    Query(params): Query<TranslateModuleQuery>,
    // Query(params): Query<HashMap<String, String>>,
) -> Result<Json<TranslateModuleOutput>, (StatusCode, Json<ErrorResponse>)> {
    let graph = GRAPH.get().unwrap().clone();
    let module_id = params.module;
    // let module_id = ModuleSpecifier::parse(params.get("module").unwrap()).unwrap();

    let module = graph
        .get_module(&module_id)
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Module not found".to_string(),
                    description: Some(module_id.to_string()),
                }),
            )
        })?
        .esm()
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Module is not an ESM module".to_string(),
                    description: Some(module_id.to_string()),
                }),
            )
        })?;

    let code = module.load_code().await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Failed to read module file".to_string(),
                description: Some(e.to_string()),
            }),
        )
    })?;

    let res = TransformPool::get()
        .transform(TransformOptions {
            code,
            hmr: false,
            graph,
            module,
        })
        .result()
        .await;

    if let Some(res) = res {
        Ok(Json(TranslateModuleOutput { result: res }))
    } else {
        Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to transform module".to_string(),
                description: None,
            }),
        ))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct TranslateModuleQuery {
    module: ModuleSpecifier,
}

#[derive(Debug, Serialize)]
struct TranslateModuleOutput {
    result: TransformResult,
}

async fn get_npm_metadata(
    Query(package_id): Query<NPMPackageId>,
) -> Result<Json<NPMMetadataResponse>, (StatusCode, Json<ErrorResponse>)> {
    let graph = GRAPH.get().unwrap().clone();
    let pkg = graph
        .get_npm_package(&package_id.to_string())
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Package not found".to_string(),
                    description: None,
                }),
            )
        })?;

    Ok(Json(NPMMetadataResponse {
        registry_url: pkg.registry_url().clone(),
        dependencies: pkg.dependencies(),
    }))
}

#[derive(Debug, Serialize, Deserialize)]
struct NPMMetadataResponse {
    registry_url: Url,
    dependencies: Vec<NPMPackageId>,
}
