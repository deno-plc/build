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

import { format } from "@std/semver/format";
import type { SemVer } from "@std/semver/types";
import { join } from "@std/path/join";
import { deno_info } from "../deno/info.ts";
import { z } from "zod";
import { parse as parseSemver } from "@std/semver";

export const NPMPackage = z.object({
    name: z.string(),
    version: z.string().transform(parseSemver),
});
export type NPMPackage = z.infer<typeof NPMPackage>;

export const NPMPackageMetadata = z.object({
    registry_url: z.string().transform((url) => new URL(url)),
    dependencies: z.array(NPMPackage).transform(deps => new Map(deps.map(dep => [dep.name, dep.version]))),
});
export type NPMPackageMetadata = z.infer<typeof NPMPackageMetadata>;

export function npmToCanonical(pkg: NPMPackage) {
    return `${pkg.name}@${format(pkg.version)}`;
}

export function parseNPMSpecifier(specifier: string): [NPMPackage, string | undefined] {
    const parts = specifier.split("/");
    const package_id = (parts[0][0] === "@" ? parts.shift()! + "/" : "") + parts.shift()!;
    const at_pos = package_id.indexOf("@", 1);
    const name = package_id.slice(0, at_pos);
    const version = package_id.slice(at_pos + 1);

    const path = parts.join("/");

    return [{
        name,
        version: parseSemver(version),
    }, path || undefined];
}

export async function fetchPackageMetadata(pkg: NPMPackage) {
    const api_url = new URL("http://[::1]:3000/api/v1/npm/metadata");
    api_url.searchParams.set("name", pkg.name);
    api_url.searchParams.set("version", format(pkg.version));
    const response = await fetch(api_url);
    if (response.ok) {
        const data = await response.json();
        return NPMPackageMetadata.parse(data);
    } else {
        throw new Error(`Failed to fetch package metadata: ${response.statusText}`);
    }
}

/**
 * This is currently a stub, custom registries are not supported yet.
 * 
 * Registry information is available in graph/mod.rs::NPMPackage.registry_url
 */
export function getRegistry(_package_name: string, _version: SemVer) {
    return Promise.resolve("registry.npmjs.org");
}

export async function getLocalPackagePath(package_name: string, version: SemVer) {
    return join((await deno_info).npmCache, await getRegistry(package_name, version), package_name, format(version));
}
