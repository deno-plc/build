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

export interface NPMPackage {
    name: string;
    version: SemVer;
}

export function npmToCanonical(pkg: NPMPackage) {
    return `${pkg.name}@${format(pkg.version)}`;
}

/**
 * This is currently a stub, custom registries are not supported yet.
 * 
 * Registry information is available in graph/mod.rs::NPMPackage.registry_url
 */
export function getRegistry(_package_name: string) {
    return "registry.npmjs.org";
}

export async function getLocalPackagePath(package_name: string, version: SemVer) {
    return join((await deno_info).npmCache, getRegistry(package_name), package_name, format(version));
}
