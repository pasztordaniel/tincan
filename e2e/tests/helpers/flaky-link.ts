import type { Page, WebSocketRoute } from '@playwright/test';

/**
 * Test-only switch for a page's relay WebSocket. `context.setOffline(true)` does not close a
 * WebSocket that is already open in Chromium, so a drop is simulated by routing the page's socket.io
 * WebSocket through Playwright: `drop()` closes the open connections (the relay sees a plain transport
 * close, like a lost network) and refuses new ones until `restore()`. Call before the first navigation.
 */
export interface FlakyLink {
  drop(): Promise<void>;
  restore(): void;
}

export async function installFlakyLink(page: Page): Promise<FlakyLink> {
  let down = false;
  const open = new Set<{ page: WebSocketRoute; server: WebSocketRoute }>();
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (down) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    const pair = { page: ws, server };
    open.add(pair);
    ws.onClose(() => open.delete(pair));
  });
  return {
    async drop() {
      down = true;
      for (const pair of [...open]) {
        await pair.server.close();
        await pair.page.close();
      }
    },
    restore() {
      down = false;
    },
  };
}
