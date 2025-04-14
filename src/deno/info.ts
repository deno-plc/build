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

export const DenoGenericInfo = z.object({
    version: z.literal(1),

    denoDir: z.string(),

    npmCache: z.string(),
});
export type DenoGenericInfo = z.infer<typeof DenoGenericInfo>;

export async function getDenoInfo<S extends z.ZodType>(schema: S, entrypoint?: string): Promise<z.infer<S>> {
    const info = await new Deno.Command(Deno.execPath(), {
        args: ["info", "--json", entrypoint ?? ""].filter(Boolean),
        stdout: "piped",
        stderr: "piped",
    }).output();
    if (info.success) {
        return schema.parse(JSON.parse(new TextDecoder().decode(info.stdout)));
    } else {
        const error = new TextDecoder().decode(info.stderr);
        throw new Error(`Deno info failed: ${error}`);
    }
}

export const deno_info = getDenoInfo(DenoGenericInfo);
