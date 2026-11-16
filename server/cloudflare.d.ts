// Minimal typing for the Workers runtime module used by server/worker.ts.
declare module "cloudflare:node" {
  export function httpServerHandler(options: { port: number }): { fetch: (...args: any[]) => Promise<Response> };
}
