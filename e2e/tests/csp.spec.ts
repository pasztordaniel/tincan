import { expect, test } from '@playwright/test';

// The built app must run under the server's strict CSP (including Trusted Types) without a single
// violation. Violations are reported to the page as `securitypolicyviolation` events and, for blocked
// scripts and styles, as console errors; both are collected from before the first script runs.
for (const path of ['/', '/r/abc']) {
  test(`${path} loads with no CSP violations or console errors`, async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning')
        problems.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        const w = window as unknown as { __cspViolations?: string[] };
        (w.__cspViolations ??= []).push(`${e.violatedDirective} ${e.blockedURI}`);
      });
    });

    const response = await page.goto(path);
    expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('tincan');
    // Give late violations (lazy chunks, injected styles) a moment to surface.
    await page.waitForLoadState('networkidle');

    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    );
    expect(violations).toEqual([]);
    expect(problems).toEqual([]);
  });
}

// The CSP spec above passes trivially while no component has styles; this proves the nonce wiring
// (header nonce == ngCspNonce) and that the browser really enforces style-src with it.
test('style nonce matches the header and only nonced styles apply', async ({ page }) => {
  const response = await page.goto('/r/abc');
  const nonce = /'nonce-([^']+)'/.exec(response?.headers()['content-security-policy'] ?? '')?.[1];
  expect(nonce).toBeTruthy();
  await expect(page.locator('app-root')).toHaveAttribute('ngcspnonce', nonce!);

  const applied = await page.evaluate((n) => {
    const probe = (id: string, withNonce: boolean): boolean => {
      const el = document.createElement('div');
      el.id = id;
      document.body.append(el);
      const style = document.createElement('style');
      if (withNonce) style.nonce = n;
      style.textContent = `#${id} { width: 123px; }`;
      document.head.append(style);
      return getComputedStyle(el).width === '123px';
    };
    return { nonced: probe('csp-nonced', true), plain: probe('csp-plain', false) };
  }, nonce!);
  expect(applied).toEqual({ nonced: true, plain: false });
});
