# T08 — Sender view

| Owner | Depends on | Status | Branch |
|---|---|---|---|
| dev | T04, T07, T11 (visuals) | backlog | — |

## Goal
Create session → show link with copy button (and a hint to share it privately) → textarea (10k char limit) →
debounced `text` frames (300 ms, max wait 1 s), throttled `typing`, `beat` every 5 s. Shows receiver status;
input disabled once the session ends.

## Acceptance
- Link contains `#<key>`; the key never appears in any network request (checked in e2e).
- Typing bursts produce bounded frame counts.

## Log
<!-- claim, review, security and QA notes go here, newest last -->
