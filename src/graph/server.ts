import { type FullConfig, toServerConfig } from "../config.ts";
import deno_json from "../../deno.json" with { type: "json" };
import cacheDir from "./cache_dir.ts";
import { assert } from "@std/assert/assert";
import { fromFileUrl, join } from "@std/path";
import { ensureDir } from "@std/fs";
import { getLogger } from "@logtape/logtape";

const version = deno_json.version;

const logger = getLogger(["app", "deno-plc", "build", "graph-server"]);

async function cache_server(version: string) {
    const cache_dir = cacheDir();
    assert(cache_dir);

    const cache_folder = join(
        cache_dir,
        "deno-plc-build",
        "graph-server",
        `v${version}`,
    );

    await ensureDir(cache_folder);

    // for automatic deletion of old versions (not implemented yet)
    await Deno.writeTextFile(
        join(cache_folder, "last_used"),
        new Date().toISOString(),
    );

    const cache_path = join(
        cache_folder,
        `${Deno.build.target}${Deno.build.os === "windows" ? ".exe" : ""}`,
    );

    await Deno.stat(cache_path).catch(async () => {
        logger.info`downloading graph server version ${version}`;
        const file = await fetch(
            `https://github.com/deno-plc/build/releases/download/v${version}/deno-plc-build-${Deno.build.target}${
                Deno.build.os === "windows" ? ".exe" : ""
            }`,
        );

        if (file.ok && file.body) {
            await Deno.writeFile(cache_path, file.body, {
                createNew: true,
            });
            logger.info`successfully downloaded graph server`;
        } else {
            throw new Error(
                `Failed to download deno-plc-build: ${file.status} ${file.statusText}`,
            );
        }
    });

    return cache_path;
}

export async function run_graph_server(config: FullConfig) {
    if (config.dev_use_cargo) {
        return run_graph_server_cargo(config);
    }

    const executable = await cache_server(version);

    const proc = new Deno.Command(executable, {
        args: ["--json", toServerConfig(config)],
    });

    return proc.spawn();
}

export function run_graph_server_cargo(config: FullConfig) {
    const proc = new Deno.Command("cargo", {
        args: [
            "run",
            "--",
            "--json",
            toServerConfig(config),
        ],
        cwd: join(fromFileUrl(import.meta.url), "../.."),
    });

    return proc.spawn();
}
