/** Connection states shown in the status pill (docs/design.md, "Status pill"). */
/**
 * `idle` is the sender's last minute before the relay cuts a line that has seen no text change for
 * 10 minutes (the warning starts at 9).
 */
export type LineState = 'waiting' | 'connected' | 'idle' | 'reconnecting' | 'ended';

/** Which can is looking at the pill; the copy differs slightly per side. */
export type CanRole = 'sender' | 'receiver';

/**
 * Icon shapes echo the string metaphor so the state reads without color:
 * a pulsing dot (waiting), a taut line (connected), open scissors over the line (idle), a wavy line
 * (reconnecting), a broken line (ended).
 */
export type PillIcon = 'dot' | 'taut' | 'snip' | 'slack' | 'cut';

export interface PillContent {
  readonly text: string;
  readonly icon: PillIcon;
}

const ICONS: Record<LineState, PillIcon> = {
  waiting: 'dot',
  connected: 'taut',
  idle: 'snip',
  reconnecting: 'slack',
  ended: 'cut',
};

const TEXT: Record<CanRole, Record<LineState, string>> = {
  sender: {
    waiting: 'Waiting for the other can...',
    connected: 'Connected: they can hear you',
    idle: 'Idle: the string will be cut soon',
    reconnecting: 'Line is slack, reconnecting...',
    ended: 'Line cut',
  },
  receiver: {
    // The brief has no receiver "waiting" copy; this covers the moment between Pick up and the first frame.
    waiting: 'Picking up...',
    connected: 'Connected',
    // Only shown if the relay tells the receiver too (T08 decides).
    idle: 'The sender went quiet',
    reconnecting: 'Line is slack, reconnecting...',
    ended: 'Line cut',
  },
};

export function pillContent(state: LineState, role: CanRole): PillContent {
  return { text: TEXT[role][state], icon: ICONS[state] };
}
