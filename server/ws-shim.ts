// Workers build only: wrangler aliases the `ws` package to the runtime's own WebSocket.
export default globalThis.WebSocket;
