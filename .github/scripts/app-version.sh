#!/usr/bin/env bash
# The app version, "<major.minor>.<patch>": major.minor from apps/native/package.json (set by hand, see CLAUDE.md),
# patch = the number of changes on this branch since it was set (2.2.0, 2.2.1 ... back to .0 at the next bump).
# Sets APP_VERSION in $GITHUB_ENV and `version` in $GITHUB_OUTPUT. Needs the full history (fetch-depth: 0).
set -euo pipefail
PKG=apps/native/package.json
MAJOR_MINOR=$(node -p "require('./$PKG').version.split('.').slice(0, 2).join('.')")
BUMPED_AT=$(git log -1 --format=%H -G'"version":' -- "$PKG")
PATCH=$(git rev-list --count "$BUMPED_AT..HEAD")
echo "APP_VERSION=$MAJOR_MINOR.$PATCH" >> "$GITHUB_ENV"
echo "version=$MAJOR_MINOR.$PATCH" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "Version $MAJOR_MINOR.$PATCH ($PATCH changes since $MAJOR_MINOR was set in ${BUMPED_AT::7})"
