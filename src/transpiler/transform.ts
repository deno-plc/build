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

import * as esbuild from "esbuild";
// import { transformAsync } from "@babel/core";
import { fromFileUrl } from "@std/path";

export async function transform(code: string, path: URL): Promise<string> {
    const start = performance.now();
    const file_path = fromFileUrl(path);
    const out = await esbuild.build({
        // stdin: {
        //     contents: code,
        //     loader: "tsx",
        // },
        entryPoints: [file_path],
        write: false,
        format: "esm",
        bundle: true,
        // platform: "neutral",
        sourcemap: true,
        plugins: [
            {
                name: "skjg",
                setup(build) {
                    // console.log(build);
                    build.onResolve({ filter: /./ }, args => {
                        if (args.kind === "entry-point") {
                            return {};
                        }
                        // if (args.path.startsWith(".")) {
                        //     return {};
                        // }
                        // console.log(args);
                        return {
                            external: true,
                        };
                    });
                }
            }
        ]
    });

    // const out = await transformAsync(code, {
    //     ast: false,
    //     code: true,
    // });

    console.log("Transform took", performance.now() - start, "ms");

    // console.log(out.errors);
    // console.log(out.warnings);

    // console.log(out.outputFiles);

    return out.outputFiles[0].text;
}
