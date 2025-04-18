import { Hono } from "hono";
import { config_defaults } from "./src/config.ts";
import { join, normalize, relative } from "@std/path/posix";
import { transform } from "./src/transpiler/transform.ts";
import { toFileUrl } from "@std/path/to-file-url";
import { NPMPackage } from "./src/npm/package.ts";
import { format, parse } from "@std/semver";
import { NPMCompiler } from "./src/npm/compiler.ts";
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
    sinks: {
        console: getConsoleSink(),
    },
    loggers: [
        {
            category: ["app"],
            sinks: ["console"],
            lowestLevel: "debug",
        },
        {
            category: ["logtape", "meta"],
            lowestLevel: "warning",
        }
    ]
});

const config = config_defaults({
    root: "../technik-app"
});

const npm_compiler = new NPMCompiler(config);

// const info 

const app = new Hono();

app.get("/", c => {
    return c.html(`
<!DOCTYPE html>
<html class="color-brand">
                <head>
                    <title>LMGU-Technik Dashboard (Development Mode)</title>
                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1"
                    />
                    
                    <!--<script type="module" src="/dev-assets/tailwind-play" async />

                    <script type="module" src="/@vite/client" async />-->
                    <script type="module" src="/frontend/dev.client.tsx" async></script>

                    <!--<script type="module" src="/@id/@xterm/xterm/css/xterm.css" async />-->
                </head>
                <body>
                    <span class="bg-[#111] text-brand flex flex-row items-center justify-center w-full h-full">
                        loading...
                    </span>
                </body>
            </html>
            `);
});

app.get("/favicon.ico", () => {
    return fetch("https://deno.com/favicon.ico");
});

app.get("/@module/error/:id", c => {
    return new Response(`throw new Error(${JSON.stringify(`Failed to import module: ${decodeURIComponent(c.req.param("id"))}`)});`, {
        headers: {
            "Content-Type": "application/javascript;charset=UTF-8",
            "Cache-Control": "no-store",
        },
    });
});

app.get("/@module/:id", async c => {
    let module_id;
    try {
        module_id = new URL(decodeURIComponent(c.req.param("id")));
    } catch (_e) {
        return c.text("Invalid module id", 400);
    }

    return await serveModule(module_id);
});

app.get("/@npm/:package/:version/:file", async c => {
    // const full_import = decodeURIComponent(c.req.param("id"));
    // console.log("Full import:", full_import);
    // let subpath_pos = full_import.indexOf("/", 1);
    // if (subpath_pos === -1) {
    //     subpath_pos = full_import.length;
    // }
    // const [name, version] = full_import.slice(0, subpath_pos).split("@");
    // const subpath = full_import.slice(subpath_pos + 1);

    const name = decodeURIComponent(c.req.param("package"));
    const version = parse(c.req.param("version"));
    let subpath = decodeURIComponent(c.req.param("file"));

    if (subpath.startsWith("/")) {
        subpath = "." + subpath;
    } else if (!subpath.startsWith(".")) {
        subpath = "./" + subpath;
    }

    if (subpath.endsWith("/")) {
        subpath = subpath.slice(0, -1);
    }

    // console.log({ name, version, subpath });

    const pkg_id: NPMPackage = {
        name,
        version,
    };

    const pkg = await npm_compiler.get_compiled(pkg_id);

    // let subpath

    // console.log(pkg.exports);
    // pkg.

    const file = pkg.get_export(subpath);

    return c.redirect(`/@npm-src/${encodeURIComponent(name)}/${format(version)}/${file}`);

    // return c.text("ok");
});

app.get("/@npm/:package/:version", async c => {
    const name = decodeURIComponent(c.req.param("package"));
    const version = parse(c.req.param("version"));

    const pkg_id: NPMPackage = {
        name,
        version,
    };

    const pkg = await npm_compiler.get_compiled(pkg_id);

    if (name === "util") {
        console.log("Util package:", pkg);
    }

    const file = pkg.get_export(".");

    if (!file) {
        return c.text("File not found", 404);
    }

    return c.redirect(`/@npm-src/${encodeURIComponent(name)}/${format(version)}/${file}`);
});

// async function getNPMRedirect

app.get("/@npm-src/:package/:version/*", async c => {
    const name = decodeURIComponent(c.req.param("package"));
    const version = (c.req.param("version"));
    const url = new URL(c.req.url);
    const path = url.pathname.split(`${version}/`)[1];
    // const file = decodeURIComponent(c.req.param("file"));

    const pkg_id: NPMPackage = {
        name,
        version: parse(version),
    };

    const pkg = await npm_compiler.get_compiled(pkg_id);

    const file = pkg.get_file(path);

    if (!file) {
        return c.text("File not found", 404);
    } else {
        return c.body(file.contents, 200, {
            "Content-Type": "text/javascript;charset=UTF-8",
            "Cache-Control": "no-store",
        });
    }
});

app.get("/*", async (c) => {
    const url = new URL(c.req.url);
    const normalizedPath = normalize(url.pathname);

    if (normalizedPath.startsWith(".")) {
        config.logger.warn`Path traversal attempt detected: requested='${url.pathname}' normalized='${normalizedPath}'`;
        return c.text("Access denied", 403);
    }

    // const file = await Deno.readTextFile(join(config.root, normalizedPath));

    // console.log("File:", file);

    const module_id = toFileUrl(join(config.root, normalizedPath));

    return await serveModule(module_id);
});

async function serveModule(specifier: URL) {
    const api_url = new URL("http://[::1]:3000/api/v1/transform/module");

    api_url.searchParams.set("module", specifier.href);

    const res = await fetch(api_url);

    if (res.ok) {
        return new Response((await res.json()).result.code, {
            headers: {
                "Content-Type": "application/javascript",
                "Cache-Control": "no-store",
            },
        });
    } else {
        console.log("Error:", res.status, res.statusText, specifier.href);
        return new Response("Module not found", {
            status: 404,
            headers: {
                "Content-Type": "text/plain",
                "Cache-Control": "no-store",
            },
        });
    }
}

Deno.serve({
    port: 80,
}, app.fetch);
