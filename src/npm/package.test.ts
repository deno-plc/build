import { parseNPMSpecifier } from "./package.ts";
import { format } from "@std/semver";
import { assertEquals } from "@std/assert/equals";

Deno.test("parseNPMId", () => {
    const [pkg, path] = parseNPMSpecifier("@scope/package@1.2.3/path/to/file");
    assertEquals(pkg.name, "@scope/package");
    assertEquals(format(pkg.version), "1.2.3");
    assertEquals(path, "path/to/file");
});
