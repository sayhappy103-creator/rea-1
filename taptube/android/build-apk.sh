#!/usr/bin/env bash
# Build a fully self-contained, universal, v1+v2+v3 signed TapTube Reborn APK.
#
# Usage:
#   ./build-apk.sh                 # build release APK
#   SKIP_WEB=1 ./build-apk.sh      # reuse existing ../web-dist
#
# Requirements: Node 18+, JDK 17+, Android SDK (platform 34 + build-tools 34).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(cd "$HERE/.." && pwd)"
ANDROID_DIR="$HERE"
WEB_DIST="$PROJECT/web-dist"
ASSETS_WEB="$HERE/app/src/main/assets/web"
OUT_DIR="$PROJECT/build-output"
OUT_APK="$OUT_DIR/TapTube-1.6.5-Reborn-NoIAP.apk"

echo "==> TapTube Reborn 1.6.5 clean-room APK build"

if [[ "${SKIP_WEB:-0}" != "1" ]]; then
  echo "==> Building web bundle"
  (cd "$PROJECT" && npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund)
  (cd "$PROJECT" && npm run build)
fi

echo "==> Copying web bundle into Android assets"
rm -rf "$ASSETS_WEB"
mkdir -p "$ASSETS_WEB"
cp -R "$WEB_DIST"/. "$ASSETS_WEB"/

echo "==> Preparing signing keystore"
KEYSTORE="$ANDROID_DIR/taptube-reborn.jks"
PROPS="$ANDROID_DIR/keystore.properties"
if [[ ! -f "$KEYSTORE" ]]; then
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias taptube \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass taptube165 -keypass taptube165 \
    -dname "CN=TapTube Reborn, OU=CleanRoom, O=TapTubeReborn, L=ChiangMai, C=TH" \
    -storetype JKS 2>/dev/null
  echo "    generated $KEYSTORE"
fi
cat > "$PROPS" <<EOF
storeFile=taptube-reborn.jks
storePassword=taptube165
keyAlias=taptube
keyPassword=taptube165
EOF

echo "==> Gradle assembleRelease"
cd "$ANDROID_DIR"
if [[ -x ./gradlew ]]; then
  ./gradlew --no-daemon assembleRelease
elif command -v gradle >/dev/null 2>&1; then
  gradle --no-daemon assembleRelease
else
  echo "ERROR: Gradle not found. Install Gradle 8.7+ or use the GitHub Actions workflow." >&2
  exit 1
fi

APK_SRC="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
mkdir -p "$OUT_DIR"
cp "$APK_SRC" "$OUT_APK"

echo "==> Verifying signatures (v1 + v2 + v3)"
if command -v apksigner >/dev/null 2>&1; then
  apksigner verify --verbose --print-certs "$OUT_APK" || true
else
  BT="$(ls -d "${ANDROID_HOME:-$ANDROID_SDK_ROOT}"/build-tools/* 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -n "${BT:-}" && -x "$BT/apksigner" ]]; then
    "$BT/apksigner" verify --verbose --print-certs "$OUT_APK" || true
  else
    echo "    apksigner not found; skipping verification"
  fi
fi

echo "==> Done: $OUT_APK"
ls -lh "$OUT_APK"
