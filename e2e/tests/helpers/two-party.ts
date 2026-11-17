import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const PICK_UP = { name: 'Pick up' };

/** Everything a spec needs to check that a key never left the browser, collected from one page. */
export class Traffic {
  readonly urls: string[] = [];
  readonly headersAndBodies: string[] = [];
  readonly wsFrames: string[] = [];
  private readonly pending: Promise<void>[] = [];

  constructor(page: Page) {
    page.on('request', (req) => {
      this.urls.push(req.url());
      this.headersAndBodies.push(req.postData() ?? '');
      this.pending.push(
        req.allHeaders().then(
          (headers) => void this.headersAndBodies.push(JSON.stringify(headers)),
          () => undefined,
        ),
      );
    });
    page.on('websocket', (ws) => {
      ws.on('framesent', (f) => this.wsFrames.push(String(f.payload)));
      ws.on('framereceived', (f) => this.wsFrames.push(String(f.payload)));
    });
  }

  async everything(): Promise<string[]> {
    await Promise.all(this.pending);
    return [...this.urls, ...this.headersAndBodies, ...this.wsFrames];
  }
}

export interface Thread {
  sessionId: string;
  key: string;
  link: string;
}

/** Sender side: create a thread from the home page, read the link and join the sender view. */
export async function startThread(sender: Page): Promise<Thread> {
  await sender.goto('/');
  await sender.getByRole('button', { name: 'New thread' }).click();
  const link = await sender.getByLabel('Thread link').inputValue();
  const match = /^(.+)\/r\/([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})$/.exec(link);
  expect(match, 'link is <origin>/r/<id>#<key>').not.toBeNull();
  await sender.getByRole('link', { name: 'Join' }).click();
  await expect(sender).toHaveURL(/\/s$/);
  await expect(sender.getByText('Waiting for the other can...')).toBeVisible();
  return { sessionId: match![2]!, key: match![3]!, link };
}

/** Receiver side: open the link and pick up. Resolves once the live view is showing. */
export async function pickUp(receiver: Page, link: string): Promise<void> {
  await receiver.goto(link);
  await receiver.getByRole('button', PICK_UP).click();
  await expect(receiver.getByRole('heading', { name: 'Their can' })).toBeVisible();
}

export async function newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Exact text of the receiver's reader (not whitespace-normalised, unlike toHaveText). */
export function readerText(receiver: Page): () => Promise<string | null> {
  return () => receiver.locator('.reader__text').textContent();
}

export const INTEGRITY_WARNING = (receiver: Page) =>
  receiver.getByText('Something tampered with the line.');
