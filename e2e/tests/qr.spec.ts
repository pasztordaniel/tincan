import { expect, test, type Locator } from '@playwright/test';
import jsQRImport from 'jsqr';
import { PNG } from 'pngjs';
import { PICK_UP, Traffic, newPage, startThread } from './helpers/two-party.js';

// jsqr is CommonJS with `export default` typings; under NodeNext the callable sits on `.default`.
type Decode = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const jsQR = (jsQRImport as unknown as { default: Decode }).default;

/** Decodes the rendered QR (a real screenshot of the SVG) the way a phone would. */
async function decode(svg: Locator): Promise<string | null> {
  const png = PNG.sync.read(await svg.screenshot());
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

test('the QR code is hidden by default, local, decodes to the exact link, and hides on connect', async ({
  browser,
}) => {
  const s = await newPage(browser);
  const r = await newPage(browser);
  try {
    const traffic = new Traffic(s.page);
    const { link } = await startThread(s.page);
    // The receiver link is shown on the sender screen; the QR is not.
    await expect(s.page.getByLabel('Thread link')).toHaveValue(link);
    await expect(s.page.getByRole('img', { name: 'QR code for the receiver link' })).toHaveCount(0);
    const toggle = s.page.getByRole('button', { name: 'Show QR code' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(s.page.getByText('Anyone who scans this can read your messages.')).toBeVisible();

    const requestsBefore = traffic.urls.length;
    await toggle.click();
    const svg = s.page.getByRole('img', { name: 'QR code for the receiver link' });
    await expect(svg).toBeVisible();
    await expect(s.page.getByRole('button', { name: 'Hide QR code' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Drawn in the browser: no request for an image or a service.
    expect(traffic.urls.length).toBe(requestsBefore);
    const box = await svg.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(200);

    // Decode what is on screen: it must be exactly the receiver link.
    expect(await decode(svg)).toBe(link);
    expect(traffic.urls.length).toBe(requestsBefore);

    // The receiver connects: the QR (and the link card) disappear.
    await r.page.goto(link);
    await r.page.getByRole('button', PICK_UP).click();
    await expect(svg).toHaveCount(0);
    await expect(s.page.getByRole('button', { name: /QR code/ })).toHaveCount(0);
  } finally {
    await s.context.close();
    await r.context.close();
  }
});

test('the QR code stays readable on a light ground in dark mode at 360 px', async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: 'dark',
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  try {
    const { link } = await startThread(page);
    await page.getByRole('button', { name: 'Show QR code' }).click();
    const svg = page.getByRole('img', { name: 'QR code for the receiver link' });
    await expect(svg.locator('rect')).toHaveCSS('fill', 'rgb(255, 255, 255)');
    await expect(svg.locator('path')).toHaveCSS('fill', 'rgb(0, 0, 0)');
    const box = await svg.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(200);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(await decode(svg)).toBe(link);
  } finally {
    await context.close();
  }
});

test('the QR code fits a 200 px wide viewport without horizontal scroll and still decodes', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 200, height: 800 } });
  const page = await context.newPage();
  try {
    const { link } = await startThread(page);
    await page.getByRole('button', { name: 'Show QR code' }).click();
    const svg = page.getByRole('img', { name: 'QR code for the receiver link' });
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(200);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await decode(svg)).toBe(link);
  } finally {
    await context.close();
  }
});
