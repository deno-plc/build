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

import { type Ray, SparseRay } from "../ray.ts";

export class KeyTree {
    keys = new Map<string, KeyTree>();
    strings = new Set<string>();
    is_nullish = false;

    public append(o: object | string | null, ray: Ray) {
        if (typeof o === "string") {
            this.strings.add(o);
        } else if (o) {
            if (o instanceof Array) {
                //                 throw new Error(`Encountered Array:
                // ${ray.to_canonical().format()}`);
                let i = 0;
                for (const entry of o) {
                    this.append(entry, new SparseRay(ray, `KeyTree: ${i}`));
                    i++;
                }
            } else {
                for (const [key, value] of Object.entries(o)) {
                    const child_ray = new SparseRay(ray, `KeyTree: '${key}'`);
                    if (this.keys.has(key)) {
                        this.keys.get(key)!.append(value, child_ray);
                    } else {
                        const t = new KeyTree();
                        this.keys.set(key, t);
                        t.append(value, child_ray);
                    }
                }
            }

        } else {
            this.is_nullish = true;
        }
    }

    public format(): object {
        const o: Record<string, unknown> = {
            "strings": Array.from(this.strings),
            "is_nullish": this.is_nullish,
        };
        for (const [key, value] of this.keys) {
            o[key] = value.format();
        }
        return o;
    }
}
