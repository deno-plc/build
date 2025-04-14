import console from "node:console";

const dep_file = await Deno.readTextFile("./deps.txt");
const deps = new Set(dep_file.split("\n").map(dep => dep.endsWith(" (*)") ? dep.slice(0, -4) : dep));
for (const $ of deps) {
    console.log($);
}
console.log(deps.size);
