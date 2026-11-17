import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home-page';

describe('HomePage', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('renders the app name from @tincan/shared and one primary action', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('tincan');
    expect(root.querySelector('main button')?.textContent?.trim()).toBe('New thread');
  });

  it('opens the thread dialog with the link card and a Join action', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-link-card')).toBeNull();

    root.querySelector<HTMLButtonElement>('main button')!.click();
    await fixture.whenStable();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('input')?.value).toContain('#k=');
    expect(dialog.textContent).toContain('Join');
  });
});
