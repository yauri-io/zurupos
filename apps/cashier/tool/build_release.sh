#!/bin/sh
# Release APK for the shop's tablets (docs/DEPLOY.md, "Cashier app").
#   apps/cashier/tool/build_release.sh https://api.zurupos.com [flutter build args...]
# Extra args go to `flutter build apk`, e.g. `--build-name=0.2.0 --build-number=200`
# (the release workflow sets them from the tag; D-055). Without them, pubspec.yaml's
# version is used.
# Set SENTRY_DSN in the environment to turn on crash reporting (D-053).
# Release builds only allow HTTPS (cleartext is enabled in debug builds only).
set -eu
url=${1:-}
case "$url" in
  https://*) ;;
  *) echo "usage: $0 https://<api domain> [flutter build args...]" >&2; exit 2 ;;
esac
shift
cd "$(dirname "$0")/.."
[ -f android/key.properties ] || { echo "android/key.properties is missing; see docs/DEPLOY.md" >&2; exit 1; }
flutter build apk --release --dart-define=API_BASE_URL="$url" \
  ${SENTRY_DSN:+"--dart-define=SENTRY_DSN=$SENTRY_DSN"} "$@"
echo "APK: $(pwd)/build/app/outputs/flutter-apk/app-release.apk"
