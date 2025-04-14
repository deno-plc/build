import { Hono } from "hono";
import { config_defaults } from "./src/config.ts";
import { join, normalize, relative } from "@std/path/posix";
import { transform } from "./src/transpiler/transform.ts";
import { toFileUrl } from "@std/path/to-file-url";

const config = config_defaults({
    root: "../technik-app"
});

// const info 

const app = new Hono();

app.get("/", c => {
    return c.text("Hello World!");
});

app.get("/favicon.ico", () => {
    return fetch("https://deno.com/favicon.ico");
});

app.get("/*", async (c) => {
    const url = new URL(c.req.url);
    const normalizedPath = normalize(url.pathname);

    if (normalizedPath.startsWith(".")) {
        config.logger.warn`Path traversal attempt detected: requested='${url.pathname}' normalized='${normalizedPath}'`;
        return c.text("Access denied", 403);
    }

    const file = await Deno.readTextFile(join(config.root, normalizedPath));

    const transformed = await transform(file, toFileUrl(join(config.root, normalizedPath)));

    return c.text(transformed, 200);
});

Deno.serve({
    port: 80,
}, app.fetch);
