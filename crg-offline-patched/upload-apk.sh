#!/usr/bin/env bash
# Upload the patched CookieRun Classic APK as a GitHub Release asset.
#
# Needs a PAT with `repo` scope (release assets are a private-repo capability)
# on the repo owner below.  Nothing in this script prints the token.
#
#   export GH_TOKEN=ghp_xxx            # or: GITHUB_TOKEN=ghp_xxx
#   ./upload-apk.sh /path/to/CookieRunClassic-offline-patched.apk
#
set -euo pipefail

OWNER="${OWNER:-sayhappy103-creator}"
REPO="${REPO:-rea-1}"
TAG="${TAG:-crg-offline-1.6.5-noiap}"
APK="${1:-$(dirname "$0")/CookieRunClassic-offline-patched.apk}"
API="https://api.github.com"

: "${GH_TOKEN:=${GITHUB_TOKEN:-}}"
if [ -z "$GH_TOKEN" ]; then
  echo "set GH_TOKEN (PAT with repo scope) first" >&2
  exit 1
fi
if [ ! -f "$APK" ]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

echo "==> creating release $OWNER/$REPO @ $TAG"
RELEASE_JSON=$(curl -sS -X POST "$API/repos/$OWNER/$REPO/releases" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  --data-binary @<(python3 - "$TAG" <<'PY'
import json, sys
tag = sys.argv[1]
body = open("RELEASE_NOTES.md", encoding="utf-8").read() if __import__("os").path.exists("RELEASE_NOTES.md") else ""
print(json.dumps({
    "tag_name": tag,
    "name": "CookieRun Classic — Offline / No-Account / Free-IAP (fan patch)",
    "body": body,
    "draft": False,
    "prerelease": True,
}))
PY
))

UPLOAD_URL=$(printf '%s' "$RELEASE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('upload_url',''))")
if [ -z "$UPLOAD_URL" ]; then
  printf '%s\n' "$RELEASE_JSON" >&2
  exit 1
fi

echo "==> uploading asset ($(du -h "$APK" | cut -f1))"
curl -sS -X POST "${UPLOAD_URL}&name=CookieRunClassic-offline-patched.apk" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary "@$APK"

echo
echo "==> done: https://github.com/$OWNER/$REPO/releases/tag/$TAG"
