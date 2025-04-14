pub mod api;
pub mod deno;
pub mod graph;
pub mod transpiler;
use std::{collections::HashMap, env, sync::Arc};

use deno::info::call_deno_info;
// use api::router;
use deno_graph::ModuleSpecifier;
use graph::ModuleGraph;
// use tokio::{signal, spawn};

#[tokio::main]
async fn main() {
    let test_dir = env::current_dir()
        .unwrap()
        .join("../technik-app")
        .canonicalize()
        .unwrap();

    let mut graph = ModuleGraph::new();

    let root = ModuleSpecifier::from_file_path(test_dir.join("frontend/dev.client.tsx")).unwrap();

    println!("Retrieving graph");

    let info = call_deno_info("deno", &test_dir, &root).await.unwrap();

    println!("Processing graph");

    graph.build(info).await;

    let graph = Arc::new(graph);

    println!("Graph built");

    println!(
        "Test: {:#?}",
        graph
            .root()
            .unwrap()
            .lookup_table()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.to_string(), v.specifier().to_string()))
            .collect::<HashMap<_, _>>()
    );

    // let listener = tokio::net::TcpListener::bind("[::1]:3000").await.unwrap();

    // spawn(async move {
    //     println!("Listening on http://localhost:3000");
    //     axum::serve(listener, router(graph)).await.unwrap();
    // });

    // match signal::ctrl_c().await {
    //     Ok(()) => {}
    //     Err(err) => {
    //         eprintln!("Unable to listen for shutdown signal: {}", err);
    //     }
    // }

    // println!("Shutting down");
}
