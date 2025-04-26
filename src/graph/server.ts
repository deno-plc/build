import { cache } from "@denosaurs/cache";
import { type FullConfig, toServerConfig } from "../config.ts";
import deno_json from "../../deno.json" with { type: "json" };

const version = deno_json.version;

export async function run_graph_server(config: FullConfig) {
    const executable = await cache(
        `https://github.com/deno-plc/build/releases/download/v${version}/deno-plc-build-${Deno.build.target}${
            Deno.build.os === "windows" ? ".exe" : ""
        }`,
    );

    const proc = new Deno.Command(executable.path, {
        args: ["--json", JSON.stringify(toServerConfig(config))],
    });

    return proc.spawn();
}
