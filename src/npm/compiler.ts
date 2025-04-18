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

import { format, type SemVer } from "@std/semver";
import * as esbuild from "esbuild";
import { join } from "@std/path/join";
import { PackageJson } from "./package_json.ts";
import { toFileUrl } from "@std/path/to-file-url";
import { assertEquals } from "@std/assert/equals";
import { fetchPackageMetadata, getLocalPackagePath, getRegistry, type NPMPackage, npmToCanonical, parseNPMSpecifier } from "./package.ts";
import type { FullConfig } from "../config.ts";
import { assert } from "@std/assert/assert";
import { deno_info } from "../deno/info.ts";

export class NPMCompiler {
    constructor(readonly config: FullConfig) { }

    #cache = new Map<string, CompiledNPMPackage>();
    #queue = new Map<string, Promise<CompiledNPMPackage>>();

    async #compile(package_name: string, version: SemVer): Promise<CompiledNPMPackage> {
        // console.log(`Compiling npm:${package_name}@${format(version)}`);
        const { denoDir, npmCache } = await deno_info;

        if (package_name === "util") {
            console.log("compiling util");

        }
        const metadata = await fetchPackageMetadata({ name: package_name, version });
        if (package_name === "util") {
            console.log("got util metadata");
        }

        const registry = metadata.registry_url.hostname;

        const local_path = join(npmCache, registry, package_name, format(version));

        const package_json = await PackageJson.load(toFileUrl(join(local_path, "package.json")));

        if (package_name === "util") {
            console.log("got util packgae.json");
        }

        assertEquals(package_json.raw_content.name, package_name, `Package name mismatch`);

        const output_magic = crypto.randomUUID();

        const outdir = join(local_path, output_magic);

        // const external_mapping = new Map<string, string>();

        const export_paths = new Map<string, string>();

        // deno-lint-ignore no-this-alias
        const compiler = this;

        if (package_name === "util") {
            console.log("compiling util");
        }

        const res = await esbuild.build({
            entryPoints: await Promise.all([...package_json.export_map().entries()]
                .filter(([e, i]) => {
                    if (e.includes("*") || e.endsWith("package.json") || i.endsWith("package.json") || e.endsWith(".css")) {
                        return false;
                    }

                    return true;
                })
                .map(([e, i]) => {
                    const path = join(local_path, i);
                    export_paths.set(e, join(local_path, output_magic, i));
                    return path;
                })
                .map(async (path) => {
                    // console.log(`entry point: ${path}`);
                    await Deno.stat(path);

                    return (path);
                })),
            plugins: [
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
                {
                    name: "npm package dependencies",
                    setup(build) {
                        build.onResolve({
                            filter: /^[^\.]/,
                        }, async (args) => {
                            if (args.kind === "entry-point") {
                                return {};
                            }
                            const spec = args.path;
                            if (spec.startsWith("node:")) {
                                return {
                                    path: `/@node/${spec.slice(5)}`,
                                    namespace: "node-builtins",
                                    external: true,
                                };
                            }

                            let subpath_index = -1;

                            if (spec.startsWith("@")) {
                                subpath_index = spec.indexOf("/", spec.indexOf("/", 1) + 1);
                            } else {
                                subpath_index = spec.indexOf("/", 1);
                            }

                            if (subpath_index === -1) {
                                subpath_index = spec.length;
                            }

                            const subpath = spec.slice(subpath_index + 1);

                            const dep_name = spec.slice(0, subpath_index);

                            const dep_version = metadata.dependencies.get(dep_name);

                            if (!dep_version) {
                                return {
                                    path: `/@module/error/${encodeURIComponent(`Package ${dep_name} not found in dependencies of ${package_name}`)}`,
                                    namespace: "error-fake-url",
                                    external: true,
                                };
                            }

                            const dep = await compiler.get_compiled({
                                name: dep_name,
                                version: dep_version,
                            });

                            const exp = dep.get_export(subpath ? `./${subpath}` : ".");

                            // assert(exp, `Export "${subpath}" not found in ${dep_name}@${format(dep_version)}`);

                            if (exp) {
                                return {
                                    path: `/@npm-src/${encodeURIComponent(dep_name)}/${format(dep_version)}/${exp}`,
                                    namespace: "npm-deps",
                                    external: true,
                                };
                            } else /* if (true) */ {
                                return {
                                    path: `${encodeURIComponent(`${dep_name}`)}/${subpath}`,
                                    namespace: "cjs-subpath-imports",
                                    external: false,
                                };
                                // } else {
                                // throw new Error(`[56] Export "${subpath}" not found in ${dep_name}@${format(dep_version)}`);
                            }
                        });
                    },
                },
                {
                    name: "commonjs subpath imports",
                    setup(build) {
                        build.onLoad({ namespace: "cjs-subpath-imports", filter: /./ }, async args => {
                            const spec = args.path;

                            const parts = spec.split("/");
                            const import_id = decodeURIComponent(parts.shift()!);

                            const code = `import * as $mod from "${import_id}"; const $exp = $mod.${parts.join(".")}; export default $exp;`;

                            return {
                                contents: code,
                                loader: "js",
                            } satisfies esbuild.OnLoadResult;
                        });
                    },
                },
            ],
            write: false,
            outdir,
            bundle: true,
            splitting: true,
            format: "esm",
            platform: "neutral",
            metafile: true,
            minify: true,
            absWorkingDir: denoDir,
        });

