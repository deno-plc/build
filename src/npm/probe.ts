import { getLogger } from "@logtape/logtape";

const logger = getLogger(["app", "build", "npm", "probe"]);

export async function nodeProbe(path: string): Promise<string | null> {
    for (const try_addition of ["", ".js", ".mjs", ".cjs", "/index.js"]) {
        const new_path = path + try_addition;
        if (try_addition) {
            logger.warn`Probing ${new_path}`;
        }
        if (await Deno.stat(new_path).then(() => true).catch(() => false)) {
            return new_path;
        }
    }
    return null;
}

export async function nodeProbeAddition(path: string): Promise<string | null> {
    for (const try_addition of ["", ".js", ".mjs", ".cjs", "/index.js"]) {
        const new_path = path + try_addition;
        if (try_addition) {
            logger.warn`Probing ${new_path}`;
        }
        if (await Deno.stat(new_path).then(() => true).catch(() => false)) {
            return try_addition;
        }
    }
    return null;
}
