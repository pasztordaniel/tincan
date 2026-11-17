import { TestBed } from '@angular/core/testing';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('is a named toggle button whose pressed state follows the theme', async () => {
    const fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Dark theme');
    const before = button.getAttribute('aria-pressed');

    button.click();
    await fixture.whenStable();
    expect(button.getAttribute('aria-pressed')).not.toBe(before);
  });
});
