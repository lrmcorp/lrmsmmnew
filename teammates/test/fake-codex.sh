#!/usr/bin/env bash
# A stand-in for the Codex CLI, so the bridge can be tested end to end without a
# ChatGPT account, a network call or any spend. It honours only the surface the
# bridge actually uses.
#
# State is read from a file beside this script rather than the environment,
# because the bridge deliberately runs Codex with a minimal environment and the
# fixture must not need an exemption from that.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
CONTROL="$DIR/fake-control.env"
ARGLOG="$DIR/fake-args.log"
SIGNED_IN=1; REPLY_TEXT="Hello from the plan."; FAIL=0; FAIL_MSG="boom"; RESUME_FAILS=0; HANG=0
# shellcheck disable=SC1090
[ -f "$CONTROL" ] && . "$CONTROL"

printf '%s\n' "$*" >> "$ARGLOG"

if [ "${1:-}" = "login" ]; then
  if [ "${2:-}" = "status" ]; then
    [ "$SIGNED_IN" = "1" ] && echo "Signed in with ChatGPT (Plus)" || echo "Not logged in"
    exit 0
  fi
  echo "device code flow"; exit 0
fi

[ "${1:-}" = "exec" ] || { echo "unexpected command: $*" >&2; exit 64; }

# A resume the fixture has been told to reject, so the restart path can be tested.
if [ "${2:-}" = "resume" ] && [ "$RESUME_FAILS" = "1" ]; then
  echo "error: no session to resume" >&2; exit 1
fi

out=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output-last-message) out="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

[ "$FAIL" = "1" ] && { echo "$FAIL_MSG" >&2; exit 1; }
[ "$HANG" = "1" ] && { sleep 120; exit 0; }
[ -n "$out" ] && printf '%s' "$REPLY_TEXT" > "$out"
exit 0
