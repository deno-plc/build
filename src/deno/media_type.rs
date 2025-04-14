use std::ops::Deref;

use crate::specifier::MediaType as DenoMediaType;
use serde::{Deserialize, Serialize};

#[repr(transparent)]
#[derive(Debug, Serialize, Clone, Copy)]
pub struct MediaType {
    pub media_type: DenoMediaType,
}

impl<'de> Deserialize<'de> for MediaType {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let media_type_str = String::deserialize(deserializer)?;
        let media_type = match media_type_str.as_str() {
            "JavaScript" => DenoMediaType::JavaScript,
            "JSX" => DenoMediaType::Jsx,
            "Mjs" => DenoMediaType::Mjs,
            "Cjs" => DenoMediaType::Cjs,
            "TypeScript" => DenoMediaType::TypeScript,
            "Mts" => DenoMediaType::Mts,
            "Cts" => DenoMediaType::Cts,
            "Dts" => DenoMediaType::Dts,
            "Dmts" => DenoMediaType::Dmts,
            "Dcts" => DenoMediaType::Dcts,
            "TSX" => DenoMediaType::Tsx,
            "Css" => DenoMediaType::Css,
            "Json" => DenoMediaType::Json,
            "Html" => DenoMediaType::Html,
            "Sql" => DenoMediaType::Sql,
            "Wasm" => DenoMediaType::Wasm,
            "SourceMap" => DenoMediaType::SourceMap,
            "Unknown" => DenoMediaType::Unknown,
            _ => {
                return Err(serde::de::Error::unknown_variant(
                    &media_type_str,
                    &[
                        "JavaScript",
                        "JSX",
                        "Mjs",
                        "Cjs",
                        "TypeScript",
                        "Mts",
                        "Cts",
                        "Dts",
                        "Dmts",
                        "Dcts",
                        "TSX",
                        "Css",
                        "Json",
                        "Html",
                        "Sql",
                        "Wasm",
                        "SourceMap",
                        "Unknown",
                    ],
                ));
            }
        };
        Ok(MediaType { media_type })
    }
}

impl Deref for MediaType {
    type Target = DenoMediaType;

    fn deref(&self) -> &Self::Target {
        &self.media_type
    }
}
