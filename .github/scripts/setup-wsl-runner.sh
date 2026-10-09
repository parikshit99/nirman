#!/usr/bin/env bash
# Prepares Ubuntu 24.04 in WSL2 on the owner's Windows PC to run CI's app build (the `native` job).
# Run once inside WSL as your normal user (not root): bash .github/scripts/setup-wsl-runner.sh
# Safe to run again. See docs/self-hosted-runner.md for the Windows side and registering the runner.
set -euo pipefail

SDK="$HOME/android-sdk"
# Android command-line tools; any recent version works (newer ones are listed at developer.android.com/studio#command-line-tools-only).
TOOLS_ZIP=commandlinetools-linux-13114758_latest.zip

echo "== Packages (needs your WSL password once)"
sudo apt-get update
sudo apt-get install -y git curl unzip zip ccache openjdk-17-jdk-headless

echo "== Android SDK in $SDK"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$SDK/cmdline-tools"
  curl -fsSLo /tmp/cmdline-tools.zip "https://dl.google.com/android/repository/$TOOLS_ZIP"
  unzip -q -o /tmp/cmdline-tools.zip -d /tmp/cmdline-tools
  rm -rf "$SDK/cmdline-tools/latest"
  mv /tmp/cmdline-tools/cmdline-tools "$SDK/cmdline-tools/latest"
  rm -rf /tmp/cmdline-tools /tmp/cmdline-tools.zip
fi
export ANDROID_HOME="$SDK"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --licenses >/dev/null || true
# Gradle adds the NDK, CMake and platform it needs on the first build (and keeps them); signing needs build-tools.
"$SDKMANAGER" "platform-tools" "build-tools;35.0.0"

echo "== ccache: one cache for every build on this PC"
ccache --max-size=10G

cat <<EOF

Done. Next, register the runner (docs/self-hosted-runner.md, step 4), and put these lines in the .env file
in each runner folder, so jobs find the SDK:

ANDROID_HOME=$SDK
ANDROID_SDK_ROOT=$SDK
JAVA_HOME=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")
LANG=C.UTF-8
EOF
