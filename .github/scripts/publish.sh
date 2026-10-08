#!/usr/bin/env bash
# Publish <apk> as the latest release (the stable download link) and as v<APP_VERSION>; keeps the last 5 version releases.
# <note>, optional, goes at the top of the release notes. Needs GH_TOKEN, APP_VERSION and the full history.
set -euo pipefail
APK=$1
NOTE=${2:-}
# The fixed tag keeps the download link stable; the version tag records history.
git tag -f latest
git tag -f "v$APP_VERSION"
git push -f origin refs/tags/latest "refs/tags/v$APP_VERSION"
# Release notes: the newest CHANGELOG section, then this build's details (dates in IST).
WHATS_NEW=$(awk '/^## /{n++} n==1' CHANGELOG.md)
NOTES="${NOTE:+$NOTE

}$WHATS_NEW

---
Version $APP_VERSION, built from main at ${GITHUB_SHA::7} on $(TZ=Asia/Kolkata date +%Y-%m-%d).

Latest change: $(git log -1 --format=%s)"
[ "$APK" = nirman.apk ] || cp "$APK" nirman.apk
gh release view latest >/dev/null 2>&1 || gh release create latest --title "Nirman v$APP_VERSION" --notes "$NOTES"
gh release edit latest --title "Nirman v$APP_VERSION" --notes "$NOTES" --prerelease=false --latest
gh release upload latest nirman.apk --clobber

# The same APK under its version, to go back to in an emergency (see the README: back up, uninstall, install, restore).
cp nirman.apk "nirman-$APP_VERSION.apk"
gh release view "v$APP_VERSION" >/dev/null 2>&1 || gh release create "v$APP_VERSION" --title "Nirman v$APP_VERSION" --notes "$NOTES" --latest=false
gh release upload "v$APP_VERSION" "nirman-$APP_VERSION.apk" --clobber
# Keep the 5 newest version releases; older ones go, but their v… tags stay as history.
gh release list --limit 200 --json tagName,createdAt --jq '[.[] | select(.tagName | test("^v[0-9]"))] | sort_by(.createdAt) | reverse | .[5:] | .[].tagName' |
  while read -r tag; do gh release delete "$tag" --yes; done
