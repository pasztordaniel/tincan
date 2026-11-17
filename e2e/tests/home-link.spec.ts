import { expect, test, type Browser, type Page } from '@playwright/test';
import { PICK_UP, startThread } from './helpers/two-party.js';

// An explicit leave reaches the peer at once, far below the 20 s grace.
const FAST = { timeout: 5_000 };

interface Pair {
  sender: Page;
  receiver: Page;
  link: string;
  close(): Promise<void>;
}

/** Real sender UI and real receiver UI on the link; `pickUp: false` leaves the receiver at the gate. */
async function pair(browser: Browser, baseURL: string, pickUp = true): Promise<Pair> {
  const senderContext = await browser.newContext({ baseURL });
  const receiverContext = await browser.newContext({ baseURL });
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const { link } = await startThread(sender);
  await receiver.goto(link);
  if (pickUp) {
    await receiver.getByRole('button', PICK_UP).click();
    await expect(sender.getByText('Connected: they can hear you')).toBeVisible();
    await sender.getByLabel('Text to send').fill('last words');
    await expect(receiver.getByText('last words')).toBeVisible();
  }
  return {
    sender,
    receiver,
    link,
    close: async () => {
      await senderContext.close();
      await receiverContext.close();
    },
  };
}

const home = (page: Page) => page.getByRole('link', { name: 'tincan home' });
const question = (page: Page) => page.getByRole('group', { name: 'Leave and cut the line?' });

