export const DEFAULT_PORT = 3000;

/** Parses a TCP port (integer 1-65535); anything else, including an unset value, yields the fallback. */
export function parsePort(value: string | undefined, fallback = DEFAULT_PORT): number {
  if (value === undefined || !/^\d+$/.test(value.trim())) return fallback;
  const port = Number(value.trim());
  return port >= 1 && port <= 65535 ? port : fallback;
}

/**
 * A startup warning when `PORT` is set but not a valid port, so a typo does not silently fall back to the
 * default. An unset or empty `PORT` is normal and gets none.
 */
export function portWarning(
  value: string | undefined,
  fallback = DEFAULT_PORT,
): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  if (parsePort(value, -1) !== -1) return undefined;
  return `PORT ${JSON.stringify(value.slice(0, 32))} is not a valid port (1-65535); using ${fallback}`;
}

/**
 * What to do when the built client is missing: production refuses to start (it would serve only
 * `/healthz` and socket.io), development only notes it, because `ng serve` serves the client there.
 */
export function missingClientBuild(nodeEnv: string | undefined): 'fail' | 'warn' {
  return nodeEnv === 'production' ? 'fail' : 'warn';
}
