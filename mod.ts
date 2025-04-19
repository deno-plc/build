import { Hono } from "hono";
import { type BuildConfig, config_defaults } from "./src/config.ts";
import { join, normalize } from "@std/path/posix";
import { toFileUrl } from "@std/path/to-file-url";
import type { NPMPackage } from "./src/npm/package.ts";
import { format, parse } from "@std/semver";
import { NPMCompiler } from "./src/npm/compiler.ts";
import { assert } from "node:console";
import { deno_info } from "./src/deno/info.ts";
import { serveFile } from "@std/http/file-server";

export function deno_plc_build(config_options: BuildConfig = {}): Hono {
    const config = config_defaults(config_options);

    const npm_compiler = new NPMCompiler(config);

    const app = new Hono();

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

        return await serveModule(module_id) ?? c.text("Module not found", 404);
    });

    app.get("/@npm/:package/:version/:file", async c => {
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

        if (config.cdn.includes(name)) {
            return c.redirect(new URL(`https://esm.sh/${name}@${format(version)}/${subpath}`));
        }

        const pkg_id: NPMPackage = {
            name,
            version,
        };

        const pkg = await npm_compiler.get_compiled(pkg_id);

        const file = pkg.get_export(subpath);

        return c.redirect(`/@npm-src/${encodeURIComponent(name)}/${format(version)}/${file}`);
    });

    app.get("/@npm/:package/:version", async c => {
        const name = decodeURIComponent(c.req.param("package"));
        const version = parse(c.req.param("version"));

        if (config.cdn.includes(name)) {
            return c.redirect(new URL(`https://esm.sh/${name}@${format(version)}`));
        }

        const pkg_id: NPMPackage = {
            name,
            version,
        };

        const pkg = await npm_compiler.get_compiled(pkg_id);

        const file = pkg.get_export(".");

        if (!file) {
            return c.text("File not found", 404);
        }

        return c.redirect(`/@npm-src/${encodeURIComponent(name)}/${format(version)}/${file}`);
    });

    app.get("/@npm-src/:package/:version/*", async c => {
        const name = decodeURIComponent(c.req.param("package"));
        const version = (c.req.param("version"));
        const url = new URL(c.req.url);
        const path = url.pathname.split(`${version}/`)[1];

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

    app.get("/@npm-data/*", async c => {
        const url = new URL(c.req.url);

        const path = url.pathname.split("/@npm-data/")[1];

        assert(!path.includes(".."), "Path traversal attempt detected");

        const real_path = join((await deno_info).npmCache, path);

        return serveFile(c.req.raw, real_path);
    });

    app.get("/*", async (c, next) => {
        const url = new URL(c.req.url);
        const normalizedPath = normalize(url.pathname);

        if (normalizedPath.startsWith(".")) {
            config.logger.warn`Path traversal attempt detected: requested='${url.pathname}' normalized='${normalizedPath}'`;
            return c.text("Access denied", 403);
        }

        const module_id = toFileUrl(join(config.root, normalizedPath));

        return (await serveModule(module_id)) ?? await next();
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
            return null;
        }
    }

    return app;
}