test.describe('home link', () => {
  test('is a link to / on every page but home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New thread' })).toBeVisible();
    await expect(home(page)).toHaveCount(0);
    await page.goto('/design');
    await expect(home(page).first()).toHaveAttribute('href', '/');
    await home(page).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(home(page)).toHaveCount(0);
  });

  test('the sender leaves mid-line: asks first, then the receiver sees the cut and Back does not restore it', async ({
    browser,
    baseURL,
  }) => {
    const { sender, receiver, close } = await pair(browser, baseURL!);
    try {
      await home(sender).click();
      await expect(question(sender)).toBeVisible();
      await expect(sender.getByRole('button', { name: 'Stay' })).toBeFocused();
      await expect(sender).toHaveURL(/\/s$/);

      // Stay and Escape back out; the line keeps working.
      await sender.getByRole('button', { name: 'Stay' }).click();
      await expect(question(sender)).toHaveCount(0);
      await expect(home(sender)).toBeFocused();
      await home(sender).press('Enter');
      await expect(question(sender)).toBeVisible();
      await sender.keyboard.press('Escape');
      await expect(question(sender)).toHaveCount(0);
      await expect(home(sender)).toBeFocused();
      await sender.getByLabel('Text to send').fill('still here');
      await expect(receiver.getByText('still here')).toBeVisible();
      await expect(receiver.getByText('The line is cut')).toHaveCount(0);

      await home(sender).click();
      await sender.getByRole('button', { name: 'Leave' }).click();
      await expect(sender).toHaveURL(/\/$/);
      await expect(sender.getByRole('button', { name: 'New thread' })).toBeVisible();
      await expect(receiver.getByText('The line is cut')).toBeVisible(FAST);
      await expect(receiver.getByText('still here')).toBeVisible();

      await sender.goBack();
      // The guard has nothing to show: the session ended with the page.
      await expect(sender.getByRole('button', { name: 'New thread' })).toBeVisible();
      await expect(sender).toHaveURL(/\/$/);
      await expect(sender.getByLabel('Text to send')).toHaveCount(0);
    } finally {
      await close();
    }
  });

  test('the receiver leaves mid-line: the sender sees the cut, the key is gone, Back says the link was used', async ({
    browser,
    baseURL,
  }) => {
    const { sender, receiver, close } = await pair(browser, baseURL!);
    try {
      await home(receiver).click();
      await expect(question(receiver)).toBeVisible();
      await expect(receiver).toHaveURL(/\/r\//);
      await receiver.getByRole('button', { name: 'Leave' }).click();
      await expect(receiver).toHaveURL(/\/$/);
      await expect(sender.getByText('The line is cut')).toBeVisible(FAST);
      await expect(sender.getByLabel('Text to send')).not.toBeEditable();

      await receiver.goBack();
      await expect(receiver.getByText('Link already used')).toBeVisible();
      expect(new URL(receiver.url()).hash).toBe('');
      await expect(receiver.getByText('last words')).toHaveCount(0);
      await expect(receiver.getByRole('button', PICK_UP)).toHaveCount(0);
    } finally {
      await close();
    }
  });

  test('browser Back while the line is live ends it without a question', async ({
    browser,
    baseURL,
  }) => {
    const { sender, receiver, close } = await pair(browser, baseURL!);
    try {
      await sender.goBack();
      await expect(sender).toHaveURL(/\/$/);
      await expect(sender.getByRole('button', { name: 'New thread' })).toBeVisible();
      await expect(question(sender)).toHaveCount(0);
      await expect(receiver.getByText('The line is cut')).toBeVisible(FAST);
    } finally {
      await close();
    }
  });

  test('browser Back while the question is up wins: the line ends and the question is gone', async ({
    browser,
    baseURL,
  }) => {
    const { sender, receiver, close } = await pair(browser, baseURL!);
    try {
      await home(sender).click();
      await expect(question(sender)).toBeVisible();
      await sender.goBack();
      await expect(sender).toHaveURL(/\/$/);
      await expect(sender.getByRole('button', { name: 'New thread' })).toBeVisible();
      await expect(question(sender)).toHaveCount(0);
      await expect(receiver.getByText('The line is cut')).toBeVisible(FAST);
    } finally {
      await close();
    }
  });

  test('a hash change while the question is up withdraws it; the line stays and the fragment is dropped', async ({
    browser,
    baseURL,
  }) => {
    const { sender, receiver, close } = await pair(browser, baseURL!);
    try {
      await home(sender).click();
      await expect(question(sender)).toBeVisible();
      await sender.evaluate(() => (window.location.hash = 'x'));
      await expect(question(sender)).toHaveCount(0);
      await expect(home(sender)).toBeFocused();
      await expect(sender).toHaveURL(/\/s$/);
      await sender.getByLabel('Text to send').fill('after the hash');
      await expect(receiver.getByText('after the hash')).toBeVisible();
      await expect(receiver.getByText('The line is cut')).toHaveCount(0);

      // The superseded navigation is gone: asking again and leaving still works, once.
      await home(sender).click();
      await sender.getByRole('button', { name: 'Leave' }).click();
      await expect(sender).toHaveURL(/\/$/);
      await expect(receiver.getByText('The line is cut')).toBeVisible(FAST);
    } finally {
      await close();
    }
  });

  test('after the line has ended, home needs no confirm', async ({ browser, baseURL }) => {
    const { sender, receiver, close } = await pair(browser, baseURL!);
    try {
      await sender.getByRole('button', { name: 'Cut the line' }).click();
      await sender.getByRole('button', { name: 'Cut it' }).click();
      await expect(receiver.getByText('The line is cut')).toBeVisible(FAST);

      await home(receiver).click();
      await expect(receiver).toHaveURL(/\/$/);
      await home(sender).click();
      await expect(sender).toHaveURL(/\/$/);
      await expect(question(sender)).toHaveCount(0);
    } finally {
      await close();
    }
  });

  test('from the receiver gate, home goes straight back and nothing joined', async ({
    browser,
    baseURL,
  }) => {
    const { sender, receiver, close } = await pair(browser, baseURL!, false);
    try {
      await expect(receiver.getByRole('button', PICK_UP)).toBeVisible();
      await home(receiver).click();
      await expect(receiver).toHaveURL(/\/$/);
      await expect(question(receiver)).toHaveCount(0);
      await expect(sender.getByText('Waiting for the other can...')).toBeVisible();
    } finally {
      await close();
    }
  });
});
