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

import type { SemVer } from "@std/semver";
import * as esbuild from "esbuild";
import { join } from "@std/path/join";
import { PackageJson } from "./package_json.ts";
import { toFileUrl } from "@std/path/to-file-url";
import { assertEquals } from "@std/assert/equals";
import { getLocalPackagePath, type NPMPackage, npmToCanonical } from "./package.ts";
import type { FullConfig } from "../config.ts";
import { assert } from "@std/assert/assert";

export class NPMCompiler {
    constructor(readonly config: FullConfig) { }

    #cache = new Map<string, CompiledNPMPackage>();
    #queue = new Map<string, Promise<CompiledNPMPackage>>();

    async #compile(package_name: string, version: SemVer): Promise<CompiledNPMPackage> {
        const local_path = await getLocalPackagePath(package_name, version);
        const package_json = await PackageJson.load(toFileUrl(join(local_path, "package.json")));

        assertEquals(package_json.raw_content.name, package_name, `Package name mismatch`);

        const outdir = join(local_path, "virtual-dist");

        const external_mapping = new Map<string, string>();

        const res = await esbuild.build({
            entryPoints: [...package_json.export_map().entries()]
                .filter(([e, i]) => {
                    if (e.includes("*") || e.endsWith("package.json") || i.endsWith("package.json") || e.endsWith(".css")) {
                        return false;
                    }

                    return true;
                })
                .map(([, i]) => join(local_path, i)),
            plugins: [
                {
                    name: "dependencies",
                    setup(build) {
                        build.onResolve({
                            filter: /^[^\.]/,
                        }, (args) => {
                            console.log(`external: ${args.path}`);
                            const replace_id = crypto.randomUUID();
                            external_mapping.set(args.path, replace_id);
                            return {
                                path: replace_id,
                                namespace: "npm-deps",
                                external: true,
                            };
                        });
                    },
                },
                {
                    name: "self-reference",
                    setup(build) {
                        build.onResolve({ filter: new RegExp(`^${package_name}(\/|$)`) }, (args) => {
                            const spec = args.path;

                            if (spec === package_name) {
                                const mapped = package_json.export_map().get(".");

                                if (!mapped) {
                                    return {
                                        errors: [
                                            {
                                                text: `[resolving self-references] Package ${package_name} does not export "."`,
                                                location: {
                                                    file: args.importer,
                                                }
                                            }
                                        ]
                                    };
                                } else {
                                    return {
                                        path: join(local_path, mapped),
                                        namespace: "file",
                                    };
                                }
                            } else if (spec.startsWith(`${package_name}/`)) {
                                const subpath = "./" + spec.slice(package_name.length + 1);
                                const mapped = package_json.export_map().get(subpath);

                                if (!mapped) {
                                    return {
                                        errors: [
                                            {
                                                text: `[resolving self-references] Package ${package_name} does not export "${subpath}"`,
                                                location: {
                                                    file: args.importer,
                                                }
                                            }
                                        ]
                                    };
                                } else {
                                    return {
                                        path: join(local_path, mapped),
                                        namespace: "file",
                                    };
                                }
                            }


                            return {};
                        });
                    }
                },
            ],
            write: false,
            outdir,
            bundle: true,
            splitting: true,
            format: "esm",
            platform: "neutral",
            minify: true,
        });

        for (const chunk of res.outputFiles) {
            assert(chunk.path.startsWith(outdir));
            const _filename = chunk.path.substring(outdir.length + 1).replace(/\\/g, "/");
            // console.log(`${filename}: ${chunk.contents.length} bytes ${chunk.hash}`);
        }

        return new CompiledNPMPackage(package_name, version, res, external_mapping);
    }

    async get_compiled(pkg: NPMPackage): Promise<CompiledNPMPackage> {
        const canonical = npmToCanonical(pkg);

        if (this.#cache.has(canonical)) {
            return this.#cache.get(canonical)!;
        }
        if (this.#queue.has(canonical)) {
            return await this.#queue.get(canonical)!;
        }
        this.config.logger.info`Compiling npm:${canonical}`;
        const promise = this.#compile(pkg.name, pkg.version);
        this.#queue.set(canonical, promise);
        const res = await promise;
        this.#cache.set(canonical, res);
        this.#queue.delete(canonical);
        this.config.logger.info`Successfully compiled npm:${canonical}`;
        return res;
    }
}

export class CompiledNPMPackage {
    constructor(
        readonly name: string,
        readonly version: SemVer,
        readonly build: esbuild.BuildResult,
        readonly external_mapping: Map<string, string>,
    ) {

    }
}



// export async function compileNPMPackage(package_name: string, version: SemVer) {
//     const local_path = await getLocalPackagePath(package_name, version);
//     const package_json_path = toFileUrl(join(local_path, "package.json"));
//     const package_json = await PackageJson.load(package_json_path);

//     assertEquals(package_json.raw_content.name, package_name, `Package name mismatch`);

//     console.log(package_json.export_map());

//     await Deno.remove("./dist/preact", {
//         recursive: true,
//     });

//     const res = await esbuild.build({
//         entryPoints: [...package_json.export_map().entries()].filter(([e, i]) => {
//             if (e.includes("*") || e.endsWith("package.json") || i.endsWith("package.json") || e.endsWith(".css")) {
//                 return false;
//             }

//             return true;
//         }).map(([_e, i]) => join(local_path, i)),
//         plugins: [
//             {
//                 name: "self-reference",
//                 setup(build) {
//                     build.onResolve({ filter: new RegExp(`^${package_name}`) }, (args) => {
//                         const spec = args.path;

//                         if (spec === package_name) {
//                             const mapped = package_json.export_map().get(".");

//                             if (!mapped) {
//                                 return {
//                                     errors: [
//                                         {
//                                             text: `[resolving self-references] Package ${package_name} does not export "."`,
//                                             location: {
//                                                 file: args.importer,
//                                             }
//                                         }
//                                     ]
//                                 };
//                             } else {
//                                 return {
//                                     path: join(local_path, mapped),
//                                     namespace: "file",
//                                 };
//                             }
//                         } else if (spec.startsWith(`${package_name}/`)) {
//                             const subpath = "./" + spec.slice(package_name.length + 1);
//                             const mapped = package_json.export_map().get(subpath);

//                             if (!mapped) {
//                                 return {
//                                     errors: [
//                                         {
//                                             text: `[resolving self-references] Package ${package_name} does not export "${subpath}"`,
//                                             location: {
//                                                 file: args.importer,
//                                             }
//                                         }
//                                     ]
//                                 };
//                             } else {
//                                 return {
//                                     path: join(local_path, mapped),
//                                     namespace: "file",
//                                 };
//                             }
//                         }


//                         return {};
//                     });
//                 }
//             },
//             {
//                 name: "dependencies",
//                 setup(build) {
//                     build.onResolve({ filter: /^[^.]/ }, (args) => {
//                         return {};
//                     });
//                 },
//             }
//         ],
//         // write: false,
//         outdir: "./dist/preact",
//         bundle: true,
//         splitting: true,
//         format: "esm",
//         platform: "neutral",
//         packages: "external",
//     });

//     console.log(res);

//     // res.
// }


