# ZuruPOS cashier app

Flutter Android app for the counter (SPEC §11). Bahasa Indonesia by default, English in Settings.

```sh
flutter pub get
flutter analyze && flutter test

# Against the local stack (docker compose up -d --build --wait, from the repo root)
ZURU_API_URL=http://localhost:4000 flutter test test/integration

# On a device: the API address is a build-time setting.
# The emulator reaches the host's localhost at 10.0.2.2 (the default).
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:4000
```

First launch: an owner or manager pairs the tablet with their email and password
(the shop must exist first; signup is an API call in M4, see CLAUDE.md). Staff then pick their name and enter their PIN.

Layout: `lib/domain` pure logic (pricing port, cart, modifier selection, payment),
`lib/api` HTTP client, `lib/data` drift + secure storage, `lib/state` Riverpod,
`lib/ui` screens. `test/fixtures/pricing-cases.json` is a copy of the API's
(`pnpm cashier:fixtures`); a test fails if they differ.
