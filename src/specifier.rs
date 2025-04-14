use serde::{Deserialize, Serialize};

pub type ModuleSpecifier = url::Url;

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
pub enum MediaType {
    JavaScript,
    Jsx,
    Mjs,
    Cjs,
    TypeScript,
    Mts,
    Cts,
    Dts,
    Dmts,
    Dcts,
    Tsx,
    Css,
    Json,
    Html,
    Sql,
    Wasm,
    SourceMap,
    Unknown,
}
