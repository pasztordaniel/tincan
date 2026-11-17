# 0002 — Send full text state, not diffs

**Context.** Live typing could send keystroke diffs (small) or the full text (simple).

**Decision.** Every content frame carries the complete text (padded).

**Consequences.** No ordering/merge logic; a dropped frame only delays; reconnect = resend latest; replay checks are a
single `seq > lastSeq`. Costs more bandwidth, bounded by the 10k-character limit and debounce. Diffs would also leak
finer-grained edit patterns.
