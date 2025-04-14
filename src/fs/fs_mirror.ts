import { watch, FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";

import { Lock } from "@deno-plc/utils/lock";

export class FsMirror {
    readonly watchers: Deno.FsWatcher[];
    // readonly watcher: FSWatcher & EventEmitter;
    constructor(readonly roots: string[]) {
        // this.watcher = watch(root, {

        // });// as FSWatcher & EventEmitter;

        // this.watcher.on("change", (path: string) => {
        //     console.log("change", path);
        // });

        this.watchers = roots.map((root) => {
            const watcher = Deno.watchFs(root, {
                recursive: true,
            });
            this.#run_watcher(watcher);
            return watcher;
        });
    }

    async #run_watcher(watcher: Deno.FsWatcher) {
        for await (const event of watcher) {
            console.log(event.kind, event.paths);
            switch (event.kind) {
                case "create": {
                    // const f = this.get(event)
                }
            }
        }
    }

    public get(path: string): FsMirrorFile {
        return new FsMirrorFile(this, path);
    }
}

export class FsMirrorFile {
    mirrored: boolean = false;
    valid: boolean = false;
    hash: string = "";
    content = new Uint8Array(0);

    constructor(readonly mirror: FsMirror, readonly path: string) {

    }

    // #reading = new Lock(false);
    #reading = new Set<symbol>();

    async #read() {
        const token = Symbol();
        this.#reading.add(token);
        try {

            const content = await Deno.readFile(this.path);
            const hash = await crypto.subtle.digest("SHA-256", content);
        } finally {
            this.#reading.delete(token);
        }

    }

    changed() {

    }

    removed() {

    }
}



