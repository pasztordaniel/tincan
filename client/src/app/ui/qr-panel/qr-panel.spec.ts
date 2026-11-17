import { TestBed } from '@angular/core/testing';
import { QrCode } from '../qr-code/qr-code';
import { QrPanel } from './qr-panel';

const LINK = 'http://x/r/id#key';

async function render() {
  const fixture = TestBed.createComponent(QrPanel);
  fixture.componentRef.setInput('link', LINK);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, button: root.querySelector('button')! };
}

describe('QrPanel', () => {
  it('is closed by default, with a real button wired to its region, and warns about scanning', async () => {
    const { root, button } = await render();
    expect(root.querySelector('svg')).toBeNull();
    expect(button.textContent?.trim()).toBe('Show QR code');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector(`#${button.getAttribute('aria-controls')}`)).not.toBeNull();
    const hint = root.querySelector(`#${button.getAttribute('aria-describedby')}`)!;
    expect(hint.textContent).toContain('Anyone who scans this can read your messages.');
  });

  it('toggles open and closed, encoding exactly the receiver link', async () => {
    const { fixture, root, button } = await render();
    button.click();
    await fixture.whenStable();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent?.trim()).toBe('Hide QR code');
    expect(root.querySelector('svg[role="img"]')).not.toBeNull();
    const qr = fixture.debugElement.query((d) => d.componentInstance instanceof QrCode);
    expect((qr.componentInstance as QrCode).payload()).toBe(LINK);
    button.click();
    await fixture.whenStable();
    expect(root.querySelector('svg')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
