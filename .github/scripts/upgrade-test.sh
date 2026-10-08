#!/usr/bin/env bash
# The upgrade test (docs/react-native-plan.md, Phase 7), on a running emulator: <6.x apk> <7.x apk> <database>.
# Installs 6.x and gives it the data of a phone that restored e2e/sample-backup.json, installs 7.x over it
# (same id and key, as a phone updates), then checks with Maestro that the lists and totals are all there.
set -euo pipefail
OLD_APK=$1
NEW_APK=$2
DB=$3
PKG=com.nirmaan.auditor
DIR=/data/data/$PKG/databases

adb wait-for-device
adb root
sleep 5
adb wait-for-device

adb install "$OLD_APK"
# Started once, as on a phone: it makes its database and WebView folders.
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1
sleep 25
adb shell am force-stop $PKG
echo "6.x's databases folder:"
adb shell ls -la $DIR || true

# The data, put where 6.x keeps it (6.x's "Restore" writes the same rows through the same core code).
OWNER=$(adb shell stat -c %U /data/data/$PKG | tr -d '\r')
adb shell mkdir -p $DIR
adb shell rm -f $DIR/nirmaanSQLite.db $DIR/nirmaanSQLite.db-wal $DIR/nirmaanSQLite.db-shm $DIR/nirmaanSQLite.db-journal
adb push "$DB" $DIR/nirmaanSQLite.db
adb shell chown "$OWNER:$OWNER" $DIR $DIR/nirmaanSQLite.db
adb shell chmod 660 $DIR/nirmaanSQLite.db
adb shell restorecon -R $DIR

# 7.x over it, keeping the data.
adb install -r "$NEW_APK"
adb shell dumpsys package $PKG | grep -E 'versionName|versionCode' | head -2

status=0
maestro test apps/native/e2e/upgrade.yaml || status=$?
echo "Databases folder after 7.x's first launch:"
adb shell ls -la $DIR || true
if ! adb shell ls $DIR/nirmaan-before-7.db >/dev/null 2>&1; then
  echo "7.x did not keep a copy of the data (nirmaan-before-7.db)"
  status=1
fi
if [ $status -ne 0 ]; then
  adb exec-out screencap -p > upgrade-failure.png || true
  adb logcat -d > upgrade-logcat.txt || true
  echo "::group::The app's process"
  adb shell pidof $PKG || echo "not running"
  echo "::endgroup::"
  echo "::group::Text on the screen"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml | grep -oE '(text|content-desc)="[^"]+"' || true
  echo "::endgroup::"
  echo "::group::Crashes and app log"
  grep -E 'AndroidRuntime|FATAL|ReactNativeJS|ReactNative|Expo|Nirman|SharedFiles|nirmaan' upgrade-logcat.txt | tail -200 || true
  echo "::endgroup::"
fi
exit $status
