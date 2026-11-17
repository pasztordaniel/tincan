// Dev only: ng serve forwards socket.io (polling and WebSocket) to the tincan server.
// The target is fixed at the server's default port. It deliberately does not follow PORT:
// ng serve reads PORT for its own listen port, so setting it during `npm run dev` would put
// both processes on the same port.
export default {
  '/socket.io': {
    target: 'http://localhost:3000',
    ws: true,
    // changeOrigin must stay off: the server compares Origin with Host, and the browser's
    // Origin is the ng serve address, so the Host header has to stay the ng serve address too.
    changeOrigin: false,
  },
};
