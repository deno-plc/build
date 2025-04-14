use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use deno_graph::ModuleSpecifier;
use serde::Deserialize;
use url::Url;

use super::media_type::MediaType;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DenoInfo {
    version: u8,
    pub roots: Vec<ModuleSpecifier>,
    pub modules: Vec<Module>,
    pub npm_packages: HashMap<String, NpmPackage>,
    pub packages: HashMap<String, String>,
    pub redirects: HashMap<ModuleSpecifier, ModuleSpecifier>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
#[non_exhaustive]
pub enum Module {
    #[serde(rename = "esm")]
    Esm(EsmModule),
    // #[serde(rename = "asserted")]
    // Json(JsonModule),
    // Wasm(WasmModule),
    Npm(NpmModule),
    Node(BuiltInNodeModule),
    External(ExternalModule),
}

impl Module {
    pub fn specifier(&self) -> &ModuleSpecifier {
        match self {
            Module::Esm(module) => &module.specifier,
            // Module::Json(module) => &module.specifier,
            // Module::Wasm(module) => &module.specifier,
            Module::Npm(module) => &module.specifier,
            Module::Node(module) => &module.specifier,
            Module::External(module) => &module.specifier,
        }
    }

    pub fn media_type(&self) -> MediaType {
        match self {
            Module::Esm(module) => module.media_type,
            // Module::Json(module) => module.media_type,
            // Module::Wasm(_) => MediaType::Wasm,
            Module::Node(_) => MediaType {
                media_type: deno_graph::MediaType::JavaScript,
            },
            Module::Npm(_) | Module::External(_) => MediaType {
                media_type: deno_graph::MediaType::Unknown,
            },
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsmModule {
    pub specifier: ModuleSpecifier,
    pub media_type: MediaType,
    pub local: PathBuf,
    #[serde(default = "Vec::new")]
    pub dependencies: Vec<EsmDependency>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EsmDependency {
    pub specifier: String,
    pub code: Option<EsmDependencyCode>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EsmDependencyCode {
    pub specifier: ModuleSpecifier,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpmModule {
    pub specifier: ModuleSpecifier,
    pub npm_package: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInNodeModule {
    /// Specifier (ex. "node:fs")
    pub specifier: ModuleSpecifier,
    /// Module name (ex. "fs")
    pub module_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalModule {
    pub specifier: ModuleSpecifier,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpmPackage {
    pub name: String,
    pub version: String,
    pub dependencies: Vec<String>,
    pub registry_url: Url,
}

pub async fn call_deno_info(
    deno_executable: &str,
    dir: impl AsRef<Path>,
    specifier: &ModuleSpecifier,
) -> Result<DenoInfo, String> {
    let output = tokio::process::Command::new(deno_executable)
        .current_dir(dir)
        .arg("info")
        .arg("--json")
        .arg(specifier.to_string())
        .output()
        .await
        .map_err(|e| format!("Failed to execute deno info: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Deno info command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let info: DenoInfo = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse deno info output: {}", e))?;

    if info.version != 1 {
        return Err(format!(
            "Unsupported deno info schema version: {}",
            info.version
        ));
    }

    Ok(info)
}
