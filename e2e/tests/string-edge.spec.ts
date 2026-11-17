import { expect, test, type Page } from '@playwright/test';
import { newPage, startThread, PICK_UP } from './helpers/two-party.js';

/** The full-bleed string's tail must stop exactly at the viewport edge: never a sideways scroll. */
async function expectNoSidewaysScroll(page: Page, state: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${state}: scrollWidth <= innerWidth`).toBeLessThanOrEqual(innerWidth);
}

/** Waits until the hero's tail has drawn in up to (sender) or from (receiver) the viewport edge. */
async function tailAtEdge(page: Page, side: 'left' | 'right'): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate((s) => {
        const r = document.querySelector('.hero .tail')?.getBoundingClientRect();
        if (!r || r.width === 0) return false;
        return s === 'right' ? Math.abs(r.right - window.innerWidth) < 1 : Math.abs(r.left) < 1;
      }, side),
    )
    .toBe(true);
}

for (const width of [360, 1280]) {
  test(`the string reaches the edge without a sideways scroll at ${width} px`, async ({
    browser,
  }) => {
    const s = await newPage(browser);
    const r = await newPage(browser);
    try {
      await s.page.setViewportSize({ width, height: 800 });
      await r.page.setViewportSize({ width, height: 800 });

      const { link } = await startThread(s.page);
      await tailAtEdge(s.page, 'right');
      await expectNoSidewaysScroll(s.page, 'sender waiting');

      await r.page.goto(link);
      await expect(r.page.getByRole('button', PICK_UP)).toBeVisible();
      await tailAtEdge(r.page, 'left');
      await expectNoSidewaysScroll(r.page, 'receiver pick-up');

      await r.page.getByRole('button', PICK_UP).click();
      await expect(r.page.getByRole('heading', { name: 'Their can' })).toBeVisible();
      await expect(s.page.getByText('Waiting for the other can...')).toHaveCount(0);
      await tailAtEdge(s.page, 'right');
      await tailAtEdge(r.page, 'left');
      await expectNoSidewaysScroll(s.page, 'sender connected');
      await expectNoSidewaysScroll(r.page, 'receiver live');
    } finally {
      await s.context.close();
      await r.context.close();
    }
  });
}
