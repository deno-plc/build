use std::env;

use serde::{Deserialize, Serialize};

use crate::specifier::ModuleSpecifier;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub root_path: String,
    pub entrypoint: ModuleSpecifier,
    pub port: u16,
}

pub fn from_args() -> Config {
    let args = env::args().collect::<Vec<_>>();

    let cfg_type = args.get(1).expect("No config specified");

    match cfg_type.as_str() {
        "--json" => serde_json::from_str(args.get(2).unwrap()).unwrap(),
        "--technik-app" => {
            let root_path = env::current_dir().unwrap().join("../technik-app");
            Config {
                root_path: root_path.to_string_lossy().to_string(),
                entrypoint: ModuleSpecifier::from_file_path(
                    root_path.join("frontend/dev.client.tsx"),
                )
                .unwrap(),
                port: 3000,
            }
        }
        _ => {
            panic!("Invalid config type")
        }
    }
}
