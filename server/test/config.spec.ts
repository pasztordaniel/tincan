import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, parsePort } from '../src/config.js';

describe('parsePort', () => {
  it.each([
    ['8080', 8080],
    [' 3100 ', 3100],
    ['1', 1],
    ['65535', 65535],
  ])('accepts %j', (value, expected) => {
    expect(parsePort(value)).toBe(expected);
  });

  it.each([undefined, '', '0', '65536', '-1', '3.5', '1e3', 'abc', '80abc'])(
    'falls back for %j',
    (value) => {
      expect(parsePort(value)).toBe(DEFAULT_PORT);
      expect(parsePort(value, 4321)).toBe(4321);
    },
  );
});
