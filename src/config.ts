/**
 * @license GPL-3.0-or-later
 * Deno-PLC build
 *
 * Copyright (C) 2025 Hans Schallmoser
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { getLogger, type Logger } from "@logtape/logtape";
import { join } from "@std/path/join";
import { isAbsolute } from "@std/path/is-absolute";

export interface BuildConfig {
    logger?: Logger;
    /**
     * Path from which the dev server urls are resolved.
     */
    dev_server_root?: string;

    /**
     * Path to the root directory of the project. This is the CWD for the deno commands
     */
    root_dir?: string;

    /**
     * Path to a module that imports everything thats needed, not necessarily part of the application
     */
    root_module: URL;

    /**
     * Entrypoint for build
     */
    entrypoint?: URL;

    /**
     * Port for the graph server to use (this is not the dev server)
     */
    graph_server_port?: number;

    /**
     * Set this to false to bring your own graph server
     */
    run_graph_server?: boolean;

    /**
     * List of npm packages that are redirected to esm.sh
     */
    cdn?: string[];
}

export type FullConfig = Required<BuildConfig>;

function toAbsolute(path?: string): string {
    if (isAbsolute(path ?? ".")) {
        return path!;
    } else {
        return join(Deno.cwd(), path ?? ".");
    }
}

export function config_defaults(config: BuildConfig): FullConfig {
    const root_dir = toAbsolute(config.root_dir);
    return {
        logger: getLogger(["app", "deno-plc", "build"]),
        cdn: [],
        graph_server_port: 3000,
        entrypoint: config.root_module,
        run_graph_server: true,

        ...config,

        root_dir,
        dev_server_root: toAbsolute(config.dev_server_root ?? root_dir),
    };
}

export function toServerConfig(config: FullConfig): string {
    return JSON.stringify({
        port: config.graph_server_port,
        root_path: config.root_dir,
        entrypoint: config.root_module.href,
    });
}
