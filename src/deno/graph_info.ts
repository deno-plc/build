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

import { parse } from "@std/semver/parse";
import { z } from "zod";

export const DenoModuleInfo = z.object({
    version: z.literal(1),

    denoDir: z.string(),

    npmCache: z.string(),

    modules: z.unknown().array(),

    redirects: z.record(z.string(), z.string()).transform((r) =>
        new Map(Object.entries(r))
    ),
    packages: z.record(z.string(), z.string()).transform((r) =>
        new Map(Object.entries(r))
    ),

    npmPackages: z.record(
        z.string(),
        z.object({
            name: z.string(),
            version: z.string().transform(parse),
            dependencies: z.string().array(),
            registryUrl: z.string().transform((url) => new URL(url)),
        }),
    ),
});
export type DenoModuleInfo = z.infer<typeof DenoModuleInfo>;
