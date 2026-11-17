/**
 * Records the README demo: docs/media/demo.gif.
 *
 *   npm run demo:gif            (builds, then runs this script against the production server)
 *
 * Two browser contexts side by side: the sender on the left in the light theme, the receiver on the right in the dark
 * theme. Both are recorded with Playwright video (page only, no browser chrome), then ffmpeg puts them next to each
 * other, trims to the story and writes a palette-optimised GIF.
 *
 * Every synchronisation step waits on UI state, like the e2e suite. The only timed waits are pacing (typing speed and
 * short pauses so a viewer can read a state), which change how the GIF looks, never whether the story completes.
 *
 * Environment:
 *   DEMO_URL   use a server that is already running instead of starting `npm run serve` (default: start one)
 *   DEMO_PORT  port for the server this script starts (default 3150)
 *   FFMPEG     ffmpeg binary (default: `ffmpeg` on PATH, then /opt/homebrew/bin/ffmpeg)
 *   DEMO_OUT   output path (default: docs/media/demo.gif)
 *
 * The session shown is a throwaway on a local server and ends on screen, so the key visible in the link is dead.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..', '..');
const OUT = resolve(ROOT, process.env['DEMO_OUT'] ?? 'docs/media/demo.gif');
const PORT = Number(process.env['DEMO_PORT'] ?? 3150);
const BASE_URL = process.env['DEMO_URL'] ?? `http://localhost:${PORT}`;
const VIEWPORT = { width: 640, height: 900 };
const MAX_BYTES = 4 * 1024 * 1024;
const UI_TIMEOUT = 15_000;

/** GIF encodings tried in order until one fits MAX_BYTES. */
const ENCODINGS = [
  { fps: 10, width: 1120 },
  { fps: 10, width: 1000 },
];

/** What the sender types, one entry per burst; the pause between bursts lets the receiver catch up visibly. */
const LINES = ['Hey, it is me.', '\nTrain is ten minutes late.', '\nSave me a seat?'];
const KEY_DELAY_MS = 70;

/** Pacing only: how long a state stays on screen. Never used to wait for the app. */
const pace = (page: Page, ms: number) => page.waitForTimeout(ms);

