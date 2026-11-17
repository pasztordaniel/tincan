import { TestBed } from '@angular/core/testing';
import { HomePage } from './home-page';

describe('HomePage', () => {
  it('renders the app name from @tincan/shared', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(heading?.textContent?.trim()).toBe('tincan');
  });
});
