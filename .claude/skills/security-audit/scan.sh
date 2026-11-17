#!/usr/bin/env bash
# Local-only scanner runner for the security-audit skill.
#   scan.sh --update-db                 pull pinned images + vuln DBs/rules (the ONLY networked step)
#   scan.sh <outdir> <path> [<path>...] run every scanner with --network none against each path
set -uo pipefail

# Dependency CVEs come from trivy (offline DB). osv-scanner was dropped: its offline mode matched nothing in testing.
# Pinned by digest (tags are mutable: Trivy 0.69.4-0.69.6 were trojanised on Docker Hub, Mar 2026).
# ponytail: bump by hand; pick versions >= 2 weeks old and re-resolve with `docker buildx imagetools inspect`.
GITLEAKS=zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
TRIVY=aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c
SEMGREP=semgrep/semgrep:1.181.0@sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b
CHECKOV=bridgecrew/checkov:3.3.29@sha256:3cc125b5337717b7303dbddd4e79374c120687b5ff6a24f9abdad56b562469f3

CACHE=${SECURITY_AUDIT_CACHE:-$HOME/.cache/security-audit}
SEMGREP_PACKS="default owasp-top-ten typescript javascript nodejs secrets dockerfile terraform kubernetes github-actions"
GIT_SAFE=(-e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*')

die() { echo "error: $*" >&2; exit 1; }
command -v docker >/dev/null && docker info >/dev/null 2>&1 || die "docker is not running"

if [[ "${1:-}" == "--update-db" ]]; then
  mkdir -p "$CACHE"/{trivy,semgrep}
  for img in "$GITLEAKS" "$TRIVY" "$SEMGREP" "$CHECKOV"; do docker pull -q "$img" || die "pull failed: $img"; done
  docker run --rm -v "$CACHE/trivy:/cache" "$TRIVY" image --cache-dir /cache --download-db-only -q || die "trivy db"
  for p in $SEMGREP_PACKS; do
    curl -fsSL "https://semgrep.dev/c/p/$p" -o "$CACHE/semgrep/$p.yml" || { echo "warn: semgrep pack $p"; rm -f "$CACHE/semgrep/$p.yml"; }
  done
  date -u +%FT%TZ > "$CACHE/updated-at"
  echo "cache ready: $CACHE"; exit 0
fi

[[ $# -ge 2 ]] || die "usage: scan.sh --update-db | scan.sh <outdir> <path>..."
[[ -f "$CACHE/updated-at" ]] || die "no cache; run: scan.sh --update-db"
OUT=$(mkdir -p "$1" && cd "$1" && pwd); shift
RUN=(docker run --rm --network none)   # scanners never get network

for p in "$@"; do
  REPO=$(cd "$p" && pwd) || { echo "skip: $p"; continue; }
  NAME=$(basename "$REPO"); SNAP="$OUT/src/$NAME"; R="$OUT/raw/$NAME"
  mkdir -p "$SNAP" "$R"
  echo "== $NAME ($REPO)"

  # Snapshot = tracked + untracked-not-ignored files. Skips node_modules, build output, local DB dirs.
  if git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
    (cd "$REPO" && git ls-files -co --exclude-standard -z | tar --null -T - -cf - 2>/dev/null) | tar -xf - -C "$SNAP"
  else
    tar -C "$REPO" --exclude node_modules --exclude .git --exclude dist --exclude build --exclude .next -cf - . | tar -xf - -C "$SNAP"
  fi

  if [[ -d "$REPO/.git" ]]; then
    "${RUN[@]}" "${GIT_SAFE[@]}" -v "$REPO:/repo:ro" -v "$R:/out" "$GITLEAKS" \
      git /repo --redact=80 --no-banner --exit-code 0 -f json -r /out/gitleaks-history.json 2>"$R/gitleaks-history.log"
  fi
  "${RUN[@]}" -v "$SNAP:/src:ro" -v "$R:/out" "$GITLEAKS" \
    dir /src --redact=80 --no-banner --exit-code 0 -f json -r /out/gitleaks-tree.json 2>"$R/gitleaks-tree.log"

  "${RUN[@]}" -v "$SNAP:/src:ro" -v "$R:/out" -v "$CACHE/trivy:/cache" "$TRIVY" \
    fs --cache-dir /cache --skip-db-update --skip-java-db-update --skip-check-update --offline-scan \
    --scanners vuln,misconfig,secret -q -f json -o /out/trivy.json /src 2>"$R/trivy.log"

  "${RUN[@]}" -v "$SNAP:/src:ro" -v "$R:/out" -v "$CACHE/semgrep:/rules:ro" "$SEMGREP" \
    sh -c 'cd /src && semgrep scan $(for f in /rules/*.yml; do printf -- "--config %s " "$f"; done) --metrics=off --disable-version-check --timeout 10 --max-target-bytes 1000000 --json -o /out/semgrep.json -q .' 2>"$R/semgrep.log"

  "${RUN[@]}" -v "$SNAP:/src:ro" -v "$R:/out" "$CHECKOV" \
    -d /src --skip-download --quiet --compact -o json --output-file-path /out/checkov 2>"$R/checkov.log" >/dev/null

  # Agent-persistence + hidden-instruction inventory (Mini Shai-Hulud, TrapDoor). Reads the REAL repo: these files are often gitignored.
  {
    echo "# agent/editor config files"
    for f in .claude/settings.json .claude/settings.local.json .mcp.json .vscode/tasks.json .vscode/settings.json .cursorrules .cursor/mcp.json CLAUDE.md AGENTS.md .github/copilot-instructions.md; do
      [[ -e "$REPO/$f" ]] && echo "$REPO/$f"
    done
    for f in "$HOME/.claude/settings.json" "$HOME/.claude.json"; do [[ -e "$f" ]] && echo "$f (user-level)"; done
    find "$REPO" -path '*/node_modules' -prune -o \( -path '*/.claude/*' -o -path '*/.cursor/*' \) -type f -print 2>/dev/null
    echo "# stray scripts in .vscode/.claude"
    find "$REPO/.vscode" "$REPO/.claude" -maxdepth 2 -type f \( -name '*.mjs' -o -name '*.js' -o -name '*.cjs' -o -name '*.sh' \) 2>/dev/null
    echo "# hidden/bidi unicode (file:line)"
    find "$SNAP" -type f -size -2M -print0 | xargs -0 perl -CSD -ne 'BEGIN{@ARGV=grep{-T}@ARGV} print "$ARGV:$.\n" if /[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{E0000}-\x{E007F}]/; close ARGV if eof' 2>/dev/null | sed "s#^$SNAP/##"
  } > "$R/agent-config.txt"

  for f in "$R"/*.json "$R"/checkov/*.json; do [[ -s "$f" ]] && printf "  %-28s %s\n" "${f#$R/}" "$(du -h "$f" | cut -f1)"; done
done
echo "raw results: $OUT/raw"