        if (package_name === "util") {
            console.log("compiled util");
        }

        for (const chunk of res.outputFiles) {
            assert(chunk.path.startsWith(outdir));
            const _filename = chunk.path.substring(outdir.length + 1).replace(/\\/g, "/");
            // console.log(`${filename}: ${chunk.contents.length} bytes ${chunk.hash}`);
        }

        return new CompiledNPMPackage(package_name, version, res, denoDir, registry, export_paths, output_magic);
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
        let resolve: (r: CompiledNPMPackage) => void = () => { };

        const promise = new Promise<CompiledNPMPackage>(r => {
            resolve = r;
        });

        this.#queue.set(canonical, promise);

        const res = await this.#compile(pkg.name, pkg.version).catch(e => {
            this.config.logger.error`Failed to compile npm:${canonical}: ${e}`;
            // block
            return new Promise<CompiledNPMPackage>(_resolve => { });
        });

        this.#cache.set(canonical, res);

        resolve(res);

        this.#queue.delete(canonical);

        // this.config.logger.info`Successfully compiled npm:${canonical}`;
        return res;
    };
}

export class CompiledNPMPackage {
    readonly files = new Map<string, esbuild.OutputFile>();
    readonly exports: Map<string, string>;
    constructor(
        readonly name: string,
        readonly version: SemVer,
        readonly build: esbuild.BuildResult,
        _deno_dir: string,
        registry: string,
        export_paths: Map<string, string>,
        output_magic: string,
    ) {
        const compiler_mapping = new Map<string, string>();
        for (const [file, info] of Object.entries(build.metafile!.outputs)) {
            if (info.entryPoint) {
                // console.log(info.entryPoint);
                // const path = join(deno_dir, file);
                const path = file.split(output_magic)[1].substring(1);
                const raw_export_paths = info.entryPoint.split("/");
                assertEquals(raw_export_paths.shift(), "npm");
                assertEquals(raw_export_paths.shift(), registry);
                const raw_package_name_1 = raw_export_paths.shift();
                if (raw_package_name_1?.startsWith("@")) {
                    raw_export_paths.shift();
                }
                assertEquals(raw_export_paths.shift(), format(this.version));

                const raw_export_name = raw_export_paths.join("/");
                compiler_mapping.set(raw_export_name, path);
            }
        }
        // console.log("metafile", build.metafile);
        // console.log("mapped export paths", new Map(export_paths.entries().map(([e, path]) => [e, path.split(output_magic)[1]?.substring(1) ?? path])));
        // console.log("compiler mapping", compiler_mapping);
        // console.log("export paths", export_paths);
        this.exports = new Map(
            [...export_paths.entries()]
                .map(([e, path]) => [e,
                    compiler_mapping.get(
                        path
                            .split(output_magic)[1]
                            .substring(1)
                            .replaceAll("\\", "/"))!]));

        // console.log("exports", this.exports);
        for (const chunk of build.outputFiles ?? []) {
            const path = chunk.path.split(output_magic)[1].substring(1).replaceAll("\\", "/");
            this.files.set(path, chunk);
            // console.log(`File: ${path} (${chunk.contents.length} bytes)`);
        }

        // console.log(`Compiled ${this.name}@${format(this.version)} (${this.files.size} files)`);
    }

    get_export(subpath: string): string | null {
        return this.exports.get(subpath) ?? null;
    }

    get_file(path: string): esbuild.OutputFile | null {
        return this.files.get(path) ?? null;
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


