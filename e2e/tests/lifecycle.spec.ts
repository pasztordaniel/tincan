import { expect, test, type Browser, type Page } from '@playwright/test';
import { installFlakyLink, type FlakyLink } from './helpers/flaky-link.js';

const RECONNECTING = 'Line is slack, reconnecting...';
// Well under the 20 s grace: an explicit leave must reach the peer immediately.
const FAST = { timeout: 5_000 };

interface Pair {
  sender: Page;
  receiver: Page;
  /** Only present when asked for: routing the socket through Playwright adds a hop, which the
   * leave tests must not have (they check the real, direct disconnect on pagehide). */
  senderLink?: FlakyLink;
  receiverLink?: FlakyLink;
  close(): Promise<void>;
}

/** Real sender UI on `/` and real receiver UI on the link, both connected and showing live text. */
async function connectedPair(browser: Browser, baseURL: string, flaky = false): Promise<Pair> {
  const senderContext = await browser.newContext({ baseURL });
  const receiverContext = await browser.newContext({ baseURL });
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const senderLink = flaky ? await installFlakyLink(sender) : undefined;
  const receiverLink = flaky ? await installFlakyLink(receiver) : undefined;

  await sender.goto('/');
  await sender.getByRole('button', { name: 'New thread' }).click();
  const link = await sender.getByLabel('Thread link').inputValue();
  await sender.getByRole('link', { name: 'Join' }).click();
  await expect(sender.getByText('Waiting for the other can...')).toBeVisible();

  await receiver.goto(link);
  await receiver.getByRole('button', { name: 'Pick up' }).click();
  await expect(receiver.getByText('Connected', { exact: true })).toBeVisible();
  await expect(sender.getByText('Connected: they can hear you')).toBeVisible();

  await sender.getByLabel('Text to send').fill('first words');
  await expect(receiver.getByText('first words')).toBeVisible();
  return {
    sender,
    receiver,
    senderLink,
    receiverLink,
    close: async () => {
      await senderContext.close();
      await receiverContext.close();
    },
  };
}

test.describe('lifecycle', () => {
  test('a sender network drop resumes and the receiver gets the latest text', async ({
    browser,
    baseURL,
  }) => {
    const pair = await connectedPair(browser, baseURL!, true);
    try {
      await pair.senderLink!.drop();
      await expect(pair.sender.getByText(RECONNECTING)).toBeVisible();
      await expect(pair.receiver.getByText(RECONNECTING)).toBeVisible();

      // Typed while offline: only the newest state is kept and sent after the resume.
      await pair.sender.getByLabel('Text to send').fill('typed while offline');
      pair.senderLink!.restore();

      await expect(pair.sender.getByText('Connected: they can hear you')).toBeVisible();
      await expect(pair.receiver.getByText('typed while offline')).toBeVisible();
      await expect(pair.receiver.getByText('Connected', { exact: true })).toBeVisible();
      await expect(pair.receiver.getByText('Line cut')).toHaveCount(0);
    } finally {
      await pair.close();
    }
  });

  test('a receiver network drop resumes and shows the latest text', async ({
    browser,
    baseURL,
  }) => {
    const pair = await connectedPair(browser, baseURL!, true);
    try {
      await pair.receiverLink!.drop();
      await expect(pair.receiver.getByText(RECONNECTING)).toBeVisible();
      await expect(pair.sender.getByText(RECONNECTING)).toBeVisible();

      // The sender keeps typing while the receiver is away.
      await pair.sender.getByLabel('Text to send').fill('said while you were gone');
      pair.receiverLink!.restore();

      await expect(pair.receiver.getByText('said while you were gone')).toBeVisible();
      await expect(pair.receiver.getByText('Connected', { exact: true })).toBeVisible();
      await expect(pair.sender.getByText('Connected: they can hear you')).toBeVisible();
    } finally {
      await pair.close();
    }
  });

  test('reloading the sender ends the session for both sides at once', async ({
    browser,
    baseURL,
  }) => {
    const pair = await connectedPair(browser, baseURL!);
    try {
      await pair.sender.reload();
      // The key is gone with the page: the receiver is told right away, the old text stays readable.
      await expect(pair.receiver.getByText('Line cut')).toBeVisible(FAST);
      await expect(pair.receiver.getByText('first words')).toBeVisible();
      // The reloaded sender has no session any more and starts over from home.
      await expect(pair.sender.getByRole('button', { name: 'New thread' })).toBeVisible();
    } finally {
      await pair.close();
    }
  });

  test('closing the receiver ends the session for the sender at once', async ({
    browser,
    baseURL,
  }) => {
    const pair = await connectedPair(browser, baseURL!);
    try {
      await pair.receiver.close({ runBeforeUnload: true });
      await expect(pair.sender.getByText('Line cut')).toBeVisible(FAST);
      await expect(pair.sender.getByLabel('Text to send')).toHaveJSProperty('readOnly', true);
    } finally {
      await pair.close();
    }
  });

  test('reloading the receiver ends the session for the sender at once', async ({
    browser,
    baseURL,
  }) => {
    const pair = await connectedPair(browser, baseURL!);
    try {
      await pair.receiver.reload();
      await expect(pair.sender.getByText('Line cut')).toBeVisible(FAST);
      // The reloaded receiver has no key any more.
      await expect(pair.receiver.getByRole('heading', { name: 'Link already used' })).toBeVisible();
    } finally {
      await pair.close();
    }
  });

  test('a receiver that navigates away and back sees neither the old text nor a live line', async ({
    browser,
    baseURL,
  }) => {
    const pair = await connectedPair(browser, baseURL!);
    try {
      await pair.receiver.goto('/');
      await expect(pair.sender.getByText('Line cut')).toBeVisible(FAST);
      // Restored from bfcache or reloaded, the page must not hold the key or the plaintext any more.
      await pair.receiver.goBack();
      await expect(pair.receiver.getByRole('heading', { name: 'Link already used' })).toBeVisible();
      await expect(pair.receiver.getByText('first words')).toHaveCount(0);
    } finally {
      await pair.close();
    }
  });
});
