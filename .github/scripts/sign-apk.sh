#!/usr/bin/env bash
# Sign an APK the way every Nirman build is signed: <input.apk> <output.apk>.
# With the release key from the repo secrets, with a rotation record from the old debug key
# (APK signature v3), so phones that have a debug-signed build still accept this one as an update.
# Without the secrets (e.g. a pull request from a fork) it is signed with the debug key alone.
# Any signature already on the input is replaced. Sets APKSIGNER in $GITHUB_ENV for later steps.
set -euo pipefail
IN=$1
OUT=$2
BUILD_TOOLS=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
APKSIGNER="$BUILD_TOOLS/apksigner"
echo "APKSIGNER=$APKSIGNER" >> "$GITHUB_ENV"
DEBUG_KEY=(--ks .github/keys/debug.keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android)
if [ -n "${RELEASE_KEYSTORE_BASE64:-}" ]; then
  echo "$RELEASE_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/release.p12"
  RELEASE_KEY=(--ks "$RUNNER_TEMP/release.p12" --ks-pass env:RELEASE_KEYSTORE_PASSWORD --ks-key-alias nirman)
  "$APKSIGNER" rotate --out "$RUNNER_TEMP/lineage" --old-signer "${DEBUG_KEY[@]}" --new-signer "${RELEASE_KEY[@]}"
  "$APKSIGNER" sign --lineage "$RUNNER_TEMP/lineage" --rotation-min-sdk-version 28 --out "$OUT" "${DEBUG_KEY[@]}" --next-signer "${RELEASE_KEY[@]}" "$IN"
  rm "$RUNNER_TEMP/release.p12" "$RUNNER_TEMP/lineage"
else
  echo "::warning::No release key in the repo secrets; signing with the debug key only"
  "$APKSIGNER" sign --out "$OUT" "${DEBUG_KEY[@]}" "$IN"
fi
"$APKSIGNER" verify --verbose --print-certs "$OUT" | grep -E 'Verified using|certificate DN|SHA-256'
"$APKSIGNER" lineage --in "$OUT" --print-certs 2>/dev/null | grep -E 'DN|SHA-256' || echo "No key rotation in this APK"
# No API key may ever be bundled in the app.
if unzip -p "$OUT" | grep -a -q -E "AIza[0-9A-Za-z_-]{35}"; then
  echo "The APK contains something that looks like a Google API key"
  exit 1
fi
