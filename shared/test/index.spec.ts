import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/index.js';

describe('@tincan/shared', () => {
  it('exports the app name', () => {
    expect(APP_NAME).toBe('tincan');
  });
});
