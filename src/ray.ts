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

import { assert } from "@std/assert/assert";

export interface Ray {
    to_canonical(): CanonicalRay;
    type: "canonical" | "sparse";
}

export class CanonicalRay implements Ray {
    readonly type = "canonical";
    constructor(readonly steps: string[]) {

    }

    to_canonical(): CanonicalRay {
        return this;
    }

    append_steps(steps: string[]): CanonicalRay {
        return new CanonicalRay([...this.steps, ...steps]);
    }

    format(): string {
        if (tracing) {
            return `Trace:\n${this.steps.map((step, i) => `${`[${i}]`.padStart(2, " ")} ${step}`).join("\n")}`;
        } else {
            return `Set tracing = true to display a backtrace.`;
        }
    }
}

export class SparseRay implements Ray {
    readonly type = "sparse";
    constructor(readonly parent: Ray, readonly step: string) {

    }

    to_canonical(): CanonicalRay {
        const steps: string[] = [];
        let i = this as Ray;
        while (i instanceof SparseRay) {
            steps.push(i.step);
            i = i.parent;
        }
        assert(i instanceof CanonicalRay);
        return i.append_steps(steps.reverse());
    }
}

export const tracing = true;
