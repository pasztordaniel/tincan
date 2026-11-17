import { expect, test } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { PICK_UP, Traffic, newPage, startThread } from './helpers/two-party.js';

/** The dark modules (row,col) a rendered path draws, quiet zone removed. */
function modulesFromPath(path: string, quiet: number): Set<string> {
  const dark = new Set<string>();
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(m[3]); i++) {
      dark.add(`${Number(m[2]) - quiet},${Number(m[1]) + i - quiet}`);
    }
  }
  return dark;
}

test('the QR code is hidden by default, local, encodes the exact link, and hides on connect', async ({
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

    // No QR decoder here: the drawn modules must equal an independent encoding of the link.
    const d = await svg.locator('path').getAttribute('d');
    const qr = qrcode(0, 'M');
    qr.addData(link, 'Byte');
    qr.make();
    const expected = new Set<string>();
    for (let row = 0; row < qr.getModuleCount(); row++)
      for (let col = 0; col < qr.getModuleCount(); col++)
        if (qr.isDark(row, col)) expected.add(`${row},${col}`);
    expect(modulesFromPath(d!, 4)).toEqual(expected);

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
    await startThread(page);
    await page.getByRole('button', { name: 'Show QR code' }).click();
    const svg = page.getByRole('img', { name: 'QR code for the receiver link' });
    await expect(svg.locator('rect')).toHaveCSS('fill', 'rgb(255, 255, 255)');
    await expect(svg.locator('path')).toHaveCSS('fill', 'rgb(0, 0, 0)');
    const box = await svg.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(200);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  } finally {
    await context.close();
  }
});
