import { TestBed } from '@angular/core/testing';
import { StatusPill } from './status-pill';
import { type LineState, pillContent } from './status-pill.model';

describe('pillContent', () => {
  it('maps every state to sender text and a distinct icon', () => {
    expect(pillContent('waiting', 'sender')).toEqual({
      text: 'Waiting for the other can...',
      icon: 'dot',
    });
    expect(pillContent('connected', 'sender')).toEqual({
      text: 'Connected: they can hear you',
      icon: 'taut',
    });
    expect(pillContent('idle', 'sender')).toEqual({
      text: 'Idle: the string will be cut soon',
      icon: 'snip',
    });
    expect(pillContent('reconnecting', 'sender')).toEqual({
      text: 'Line is slack, reconnecting...',
      icon: 'slack',
    });
    expect(pillContent('ended', 'sender')).toEqual({ text: 'Line cut', icon: 'cut' });
  });

  it('uses the shorter receiver copy', () => {
    expect(pillContent('connected', 'receiver').text).toBe('Connected');
    expect(pillContent('ended', 'receiver').text).toBe('Line cut');
  });

  it('never relies on color alone: icons are unique per state', () => {
    const states: LineState[] = ['waiting', 'connected', 'idle', 'reconnecting', 'ended'];
    const icons = new Set(states.map((s) => pillContent(s, 'sender').icon));
    expect(icons.size).toBe(states.length);
  });
});

describe('StatusPill', () => {
  it('renders text, icon and a status role for the given state', async () => {
    const fixture = TestBed.createComponent(StatusPill);
    fixture.componentRef.setInput('state', 'reconnecting');
    await fixture.whenStable();
    const pill = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!;
    expect(pill.textContent?.trim()).toBe('Line is slack, reconnecting...');
    expect(pill.getAttribute('data-icon')).toBe('slack');
    expect(pill.classList).toContain('pill--reconnecting');
  });
});
