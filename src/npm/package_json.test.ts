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

import { join } from "@std/path/join";
import { PackageJson } from "./package_json.ts";
import { toFileUrl } from "@std/path/to-file-url";
// import { deno_info } from "../deno/info.ts";

/**
 * returns a list of all npm packages into global deno cache for testing
 */
async function* test_npm_packages(): AsyncGenerator<
    [package_name: string, string]
> {
    const { deno_info } = await import("../deno/info.ts");
    const npm_cache = join((await deno_info).npmCache, "registry.npmjs.org");
    for await (const entry of Deno.readDir(npm_cache)) {
        if (entry.isDirectory) {
            if (entry.name.startsWith("@")) {
                for await (
                    const subentry of Deno.readDir(join(npm_cache, entry.name))
                ) {
                    if (subentry.isDirectory) {
                        yield [
                            `${entry.name}/${subentry.name}`,
                            join(npm_cache, entry.name, subentry.name),
                        ];
                    }
                }
            } else {
                yield [entry.name, join(npm_cache, entry.name)];
            }
        }
    }
}

async function* test_npm_package_versions(): AsyncGenerator<
    [package_name: string, version: string, string]
> {
    for await (const [package_name, package_dir] of test_npm_packages()) {
        for await (const entry of Deno.readDir(package_dir)) {
            if (entry.isDirectory) {
                yield [
                    package_name,
                    entry.name,
                    join(package_dir, entry.name),
                ];
            }
        }
    }
}

Deno.test("NPM Package.json parser", async () => {
    for await (
        const [package_name, version, package_dir]
            of test_npm_package_versions()
    ) {
        const package_json_path = join(package_dir, "package.json");

        if (await Deno.stat(package_json_path).catch(() => false)) {
            const package_json = await PackageJson.load(
                toFileUrl(package_json_path),
            );
            package_json.export_map();
        } else {
            throw new Error(
                `package.json not found for ${package_name}@${version}`,
            );
        }
    }

    // await Deno.writeTextFile(
    //     "./package.json.tree.json",
    //     JSON.stringify(tree.format(), null, 4),
    // );
});
