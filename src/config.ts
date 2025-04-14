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

export interface BuildConfig {
    bundler_path_prefix?: string;
    logger?: Logger,
    root?: string,
}

export type FullConfig = Required<BuildConfig>;

export function config_defaults(config: BuildConfig): FullConfig {
    return {
        bundler_path_prefix: "/@id/",
        logger: getLogger(["app", "deno-plc", "build"]),

        ...config,

        root: join(Deno.cwd(), config.root ?? "."),
    };
}

