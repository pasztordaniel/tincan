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
