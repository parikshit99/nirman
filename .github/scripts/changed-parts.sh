#!/usr/bin/env bash
# Whether a pull request touches the Android build itself: <base commit>. Writes android=true|false to $GITHUB_OUTPUT.
# The app's own code is checked by CI's `test` job (lint, unit tests, bundling); the APK build adds the Kotlin module,
# native libraries, Gradle and Expo config, icons, dependencies and CI itself. Needs the full history (fetch-depth: 0).
set -euo pipefail
android=false
while IFS= read -r f; do
  case "$f" in
    apps/native/modules/* | apps/native/app.config.ts | apps/native/assets/* | apps/native/package.json | package.json | package-lock.json | .github/*)
      android=true ;;
  esac
done < <(git diff --name-only "$1" HEAD)
echo "android=$android" >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "Touches the Android build: $android"
