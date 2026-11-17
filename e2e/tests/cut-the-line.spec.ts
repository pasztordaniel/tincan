import { expect, test, type Browser, type Page } from '@playwright/test';

// An explicit leave reaches the peer at once, far below the 20 s grace.
const FAST = { timeout: 5_000 };

interface Pair {
  sender: Page;
  receiver: Page;
  close(): Promise<void>;
}

/** Real sender UI and real receiver UI on the link, both connected and showing live text. */
async function connectedPair(browser: Browser, baseURL: string): Promise<Pair> {
  const senderContext = await browser.newContext({ baseURL });
  const receiverContext = await browser.newContext({ baseURL });
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();

  await sender.goto('/');
  await sender.getByRole('button', { name: 'New thread' }).click();
  const link = await sender.getByLabel('Thread link').inputValue();
  await sender.getByRole('link', { name: 'Join' }).click();
  await expect(sender.getByText('Waiting for the other can...')).toBeVisible();

  await receiver.goto(link);
  await receiver.getByRole('button', { name: 'Pick up' }).click();
  await expect(sender.getByText('Connected: they can hear you')).toBeVisible();
  await sender.getByLabel('Text to send').fill('last words');
  await expect(receiver.getByText('last words')).toBeVisible();
  return {
    sender,
    receiver,
    close: async () => {
      await senderContext.close();
      await receiverContext.close();
    },
  };
}

test.describe('cut the line', () => {
  test('the sender cuts: both sides show the ended state, the receiver keeps the last text', async ({
    browser,
    baseURL,
  }) => {
    const { sender, receiver, close } = await connectedPair(browser, baseURL!);
    try {
      await sender.getByRole('button', { name: 'Cut the line' }).click();
      // The first tap only asks: nothing has ended yet.
      await expect(sender.getByRole('group', { name: 'Cut the line?' })).toBeVisible();
      await expect(sender.getByRole('button', { name: 'Keep talking' })).toBeFocused();
      await expect(receiver.getByText('The line is cut')).toHaveCount(0);
      await expect(receiver.getByRole('button', { name: 'Cut the line' })).toBeVisible();
      await sender.getByRole('button', { name: 'Cut it' }).click();

      await expect(receiver.getByText('The line is cut')).toBeVisible(FAST);
      await expect(receiver.getByText('last words')).toBeVisible();
      await expect(receiver.getByRole('button', { name: 'Cut the line' })).toHaveCount(0);

      await expect(sender.getByText('You cut the line')).toBeVisible(FAST);
      await expect(sender.locator('app-warning-banner')).toBeFocused();
      await expect(sender.getByLabel('Text to send')).toHaveValue('last words');
      await expect(sender.getByLabel('Text to send')).not.toBeEditable();
      await expect(sender.getByRole('button', { name: 'Cut the line' })).toHaveCount(0);
    } finally {
      await close();
    }
  });

  test('the receiver cuts: both sides show the ended state', async ({ browser, baseURL }) => {
    const { sender, receiver, close } = await connectedPair(browser, baseURL!);
    try {
      await receiver.getByRole('button', { name: 'Cut the line' }).click();
      await receiver.getByRole('button', { name: 'Cut it' }).click();

      await expect(sender.getByText('The line is cut')).toBeVisible(FAST);
      await expect(sender.getByLabel('Text to send')).not.toBeEditable();
      await expect(receiver.getByText('You cut the line')).toBeVisible(FAST);
      await expect(receiver.getByText('last words')).toBeVisible();
      await expect(receiver.getByRole('button', { name: 'Cut the line' })).toHaveCount(0);
    } finally {
      await close();
    }
  });

  test('Escape and Keep talking back out without ending anything', async ({ browser, baseURL }) => {
    const { sender, receiver, close } = await connectedPair(browser, baseURL!);
    try {
      await sender.getByRole('button', { name: 'Cut the line' }).click();
      await sender.keyboard.press('Escape');
      await expect(sender.getByRole('button', { name: 'Cut the line' })).toBeFocused();
      await expect(sender.getByRole('group', { name: 'Cut the line?' })).toHaveCount(0);

      await receiver.getByRole('button', { name: 'Cut the line' }).click();
      await receiver.getByRole('button', { name: 'Keep talking' }).click();

      // The line is still open: text still flows.
      await sender.getByLabel('Text to send').fill('still here');
      await expect(receiver.getByText('still here')).toBeVisible();
      await expect(receiver.getByText('The line is cut')).toHaveCount(0);
    } finally {
      await close();
    }
  });
});
