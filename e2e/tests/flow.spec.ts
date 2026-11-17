import { expect, test, type Page } from '@playwright/test';
import { FrameTap } from './helpers/ws-tap.js';
import {
  INTEGRITY_WARNING,
  PICK_UP,
  Traffic,
  newPage,
  pickUp,
  readerText,
  startThread,
} from './helpers/two-party.js';

/** Types into the sender's box and waits for the receiver to show exactly that. */
async function sendAndExpect(sender: Page, receiver: Page, text: string): Promise<void> {
  await sender.getByLabel('Text to send').fill(text);
  await expect.poll(readerText(receiver)).toBe(text);
}

test.describe('two-party flow', () => {
  test('golden path: consecutive updates arrive exactly and in order', async ({ browser }) => {
    const s = await newPage(browser);
    const r = await newPage(browser);
    try {
      // Record every text the receiver ever renders, to check order and that nothing is skipped back.
      await r.page.addInitScript(() => {
        const seen: string[] = [];
        (window as unknown as { __seen: string[] }).__seen = seen;
        new MutationObserver(() => {
          const t = document.querySelector('.reader__text')?.textContent;
          if (t != null && seen[seen.length - 1] !== t) seen.push(t);
        }).observe(document, { childList: true, subtree: true, characterData: true });
      });

      const { link } = await startThread(s.page);
      await pickUp(r.page, link);
      await expect(s.page.getByText('Waiting for the other can...')).toHaveCount(0);
      await expect(INTEGRITY_WARNING(r.page)).toHaveCount(0);

      const updates = [
        'Hello, can you hear me?',
        'Hello, can you hear me?\nLine two: \u00e1rv\u00edzt\u0171r\u0151 t\u00fck\u00f6rf\u00far\u00f3g\u00e9p 日本語 🥫🧵',
        'Hello, can you hear me?\nLine two: \u00e1rv\u00edzt\u0171r\u0151 t\u00fck\u00f6rf\u00far\u00f3g\u00e9p 日本語 🥫🧵\n\n  indented, <b>not html</b> & "quotes"',
        'Hello!\nLine two: \u00e1rv\u00edzt\u0171r\u0151 t\u00fck\u00f6rf\u00far\u00f3g\u00e9p 日本語 🥫🧵',
        'Hello!',
      ];
      for (const text of updates) await sendAndExpect(s.page, r.page, text);

      const seen = await r.page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
      // Every observed text is one of ours, and they appear in the order sent.
      const order = seen.map((t) => updates.indexOf(t));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(seen.at(-1)).toBe(updates.at(-1));
      // Rendered as text, never as HTML.
      await expect(r.page.locator('.reader__text b')).toHaveCount(0);
      await expect(INTEGRITY_WARNING(r.page)).toHaveCount(0);
    } finally {
      await s.context.close();
      await r.context.close();
    }
  });

  test('a second receiver is refused while the first keeps working', async ({ browser }) => {
    const s = await newPage(browser);
    const r1 = await newPage(browser);
    const r2 = await newPage(browser);
    try {
      const { link } = await startThread(s.page);
      await pickUp(r1.page, link);
      await sendAndExpect(s.page, r1.page, 'first');

      await r2.page.goto(link);
      await r2.page.getByRole('button', PICK_UP).click();
      await expect(r2.page.getByRole('heading', { name: 'This line is busy' })).toBeVisible();
      await expect(r2.page.locator('.reader__text')).toHaveCount(0);

      await sendAndExpect(s.page, r1.page, 'first, then second');
      await sendAndExpect(s.page, r1.page, 'third');
      await expect(INTEGRITY_WARNING(r1.page)).toHaveCount(0);
    } finally {
      await s.context.close();
      await r1.context.close();
      await r2.context.close();
    }
  });

  test('a tampered frame shows the warning, keeps the last good text, later frames still work', async ({
    browser,
  }) => {
    const s = await newPage(browser);
    const r = await newPage(browser);
    try {
      const tap = await FrameTap.install(r.page);
      const { link } = await startThread(s.page);
      await pickUp(r.page, link);
      await sendAndExpect(s.page, r.page, 'good text');
      await expect(INTEGRITY_WARNING(r.page)).toHaveCount(0);

      tap.tamper = true;
      await s.page.getByLabel('Text to send').fill('evil text');
      await expect(INTEGRITY_WARNING(r.page)).toBeVisible();
      await expect.poll(readerText(r.page)).toBe('good text');
      tap.tamper = false;

      await sendAndExpect(s.page, r.page, 'good again');
      await sendAndExpect(s.page, r.page, 'and once more');
    } finally {
      await s.context.close();
      await r.context.close();
    }
  });

  test('a replayed frame is ignored with a warning and the text is not rolled back', async ({
    browser,
  }) => {
    const s = await newPage(browser);
    const r = await newPage(browser);
    try {
      const tap = await FrameTap.install(r.page);
      const { link } = await startThread(s.page);
      await pickUp(r.page, link);
      await sendAndExpect(s.page, r.page, 'one');
      await sendAndExpect(s.page, r.page, 'two');
      await sendAndExpect(s.page, r.page, 'three');
      await expect(INTEGRITY_WARNING(r.page)).toHaveCount(0);

      // The first genuine frame the receiver ever saw, delivered again by a malicious relay.
      expect(tap.delivered.length).toBeGreaterThan(1);
      tap.replay(0);
      await expect(INTEGRITY_WARNING(r.page)).toBeVisible();
      await expect.poll(readerText(r.page)).toBe('three');

      await sendAndExpect(s.page, r.page, 'four');
    } finally {
      await s.context.close();
      await r.context.close();
    }
  });

  test('the key is in no request, header, body, frame or server-visible URL on either side', async ({
    browser,
    baseURL,
  }) => {
    const s = await newPage(browser);
    const r = await newPage(browser);
    try {
      const sender = new Traffic(s.page);
      const receiver = new Traffic(r.page);
      const { link, key, sessionId } = await startThread(s.page);
      await pickUp(r.page, link);
      await sendAndExpect(s.page, r.page, 'secret words one');
      await sendAndExpect(s.page, r.page, 'secret words two');

      // Receiver's address bar and history lost the key; the server only ever saw /r/<id>.
      expect(r.page.url()).toBe(`${baseURL}/r/${sessionId}`);
      expect(s.page.url()).not.toContain(key);
      expect(receiver.urls).toContain(`${baseURL}/r/${sessionId}`);

      for (const [side, traffic] of [
        ['sender', sender],
        ['receiver', receiver],
      ] as const) {
        const all = await traffic.everything();
        expect(all.length, `${side} traffic was captured`).toBeGreaterThan(0);
        expect(traffic.wsFrames.length, `${side} saw websocket frames`).toBeGreaterThan(0);
        for (const item of all) {
          expect(item, `${side} traffic`).not.toContain(key);
          expect(item, `${side} traffic`).not.toContain('secret words');
        }
        for (const url of traffic.urls) expect(url).not.toContain('#');
      }
    } finally {
      await s.context.close();
      await r.context.close();
    }
  });
});
