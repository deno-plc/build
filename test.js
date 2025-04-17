import { jsxDEV as _jsxDEV } from "preact/jsx-dev-runtime";
import { clientTerminal } from "%40deno-plc%2Fui%2Fconsole%2Fclient-terminal";
import { configure, getConsoleSink, getLogger } from "%40logtape%2Flogtape";
const logger = getLogger([
    "app"
]);
const log_config = configure({
    sinks: {
        console: getConsoleSink(),
        clientTerminal
    },
    loggers: [
        {
            category: "app",
            lowestLevel: "debug",
            sinks: [
                "console",
                "clientTerminal"
            ]
        },
        {
            category: [
                "app_nc"
            ],
            lowestLevel: "debug",
            sinks: [
                "clientTerminal"
            ]
        },
        {
            category: [
                "logtape",
                "meta"
            ],
            lowestLevel: "debug",
            sinks: [
                "console",
                "clientTerminal"
            ]
        }
    ],
    reset: true
});
import { render } from "preact";
import { App } from ".%2Fapp%2FApp.tsx";
import { get_nats, init_nats } from "%40deno-plc%2Fnats";
import { wsconnect } from "%40nats-io%2Fnats-core";
import { setup_nightly } from ".%2Fapp%2Fnightly.ts";
import { init_shortcuts } from ".%2Fapp%2Fcomponents%2Fapp%2Fshortcuts.ts";
import { encode } from "%40std%2Fmsgpack%2Fencode";
function Main() {
    return _jsxDEV(App, {}, void 0, false, {
        fileName: "file:///D:/dev/technik-app/frontend/dev.client.tsx",
        lineNumber: 62,
        columnNumber: 9
    }, this);
}
_c = Main;
async function init() {
    await log_config;
    document.body.innerHTML = "";
    setup_nightly();
    render(_jsxDEV(Main, {}, void 0, false, {
        fileName: "file:///D:/dev/technik-app/frontend/dev.client.tsx",
        lineNumber: 73,
        columnNumber: 12
    }, this), document.body);
    init_nats(wsconnect.bind(self, {
        servers: [
            "ws://localhost:1001"
        ]
    }));
    init_shortcuts();
    logger.info`initialized`;
    if (!("$nats" in window)) {
        Object.defineProperty(window, "$nats", {
            value: await get_nats()
        });
        Object.defineProperty(window, "encode", {
            value: encode
        });
        Object.defineProperty(window, "$log_nats", {
            value: async (sub)=>{
                for await (const msg of (await get_nats()).subscribe(sub)){
                    console.log(sub, msg);
                }
            }
        });
    }
}
addEventListener("load", init);
if (document.readyState === "complete") {
    init();
}
console.log("init");
var _c;
$RefreshReg$(_c, "Main");

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImZpbGU6Ly8vRDovZGV2L3RlY2huaWstYXBwL2Zyb250ZW5kL2Rldi5jbGllbnQudHN4Il0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFtQkEsU0FBUyxjQUFjLFFBQVEsK0NBQXVDO0FBQ3RFLFNBQVMsU0FBUyxFQUFFLGNBQWMsRUFBRSxTQUFTLFFBQVEsdUJBQW1CO0FBRXhFLE1BQU0sU0FBUyxVQUFVO0lBQUM7Q0FBTTtBQUVoQyxNQUFNLGFBQWEsVUFBVTtJQUN6QixPQUFPO1FBQ0gsU0FBUztRQUNUO0lBQ0o7SUFDQSxTQUFTO1FBQ0w7WUFDSSxVQUFVO1lBQ1YsYUFBYTtZQUNiLE9BQU87Z0JBQUM7Z0JBQVc7YUFBaUI7UUFDeEM7UUFDQTtZQUNJLFVBQVU7Z0JBQUM7YUFBUztZQUNwQixhQUFhO1lBQ2IsT0FBTztnQkFBQzthQUFpQjtRQUM3QjtRQUNBO1lBQ0ksVUFBVTtnQkFBQztnQkFBVzthQUFPO1lBQzdCLGFBQWE7WUFDYixPQUFPO2dCQUFDO2dCQUFXO2FBQWlCO1FBQ3hDO0tBQ0g7SUFDRCxPQUFPO0FBQ1g7QUFHQSxTQUFTLE1BQU0sUUFBUSxTQUFTO0FBQ2hDLFNBQVMsR0FBRyxRQUFRLG9CQUFnQjtBQUNwQyxTQUFTLFFBQVEsRUFBRSxTQUFTLFFBQVEscUJBQWlCO0FBQ3JELFNBQVMsU0FBUyxRQUFRLHlCQUFxQjtBQUMvQyxTQUFTLGFBQWEsUUFBUSx1QkFBbUI7QUFDakQsU0FBUyxjQUFjLFFBQVEsNENBQW9DO0FBQ25FLFNBQVMsTUFBTSxRQUFRLDRCQUFzQjtBQUU3QyxTQUFTO0lBQ0wsT0FFSSxRQUFDOzs7OztBQUtUO0tBUlM7QUFVVCxlQUFlO0lBQ1gsTUFBTTtJQUNOLFNBQVMsSUFBSSxDQUFDLFNBQVMsR0FBRztJQUMxQjtJQUNBLE9BQU8sUUFBQzs7OztjQUFTLFNBQVMsSUFBSTtJQUU5QixVQUFVLFVBQVUsSUFBSSxDQUFDLE1BQU07UUFBRSxTQUFTO1lBQUM7U0FBc0I7SUFBQztJQUNsRTtJQUNBLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN4QixJQUFJLENBQUMsQ0FBQyxXQUFXLE1BQU0sR0FBRztRQUN0QixPQUFPLGNBQWMsQ0FBQyxRQUFRLFNBQVM7WUFDbkMsT0FBTyxNQUFNO1FBQ2pCO1FBQ0EsT0FBTyxjQUFjLENBQUMsUUFBUSxVQUFVO1lBQ3BDLE9BQU87UUFDWDtRQUNBLE9BQU8sY0FBYyxDQUFDLFFBQVEsYUFBYTtZQUN2QyxPQUFPLE9BQU87Z0JBQ1YsV0FBVyxNQUFNLE9BQU8sQ0FBQyxNQUFNLFVBQVUsRUFBRSxTQUFTLENBQUMsS0FBTTtvQkFDdkQsUUFBUSxHQUFHLENBQUMsS0FBSztnQkFDckI7WUFDSjtRQUNKO0lBQ0o7QUFDSjtBQUVBLGlCQUFpQixRQUFRO0FBRXpCLElBQUksU0FBUyxVQUFVLEtBQUssWUFBWTtJQUNwQztBQUNKO0FBRUEsUUFBUSxHQUFHLENBQUMifQ==