function findFfmpeg(): string {
  const bins = [process.env['FFMPEG'], 'ffmpeg', '/opt/homebrew/bin/ffmpeg'];
  for (const bin of bins) {
    if (bin && spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0) return bin;
  }
  throw new Error('ffmpeg not found: install it or set FFMPEG=/path/to/ffmpeg');
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} did not become healthy within ${timeoutMs} ms`);
}

async function startServer(): Promise<ChildProcess | undefined> {
  if (process.env['DEMO_URL']) {
    await waitForHealth(BASE_URL, 5_000);
    return undefined;
  }
  if (!existsSync(join(ROOT, 'server', 'dist', 'index.js'))) {
    throw new Error(
      'no production build: run `npm run build` first (or `npm run demo:gif` from the root)',
    );
  }
  // Own process group, so stopping it also stops the node process that npm starts.
  const server = spawn('npm', ['run', 'serve', '-w', '@tincan/server'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });
  await waitForHealth(BASE_URL, 30_000);
  return server;
}

function stopServer(server: ChildProcess | undefined): void {
  if (server?.pid === undefined || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

interface Party {
  context: BrowserContext;
  page: Page;
  /** Wall-clock time the page (and so its video) was created. */
  videoStart: number;
}

async function newParty(
  browser: Browser,
  colorScheme: 'light' | 'dark',
  videoDir: string,
): Promise<Party> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion: 'no-preference',
    recordVideo: { dir: join(videoDir, colorScheme), size: VIEWPORT },
  });
  context.setDefaultTimeout(UI_TIMEOUT);
  const videoStart = Date.now();
  const page = await context.newPage();
  return { context, page, videoStart };
}

/** Runs the story. Returns the wall-clock window [start, end] that the GIF should show. */
async function story(sender: Page, receiver: Page): Promise<{ start: number; end: number }> {
  // Both start on home: the sender in light, the receiver in dark.
  await Promise.all([sender.goto('/'), receiver.goto('/')]);
  const newThread = sender.getByRole('button', { name: 'New thread' });
  await newThread.waitFor();
  await receiver.getByRole('button', { name: 'New thread' }).waitFor();
  const start = Date.now();
  await pace(sender, 1_000);

  // Sender: new thread, read the link, join the line.
  await newThread.click();
  const linkField = sender.getByLabel('Thread link');
  await linkField.waitFor();
  const link = await linkField.inputValue();
  await pace(sender, 1_200);
  await sender.getByRole('link', { name: 'Join' }).click();
  await sender.getByText('Waiting for the other can...').waitFor();
  await pace(sender, 700);

  // Receiver: open the link, pick up.
  await receiver.goto(link);
  const pickUp = receiver.getByRole('button', { name: 'Pick up' });
  await pickUp.waitFor();
  await pace(receiver, 900);
  await pickUp.click();
  await receiver.getByRole('heading', { name: 'Their can' }).waitFor();
  await sender.getByText('Connected: they can hear you').waitFor();
  await pace(sender, 700);

  // Sender types at a human pace; each burst waits until the receiver shows it.
  const box = sender.getByLabel('Text to send');
  await box.click();
  let typed = '';
  for (const line of LINES) {
    await box.pressSequentially(line, { delay: KEY_DELAY_MS });
    typed += line;
    const expected = typed;
    await receiver.waitForFunction(
      (text) => document.querySelector('.reader__text')?.textContent === text,
      expected,
      { timeout: UI_TIMEOUT },
    );
    await pace(sender, 600);
  }
  await pace(sender, 600);

  // Sender cuts the line: ask, confirm, both sides end.
  await sender.getByRole('button', { name: 'Cut the line' }).click();
  await sender.getByRole('button', { name: 'Cut it' }).waitFor();
  await pace(sender, 900);
  await sender.getByRole('button', { name: 'Cut it' }).click();
  await Promise.all([
    sender.getByText('You cut the line').waitFor(),
    receiver.getByText('The line is cut').waitFor(),
  ]);
  const hold = 2_000;
  await pace(sender, hold);
  return { start, end: Date.now() };
}

function encodeGif(
  ffmpeg: string,
  senderVideo: string,
  receiverVideo: string,
  offsets: { sender: number; receiver: number; duration: number },
): void {
  mkdirSync(dirname(OUT), { recursive: true });
  for (const { fps, width } of ENCODINGS) {
    const filter =
      `[0:v]setpts=PTS-STARTPTS[s];[1:v]setpts=PTS-STARTPTS[r];` +
      `[s][r]hstack=inputs=2,fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];` +
      `[a]palettegen=max_colors=256:stats_mode=diff[p];` +
      `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    const seconds = (ms: number) => (ms / 1000).toFixed(3);
    const args = [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      seconds(offsets.sender),
      '-t',
      seconds(offsets.duration),
      '-i',
      senderVideo,
      '-ss',
      seconds(offsets.receiver),
      '-t',
      seconds(offsets.duration),
      '-i',
      receiverVideo,
      '-filter_complex',
      filter,
      '-loop',
      '0',
      OUT,
    ];
    const result = spawnSync(ffmpeg, args, { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`ffmpeg failed with status ${result.status}`);
    const bytes = statSync(OUT).size;
    console.log(
      `demo: ${OUT} at ${fps} fps, ${width} px wide: ${(bytes / 1024 / 1024).toFixed(2)} MB`,
    );
    if (bytes <= MAX_BYTES) return;
  }
  throw new Error(`demo GIF is larger than ${MAX_BYTES} bytes at every encoding`);
}

async function main(): Promise<void> {
  const ffmpeg = findFfmpeg();
  const videoDir = mkdtempSync(join(tmpdir(), 'tincan-demo-'));
  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const [s, r] = await Promise.all([
      newParty(browser, 'light', videoDir),
      newParty(browser, 'dark', videoDir),
    ]);
    const { start, end } = await story(s.page, r.page);
    const senderVideo = s.page.video();
    const receiverVideo = r.page.video();
    if (!senderVideo || !receiverVideo) throw new Error('video recording is not available');
    // Closing the contexts finishes the video files.
    await s.context.close();
    await r.context.close();
    encodeGif(ffmpeg, await senderVideo.path(), await receiverVideo.path(), {
      sender: start - s.videoStart,
      receiver: start - r.videoStart,
      duration: end - start,
    });
  } finally {
    await browser?.close();
    stopServer(server);
    rmSync(videoDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
