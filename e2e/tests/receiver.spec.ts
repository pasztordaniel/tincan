import { expect, test } from '@playwright/test';
import { RelaySender, SAMPLE_KEY } from './helpers/relay-sender.js';

const OPEN = { name: 'Pick up' };

test.describe('receiver link', () => {
  test('Open gate: nothing joins before the click, and the fragment is gone', async ({
    page,
    baseURL,
  }) => {
    const sender = await RelaySender.create(baseURL!);
    try {
      await page.goto(`/r/${sender.sessionId}#${SAMPLE_KEY}`);
      await expect(page.getByRole('heading', { name: 'Someone is on the line' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('tincan');

      // The key left the address bar and the current history entry.
      expect(page.url()).toBe(`${baseURL}/r/${sender.sessionId}`);
      expect(await page.evaluate(() => location.hash)).toBe('');

      // Give a (wrong) auto-join time to show up at the relay: the sender must still be alone.
      await page.waitForTimeout(500);
      expect(sender.peers).toEqual(['waiting']);

      await page.getByRole('button', OPEN).click();
      await expect(page.getByRole('heading', { name: 'Their can' })).toBeVisible();
      await expect.poll(() => sender.peers).toContain('connected');

      // A reload has lost the key for good: say so instead of showing an empty line.
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Link already used' })).toBeVisible();
    } finally {
      sender.close();
    }
  });

  test('a second receiver sees the busy line', async ({ browser, baseURL }) => {
    const sender = await RelaySender.create(baseURL!);
    try {
      const first = await browser.newPage();
      const second = await browser.newPage();
      await first.goto(`/r/${sender.sessionId}#${SAMPLE_KEY}`);
      await first.getByRole('button', OPEN).click();
      await expect(first.getByRole('heading', { name: 'Their can' })).toBeVisible();

      await second.goto(`/r/${sender.sessionId}#${SAMPLE_KEY}`);
      await second.getByRole('button', OPEN).click();
      await expect(second.getByRole('heading', { name: 'This line is busy' })).toBeVisible();
    } finally {
      sender.close();
    }
  });

  test('a link without a key says it was already used', async ({ page }) => {
    await page.goto(`/r/${'A'.repeat(22)}`);
    await expect(page.getByRole('heading', { name: 'Link already used' })).toBeVisible();
    await expect(page.getByRole('button', OPEN)).toHaveCount(0);
  });

  test('invalid ids and keys are rejected and the fragment is cleared', async ({ page }) => {
    await page.goto(`/r/not-an-id#${SAMPLE_KEY}`);
    await expect(page.getByRole('heading', { name: 'Invalid link' })).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe('');

    await page.goto(`/r/${'A'.repeat(22)}#short`);
    await expect(page.getByRole('heading', { name: 'Invalid link' })).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('a mangled receiver path still clears the key instead of carrying it to the home page', async ({
    page,
  }) => {
    for (const path of [`/r/${'A'.repeat(22)}/extra`, '/r', `/r/${'A'.repeat(22)}/`]) {
      await page.goto(`${path}#${SAMPLE_KEY}`);
      await expect(
        page.getByRole('heading', { name: /Invalid link|Someone is on the line/ }),
      ).toBeVisible();
      expect(await page.evaluate(() => location.hash)).toBe('');
    }
  });

  test('a key on a path outside /r is dropped before any page shows', async ({ page }) => {
    const id = 'A'.repeat(22);
    for (const path of [`/R/${id}`, `/rr/${id}`, `/r%2F${id}`, '/', '/x', '/design']) {
      await page.goto(`${path}#${SAMPLE_KEY}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // `/` after a redirect to `/` is a same-document navigation, dropped after the router's in-place navigation ends.
      await expect.poll(() => page.evaluate(() => location.hash), { message: path }).toBe('');
      expect(page.url()).not.toContain(SAMPLE_KEY);
    }
    // Same path, new fragment: no reload, so it is dropped after the router's in-place navigation ends.
    await page.evaluate((key) => (location.hash = key), SAMPLE_KEY);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  });

  test('an unknown thread ends at the gate with a clear message', async ({ page }) => {
    await page.goto(`/r/${'A'.repeat(22)}#${SAMPLE_KEY}`);
    await page.getByRole('button', OPEN).click();
    await expect(page.getByRole('heading', { name: 'Nothing on this line' })).toBeVisible();
  });
});
