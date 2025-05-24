pub mod api;
mod config;
pub mod deno;
pub mod graph;
pub mod npm;
pub mod specifier;
pub mod transpiler;
use std::{
    net::{IpAddr, Ipv6Addr, SocketAddr},
    path::PathBuf,
    sync::Arc,
};

use api::router;
use config::Config;
use deno::info::call_deno_info;
use graph::ModuleGraph;
use tokio::{signal, spawn};

#[tokio::main]
async fn main() {
    let config: Config = config::from_args();

    let root_dir = PathBuf::from(config.root_path);

    let mut graph = ModuleGraph::new();

    println!("Retrieving graph");

    let info = match call_deno_info("deno", &root_dir, &config.root_module).await {
        Ok(info) => info,
        Err(err) => {
            eprintln!("Error retrieving graph:\n{}", err);
            return;
        }
    };

    println!("Processing graph");

    graph.build(info, root_dir).await;

    let graph = Arc::new(graph);

    println!("Graph built");

    let listener = tokio::net::TcpListener::bind(SocketAddr::new(
        IpAddr::V6(Ipv6Addr::LOCALHOST),
        config.port,
    ))
    .await
    .unwrap();

    spawn(async move {
        println!("Graph server listening on http://localhost:{}", config.port);
        axum::serve(listener, router(graph)).await.unwrap();
    });

    match signal::ctrl_c().await {
        Ok(()) => {}
        Err(err) => {
            eprintln!("Unable to listen for shutdown signal: {}", err);
        }
    }

    println!("Shutting down");
}
