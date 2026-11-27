#!/usr/bin/env bash
# Retry only transient repository responses; compiler and test failures still fail immediately.
set -euo pipefail
log=$(mktemp)
trap 'rm -f "$log"' EXIT
for attempt in 1 2 3; do
  set +e
  bash gradlew :app:assembleDebug --no-daemon --max-workers=2 --console=plain 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  set -e
  if [ "$status" -eq 0 ]; then exit 0; fi
  if [ "$attempt" -eq 3 ] || ! grep -Eq 'Received status code (429|502|503|504) from server' "$log"; then
    exit "$status"
  fi
  echo "Repository temporarily unavailable; retry $attempt/3 after backoff."
  sleep "$((attempt * 20))"
done
