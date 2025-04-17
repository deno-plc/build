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

import { z } from "zod";
import { format, parse as parseSemver } from "@std/semver";
import { KeyTree } from "./key_tree.ts";
import { CanonicalRay, type Ray, SparseRay, tracing } from "../ray.ts";

/**
 * @module
 * @description parses package.json files
 */

const WeakPackageJson = z.object({
    name: z.string(),
    version: z.string().transform(parseSemver),
    description: z.string().optional(),
    main: z.unknown().optional(),
    module: z.unknown().optional(),
    browser: z.unknown().optional(),
    exports: z.unknown().optional(),
});
type WeakPackageJson = z.infer<typeof WeakPackageJson>;

export const tree = new KeyTree();

export class PackageJson {
    ray: Ray;
    constructor(readonly raw_content: WeakPackageJson, readonly path: URL) {
        this.ray = new CanonicalRay(["package.json", `package: ${this.raw_content.name}@${format(this.raw_content.version)}`, `path: ${this.path.href}`]);
        if (this.raw_content.exports) {
            tree.append(this.raw_content.exports, this.ray);
        }
    }
    public static async load(path: URL) {
        return new PackageJson(WeakPackageJson.parse(JSON.parse(await Deno.readTextFile(path))), path);
    }
    #export_map: Map<string, string> | undefined;

    #parse_exports() {
        if (this.#export_map) return;

        this.#export_map = new Map();

        if (this.raw_content.exports) {
            const wildcard_exports = new Set<string>();
            const report = (id: string, res: string) => {
                this.#export_map!.set(id, res);
                if (id.includes("*")) {
                    wildcard_exports.add(id);
                }
            };

            const main_res = parse_export_level(this.raw_content.exports, report, this.ray);

            if (!this.#export_map.has(".") && main_res) {
                this.#export_map.set(".", main_res);
            }
        } else {
            const main = parse_export_level(this.raw_content, (_, __, ray) => {
                // throw new Error(`Unexpected export map without exports\n${ray.to_canonical().format()}`);
            }, this.ray);
            if (main) {
                this.#export_map.set(".", main);
            }
        }
    }

    public export_map(): Map<string, string> {
        return this.#export_map ?? (this.#parse_exports(), this.#export_map!);
    }
}

function parse_export_level(src: unknown, report_entry: (id: string, res: string, ray: Ray) => void, ray: Ray): string | null {
    if (typeof src === "string") {
        if (src.startsWith(".")) {
            return src;
        } else {
            return `./${src}`;
        }
    } else if (Array.isArray(src)) {
        let i = 0;
        for (const item of src) {
            const res = parse_export_level(item, report_entry, tracing ? new SparseRay(ray, `.[${i}]`) : ray);
            if (res) {
                return res;
            }
            i++;
        }
    } else if (typeof src === "object" && src !== null) {
        for (const [key, value] of Object.entries(src)) {
            if (key.startsWith(".")) {
                const entry_ray = tracing ? new SparseRay(ray, `Entry: ${key}`) : ray;
                const res = parse_export_level(value, (id: string) => {
                    throw new Error(`FatalError: Nested exports are not allowed: (parent=${key}, key=${id})\n${entry_ray.to_canonical().format()}`);
                }, entry_ray);
                if (res) {
                    report_entry(key, res, entry_ray);
                }
            }
        }
        for (const t of ["import", "module", "browser", "deno", "require", "node", "main", "default"]) {
            if (t in src) {
                const res = parse_export_level((src as Record<string, unknown>)[t], report_entry, tracing ? new SparseRay(ray, `.'${t}'`) : ray);
                if (res) {
                    return res;
                }
            }
        }
    }
    return null;
}
