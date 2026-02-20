import { Colony } from '../Colony.js';
export interface ServerOptions {
    port?: number;
    colony: Colony;
}
export declare function createColonyServer(options: ServerOptions): {
    app: import("express-serve-static-core").Express;
    server: import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>;
    wss: import("ws").Server<typeof import("ws"), typeof import("node:http").IncomingMessage>;
    start: () => Promise<void>;
};
