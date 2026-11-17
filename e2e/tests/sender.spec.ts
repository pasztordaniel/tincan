import { expect, test } from '@playwright/test';

test('creating a thread never sends the key anywhere', async ({ page }) => {
  const requestUrls: string[] = [];
  const requestBodies: string[] = [];
  const wsFrames: string[] = [];
  const consoleLines: string[] = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));
  page.on('pageerror', (err) => consoleLines.push(String(err)));
  page.on('request', (req) => {
    requestUrls.push(req.url());
    requestBodies.push(req.postData() ?? '');
    requestBodies.push(JSON.stringify(req.headers()));
  });
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => wsFrames.push(String(f.payload)));
    ws.on('framereceived', (f) => wsFrames.push(String(f.payload)));
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'New thread' }).click();
  const link = await page.getByLabel('Thread link').inputValue();
  const match = /^(.+)\/r\/([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})$/.exec(link);
  expect(match, 'link is <origin>/r/<id>#<key>').not.toBeNull();
  const sessionId = match![2]!;
  const key = match![3]!;

  await page.getByRole('link', { name: 'Join' }).click();
  await expect(page).toHaveURL(/\/s$/);
  await expect(page.getByText('Waiting for the other can...')).toBeVisible();
  await page.getByLabel('Text to send').fill('hello over the string');
  // Let the debounced text frame and a beat go out.
  await expect.poll(() => wsFrames.length).toBeGreaterThan(4);
  await page.waitForTimeout(1500);

  // The key is in the link only, never in the sender's own URL, title, history, storage or console.
  expect(page.url()).not.toContain(key);
  expect(await page.title()).not.toContain(key);
  expect(await page.evaluate(() => JSON.stringify(history.state) ?? '')).not.toContain(key);
  for (const line of consoleLines) expect(line).not.toContain(key);
  const stored = await page.evaluate(() =>
    JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
  );
  expect(stored).not.toContain(key);

  expect(requestUrls.length).toBeGreaterThan(0);
  expect(wsFrames.length).toBeGreaterThan(0);
  for (const haystack of [...requestUrls, ...requestBodies, ...wsFrames]) {
    expect(haystack).not.toContain(key);
  }
  // The session id is expected on the wire (the relay needs it); the plaintext must not be.
  expect(wsFrames.some((f) => f.includes(sessionId))).toBe(true);
  for (const f of wsFrames) expect(f).not.toContain('hello over the string');
});

test('the sender route without a live session goes home', async ({ page }) => {
  await page.goto('/s');
  await expect(page.getByRole('button', { name: 'New thread' })).toBeVisible();
});
