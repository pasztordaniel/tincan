# 0003 — Minimal Express + socket.io relay

**Context.** The backend only relays opaque frames between two sockets. Considered: NestJS (structure close to Angular),
Express + `ws`, Express + socket.io, SSE + POST.

**Decision.** Express (static files + headers) and socket.io (rooms, reconnection, acks), one process, one port.

**Consequences.** ~100–200 lines of server code that is easy to audit; reconnection handled by a mature library.
NestJS would add modules/DI for no domain logic. socket.io adds a client dependency and its own framing on top of WebSocket.
