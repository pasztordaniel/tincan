export const DEFAULT_PORT = 3000;

/** Parses a TCP port (integer 1-65535); anything else, including an unset value, yields the fallback. */
export function parsePort(value: string | undefined, fallback = DEFAULT_PORT): number {
  if (value === undefined || !/^\d+$/.test(value.trim())) return fallback;
  const port = Number(value.trim());
  return port >= 1 && port <= 65535 ? port : fallback;
}
