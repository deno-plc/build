pub mod api;
pub mod deno;
pub mod graph;
pub mod npm;
pub mod specifier;
pub mod transpiler;
use std::{env, sync::Arc};

// use tokio::fs::{read_to_string, write};
use crate::specifier::ModuleSpecifier;
use api::router;
use deno::info::call_deno_info;
use graph::ModuleGraph;
use path_clean::PathClean;
use tokio::{signal, spawn};

#[tokio::main]
async fn main() {
    let root_dir = env::current_dir().unwrap().join("../technik-app").clean();

    let mut graph = ModuleGraph::new();

    let root = ModuleSpecifier::from_file_path(root_dir.join("frontend/dev.client.tsx")).unwrap();

    println!("Retrieving graph");

    let info = call_deno_info("deno", &root_dir, &root).await.unwrap();

    println!("Processing graph");

    graph.build(info, root_dir).await;

    let graph = Arc::new(graph);

    println!("Graph built");

    let listener = tokio::net::TcpListener::bind("[::1]:3000").await.unwrap();

    spawn(async move {
        println!("Listening on http://localhost:3000");
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
