# Deploying ZuruPOS

How to run ZuruPOS for real shops: `zurupos.com` (landing page), `app.zurupos.com` (owner dashboard) and `api.zurupos.com` (API for the dashboard and the cashier app), on one VPS behind Cloudflare (D-049).

The agent prepares and rehearses this locally. It connects to the server or deploys only when the owner of the project asks for that in the same message (CLAUDE.md, rule 1).

## Overview

```
tablet / phone ──HTTPS──▶ Cloudflare ──HTTPS :9443──▶ Caddy ─┬─▶ apps/landing (static)
                                                              ├─▶ dashboard:3000
                                    (origin cert)            └─▶ api:4000 ──▶ postgres
                                                        worker ──▶ postgres, Resend
                                                     scheduler ──▶ postgres (report emails into the outbox)
                                                        backup ──▶ postgres → deploy/backups/ → Cloudflare R2
```

Everything is in `deploy/`:

| File | What it is |
|---|---|
| `compose.prod.yml` | The production stack: postgres, migrate, api, worker, scheduler, dashboard, caddy, backup |
| `backup.Dockerfile` | The backup image: Postgres client tools plus rclone for the R2 copy |
| `Caddyfile` | TLS with the Cloudflare origin certificate, Cloudflare-only access, security headers, real client IP, the landing page |
| `env.prod.example` | Every production setting. Copy to `deploy/.env.prod` on the server (gitignored) |
| `prod.sh` | `docker compose` with the right file and env file: `deploy/prod.sh ps`, `logs -f api`, … |
| `backup-loop.sh` | Nightly `pg_dump` of `zuru` into `deploy/backups/` (keeps 14 days), copies it to R2, pings the backup monitor |
| `restore.sh` | `check` (restore into a scratch database and compare) or `replace` (restore over the live database) |
| `compose.rehearsal.yml` | Local rehearsal only: accepts local IPs, adds Mailpit and a local S3 server in place of R2 |

Only Caddy publishes a port (`HTTPS_PORT`, default 9443). Postgres, the API and the dashboard are reachable only inside the stack. Ports 80 and 443 on the VPS belong to another stack and aren't used.

## 1. Cloudflare (once)

1. Add `zurupos.com` to Cloudflare and set the nameservers at the registrar.
2. **DNS**: `A app → <VPS IP>`, `A api → <VPS IP>`, `A @ → <VPS IP>` (the landing page) and `CNAME www → zurupos.com`, all **Proxied** (orange cloud).
3. **SSL/TLS → Overview**: mode **Full (strict)**.
4. **SSL/TLS → Origin Server → Create certificate** for `zurupos.com, *.zurupos.com` (RSA, 15 years). Save the certificate as `deploy/certs/origin.pem` and the private key as `deploy/certs/origin.key` on the server (`chmod 600` the key). The key is shown only once.
5. **Rules → Origin Rules → Create rule**: when *Hostname is in* `zurupos.com www.zurupos.com app.zurupos.com api.zurupos.com`, set *Destination Port* to `9443`. (Adding the landing page later: add `zurupos.com` and `www.zurupos.com` to the existing rule.)
6. **Security**: leave **Bot Fight Mode** off. It challenges non-browser clients, and the cashier app is one. If the tablet ever gets HTTP 403 from Cloudflare, add a WAF custom rule that skips bot checks for `api.zurupos.com`.

## 2. Email: Resend (once)

1. Create a Resend account, add the domain `zurupos.com`, and add the DNS records Resend shows (DKIM, SPF, MX on the `send` subdomain) in Cloudflare as **DNS only** (grey cloud).
2. Add a DMARC record: `TXT _dmarc` = `v=DMARC1; p=none; rua=mailto:<your address>`.
3. Wait until Resend shows the domain as verified, then create an API key with *Sending access* only. Put it in `RESEND_API_KEY`.

## 3. Off-site backups: Cloudflare R2 (once)

The nightly dumps are copied to an R2 bucket, so losing the VPS doesn't lose the data (D-052). In the Cloudflare dashboard:

1. **R2 Object Storage → Create bucket**: name `zurupos-backups`, location hint *Asia-Pacific*, storage class *Standard*. Leave public access off.
2. In the bucket, **Settings → Object lifecycle rules → Add rule**: apply to all objects, *delete objects 90 days after upload*. The server never deletes anything in the bucket; this rule is what removes old dumps.
3. **R2 Object Storage → Manage API tokens → Create API token**: permission **Object Read & Write**, *Apply to specific buckets only* → `zurupos-backups`, no expiry (or a long one, with a reminder). Cloudflare shows the **Access Key ID**, the **Secret Access Key** (shown only once) and the S3 endpoint `https://<account id>.r2.cloudflarestorage.com`. The bucket's settings page shows the endpoint with `/zurupos-backups` on the end: leave that part off, or the dumps end up in a `zurupos-backups/` folder inside the bucket and the backup reports a failure.
4. On the server, put them in `deploy/.env.prod`: `R2_BUCKET=zurupos-backups`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Then `deploy/prod.sh up -d --build backup` and take one backup now (section 7) to check that it reaches the bucket.

The dumps hold the shop's sales, staff names and the hashed passwords and PINs. Keep the bucket private and the token limited to this one bucket.

## 4. Server setup (once)

The server needs Docker with the Compose plugin and a checkout of this repository in `~/zurupos`.

```sh
cd ~/zurupos
git pull
cp deploy/env.prod.example deploy/.env.prod && chmod 600 deploy/.env.prod
# Fill in deploy/.env.prod. One random password per role:
openssl rand -base64 32 | tr -d '/+='
mkdir -p deploy/certs   # origin.pem + origin.key from step 1.4
deploy/prod.sh up -d --build --wait
deploy/prod.sh ps
curl -s https://api.zurupos.com/healthz     # {"status":"ok","db":"ok","version":"2026.11.24-debc0cb"}
```

The first start creates the database roles (`db/init/00-roles.sh` with `ZURU_DATABASES=zuru`) and runs the migrations. Postgres keeps its data in the `zurupos-prod_pgdata` volume.

Keep a copy of `deploy/.env.prod` somewhere safe off the server (a password manager). Without the passwords a restored backup still works, but you'd have to set new ones.

### Create the pilot shop

Public signup stays off (D-017). To create the shop:

1. Set `SIGNUP_ENABLED=true` in `deploy/.env.prod`, then `deploy/prod.sh up -d api`.
2. Sign up at `https://app.zurupos.com/signup` with the owner's real email.
3. Set `SIGNUP_ENABLED=false` again, then `deploy/prod.sh up -d api`. `https://api.zurupos.com/v1/auth/signup` now returns 404.
4. Invite a manager from **Staf** and check that the invite email arrives. This is UAT item 2 with real email.

### Monitoring

Use monitors that run **outside** the VPS. One on the same server can't tell you the server is down.

1. **Uptime: UptimeRobot** (free plan, a check every 5 minutes, alerts by email and in its phone app). Add two monitors:
   - *Keyword* monitor, URL `https://api.zurupos.com/healthz`, keyword `"status":"ok"`, alert when the keyword is **not** found. The API answers this only when it can reach the database, so it catches a stopped API, a stopped Postgres and an unreachable server. Through Cloudflare a down origin shows as a 52x error, which also alerts.
   - *HTTP(s)* monitor, URL `https://app.zurupos.com/login`, for the dashboard.

   Add the owner's email (and the developer's) as alert contacts.
2. **Backups: Healthchecks.io** (free plan). This is a dead man's switch: it alerts when the nightly backup *doesn't* report in.
   - Create a check named `zurupos backup`, with schedule *Simple*, period **1 day** and grace **2 hours**.
   - Put its ping URL (`https://hc-ping.com/<uuid>`) in `BACKUP_PING_URL` in `deploy/.env.prod`, then run `deploy/prod.sh up -d backup`.
   - Every good backup pings the URL. A failed dump or failed R2 copy pings `<url>/fail` and alerts at once. If no ping comes at all (the service stopped, or the server is down), it alerts at about 05:00 WIB.

Logs: `deploy/prod.sh logs -f api worker scheduler`. Each container keeps at most 50 MB of logs.

Report emails (SPEC §12.6): the `scheduler` service checks every 5 minutes which daily (07:00 shop time) and weekly (Monday 07:30) summaries are due and queues them; the worker sends them. It logs one `report pass` line whenever it queued or skipped something, with counts only. Owners turn the emails off in the dashboard under *Pengaturan → Peringatan & perangkat*.

### Error reporting: Sentry (optional)

Sentry collects crashes and unexpected errors from the API, the outbox worker, the dashboard and the cashier app (D-053). Everything stays off until a DSN is set.

1. In Sentry, create three projects: **zurupos-api** (Node.js), **zurupos-dashboard** (Vue) and **zurupos-cashier** (Flutter). Copy each project's DSN (*Settings → Client Keys (DSN)*).
2. In `deploy/.env.prod` set `SENTRY_DSN` (the API project; the worker uses it too) and `NUXT_PUBLIC_SENTRY_DSN` (the dashboard project). Leave `SENTRY_RELEASE` empty: errors are tagged with the build version (D-057).
3. `deploy/prod.sh up -d api worker dashboard caddy`. Caddy needs the restart for the new CSP, which lets the dashboard reach `*.sentry.io`.
4. For the app, build with the cashier project's DSN: `SENTRY_DSN=<dsn> apps/cashier/tool/build_release.sh https://api.zurupos.com`.
5. In each project, add an alert rule that emails the developer on a new issue.
6. Send a test event. Healthy services can leave Sentry empty for days, because only real failures are reported.
   - API (change `api` to `worker` for the worker; it prints Sentry's status and reason):

     ```sh
     deploy/prod.sh exec -T api node --input-type=module -e '
     const u = new URL(process.env.SENTRY_DSN)
     const body = JSON.stringify({ dsn: u.href }) + "\n" + JSON.stringify({ type: "event" }) + "\n" +
       JSON.stringify({ message: "Sentry test (api)", level: "error", platform: "node" }) + "\n"
     const res = await fetch("https://" + u.host + "/api" + u.pathname + "/envelope/", {
       method: "POST",
       headers: { "Content-Type": "application/x-sentry-envelope",
                  "X-Sentry-Auth": "Sentry sentry_version=7, sentry_key=" + u.username },
       body })
     console.log(res.status, await res.text())'
     ```

     `200` means the event arrived. `403` means Sentry refused it: the key is disabled, the key and project ID don't match, or the project or plan isn't active. The reply says which. No `SENTRY_DSN` in the container means `.env.prod` changed after it started; recreate it with `deploy/prod.sh up -d api worker`.
   - Dashboard: in the browser console on the dashboard, `setTimeout(() => { throw new Error('Sentry test (dashboard)') })`. An error thrown directly in the console isn't reported.

What is sent: the error, its stack trace, the request method and route, the request id (also in the `x-request-id` response header and the API logs), the shop's tenant id, and the browser or app version. What is never sent: request bodies (PINs, passwords, customer names), cookies, auth and device tokens, query strings, invite and reset tokens, IP addresses, emails, and screenshots. Expected failures (4xx answers, lost connections on the tablet) aren't reported.

### Login bot check: Cloudflare Turnstile (optional)

The dashboard login can require a Cloudflare Turnstile challenge (D-064). It's off until both keys are set. Only dashboard login is checked: signup, password reset and the cashier app are not.

1. In Cloudflare, **Turnstile → Add widget**: name `zurupos-dashboard`, hostname `app.zurupos.com` (add `localhost` only for a rehearsal), mode **Managed**. Copy the site key and the secret key.
2. In `deploy/.env.prod` set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Set both or neither: with only the secret, every login is refused.
3. `deploy/prod.sh up -d api dashboard caddy`. Caddy needs the restart for the new CSP, which lets the login page load the Turnstile script and its iframe.
4. Sign out and back in at `https://app.zurupos.com/login`. The widget shows above *Masuk* and the button stays disabled until it passes.

The check fails closed: if the API can't reach Cloudflare, logins are refused and the API logs `turnstile siteverify unavailable`. To turn it off in an emergency, empty `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` and run step 3 again.

## 5. Cashier app

### Release key (once, on your computer)

The release APK is signed with your own key. **Every future update must be signed with the same key**, or Android refuses to install it over the existing app. Keep the keystore and its password in two safe places.

```sh
mkdir -p ~/zurupos-keys
keytool -genkeypair -v -keystore ~/zurupos-keys/zurupos-release.jks \
  -alias zurupos -keyalg RSA -keysize 2048 -validity 10000
```

Then create `apps/cashier/android/key.properties` (gitignored):

```properties
storeFile=/Users/<you>/zurupos-keys/zurupos-release.jks
storePassword=<password>
keyAlias=zurupos
keyPassword=<password>
```

Replace `<you>` and the passwords with the real values. A release build fails on purpose, with a message saying what's wrong, if this file, a value or the keystore is missing; it never falls back to the debug key.

Build the release APK with the script below, not Android Studio's *Build → Generate Signed App Bundle or APK*. Android Studio doesn't pass the API address, so its APK would point at the emulator address (`10.0.2.2`) and couldn't reach the server.

### Build and install

```sh
apps/cashier/tool/build_release.sh https://api.zurupos.com
# with crash reporting (section 4, "Error reporting"):
# SENTRY_DSN=<cashier dsn> apps/cashier/tool/build_release.sh https://api.zurupos.com
adb install apps/cashier/build/app/outputs/flutter-apk/app-release.apk
```

Release builds only talk HTTPS. A tablet that has the **debug** app must uninstall it first, because the signatures differ. Before uninstalling, make sure **Pesanan hari ini** shows no unsent order, because uninstalling deletes the device pairing and any order still waiting on the tablet. Then pair the tablet again, and revoke its old entry in the dashboard under **Perangkat**.

### Automatic release (GitHub Actions)

`.github/workflows/cashier-release.yml` builds, signs and publishes the release APK when you push a tag like `cashier-v0.2.0` (D-055). Normal pushes never build a release. Downloads:

- Latest: `https://dl.zurupos.com/cashier/zurupos-cashier.apk`
- One version: `https://dl.zurupos.com/cashier/zurupos-cashier-0.2.0.apk` (kept for rollback), with a `.sha256` next to it
- `https://dl.zurupos.com/cashier/latest.json`: version, version code, URL, size, SHA-256, date

The same files are attached to a GitHub Release for the tag.

**One-time setup**

1. **R2 bucket** (Cloudflare → R2): create `zurupos-downloads`. Don't reuse the backup bucket, which must stay private.
   - *Settings → Custom Domains → Connect domain* `dl.zurupos.com`. That makes the bucket readable at that address and nowhere else. Leave the `r2.dev` URL off.
   - *R2 → Manage API tokens → Create API token*: **Object Read & Write**, limited to `zurupos-downloads` only. Note the Access Key ID, the Secret Access Key and your Account ID.
2. **Signing certificate fingerprint**, from the same keystore as above:

   ```sh
   keytool -list -v -keystore ~/zurupos-keys/zurupos-release.jks -alias zurupos | grep SHA256
   ```

   The workflow refuses to publish an APK signed with any other key, because tablets would refuse it as an update.
3. **GitHub environment** (repo → *Settings → Environments → New environment*): `production`.
   - *Required reviewers*: yourself. Every release waits for your approval before the job can read the signing key.
   - *Deployment branches and tags*: *Selected branches and tags*, add the tag rule `cashier-v*`.
4. **Environment secrets** (in `production`):

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | `base64 -i ~/zurupos-keys/zurupos-release.jks \| pbcopy`, then paste |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
   | `ANDROID_KEY_ALIAS` | `zurupos` |
   | `ANDROID_KEY_PASSWORD` | the key password |
   | `R2_ACCOUNT_ID` | Cloudflare account ID |
   | `R2_ACCESS_KEY_ID` | from step 1 |
   | `R2_SECRET_ACCESS_KEY` | from step 1 |
   | `CASHIER_SENTRY_DSN` | the cashier app's Sentry DSN (optional; leave it out for no crash reporting) |

5. **Environment variables** (in `production`, not secret):

   | Variable | Value |
   |---|---|
   | `R2_DOWNLOADS_BUCKET` | `zurupos-downloads` |
   | `ANDROID_SIGNING_CERT_SHA256` | the SHA256 from step 2 (colons are fine) |

6. **Tag protection** (repo → *Settings → Rules → Rulesets → New tag ruleset*): target `cashier-v*`, restrict creation, update and deletion to yourself.

**Releasing**

```sh
git switch main && git pull
git tag cashier-v0.2.0
git push origin cashier-v0.2.0
```

Then approve the run under *Actions*. The version comes from the tag (`MAJOR.MINOR.PATCH`, minor and patch 0–99). The Android version code is `MAJOR*10000 + MINOR*100 + PATCH`, so `0.2.0` is 200. The run stops without publishing if:
- the tagged commit isn't on `main`
- that version is already in the bucket
- `flutter analyze` or `flutter test` fails
- the APK isn't signed with the release certificate

To release again, bump the version; never move a tag.

On the tablet, open the latest link in the browser and install over the old app. The first time, Android asks to allow installs from the browser.

## 6. Updates

```sh
cd ~/zurupos
deploy/prod.sh exec backup /bin/sh /backup/backup-loop.sh now   # backup first
git pull
deploy/prod.sh up -d --build --wait
```

`deploy/prod.sh` names the build after the commit: its date and short hash, e.g. `2026.11.24-debc0cb` (`-modified` if tracked files were changed on the server). The version is baked into the images, so check it after an update:

```sh
curl -s https://api.zurupos.com/healthz   # "version":"2026.11.24-debc0cb"
```

The dashboard shows it under the user's name in the sidebar and below the login form. Open dashboard tabs notice the new version within 5 minutes, or when the tab is shown again, and offer **Muat ulang**.

Migrations run automatically (the `migrate` service) before the API starts. They're forward-only: if an update goes wrong, check out the previous commit, rebuild, and if a migration changed data, restore the backup taken just before.

Update outside opening hours. The API restarts in a few seconds; the cashier app shows *Offline* meanwhile and an order completed during the restart waits on the tablet for **Coba lagi**.

## 7. Backups

- **Nightly**: the `backup` service writes `deploy/backups/zuru-YYYYMMDD-HHMM.dump` at 03:00 WIB and deletes local dumps older than 14 days. When `R2_BUCKET` is set, it then copies to R2 every dump the bucket doesn't have yet, so a dump whose upload failed goes up the next night. R2 keeps 90 days (the lifecycle rule). `deploy/prod.sh logs backup` shows each run, and the backup monitor alerts on a failure.
- **On demand**: `deploy/prod.sh exec backup /bin/sh /backup/backup-loop.sh now`. It also copies to R2 and pings the monitor.
- **What's in R2**: `deploy/prod.sh exec backup rclone lsl r2:zurupos-backups`.
- **Check a backup** (safe any time; do it monthly): `deploy/restore.sh check zuru-20261201-0300.dump`. It restores into a scratch database, compares row counts with the live one, and drops the scratch database.
- **Restore** (replaces the live data, asks you to type `restore`): `deploy/restore.sh replace zuru-20261201-0300.dump`. The API, worker and scheduler stop during the restore.
- **Restore from R2** (for example on a new server, after section 4): fetch the dump into `deploy/backups/`, then check or restore it as above.

  ```sh
  deploy/prod.sh exec backup rclone copy r2:zurupos-backups/zuru-20261201-0300.dump /backups/
  deploy/restore.sh check zuru-20261201-0300.dump
  ```

  The R2 settings in `deploy/.env.prod` are needed for this, so keep a copy of that file off the server (section 4).
- **Droplet backups**: also turn on the provider's weekly droplet backups. They restore the whole server, certificates and settings included.

The dumps contain the shop's sales, staff and the hashed passwords and PINs. Keep copies as private as the server.

## Rehearse locally

The whole production stack runs on a development machine with a self-signed certificate and Mailpit instead of Resend. This is how the files in `deploy/` were tested (2026-11-18).

```sh
# Throwaway settings (gitignored): copy env.prod.example to deploy/.env.rehearsal and set
# random passwords, SIGNUP_ENABLED=true, EMAIL_PROVIDER=smtp, SMTP_URL=smtp://mailpit:1025,
# and the local S3 server: R2_BUCKET=zurupos-backups, R2_ENDPOINT=http://s3:9000,
# R2_ACCESS_KEY_ID=rehearsal, R2_SECRET_ACCESS_KEY=rehearsal-secret.
mkdir -p deploy/certs && openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -subj "/CN=zurupos rehearsal" -addext "subjectAltName=DNS:app.zurupos.com,DNS:api.zurupos.com,DNS:zurupos.com,DNS:www.zurupos.com" \
  -keyout deploy/certs/origin.key -out deploy/certs/origin.pem
export ZURU_REHEARSAL=1 ZURU_ENV_FILE=deploy/.env.rehearsal
deploy/prod.sh up -d --build --wait
curl -sk --resolve api.zurupos.com:9443:127.0.0.1 https://api.zurupos.com:9443/healthz
pnpm --filter @zurupos/dashboard test:e2e:rehearsal    # signup in a browser over HTTPS
deploy/prod.sh exec -T backup /bin/sh /backup/backup-loop.sh now   # and copies it to the local S3
deploy/prod.sh exec -T backup rclone lsl r2:zurupos-backups
deploy/restore.sh check <file>       # and `replace` to rehearse a full restore
deploy/prod.sh down -v               # remove the rehearsal, data included
```

Mail from the rehearsal is at http://localhost:18025.

## Landing page

`apps/landing/` is the static site at `zurupos.com`: plain HTML, CSS and one small script, with the font and images hosted alongside it. Caddy serves the folder directly (mounted read-only), so a `git pull` publishes changes to it; only a change to the Caddyfile needs Caddy to reload it. The Caddyfile is a single-file bind mount, and `git pull` replaces the file rather than editing it, so the running container can keep seeing the old one: check with `deploy/prod.sh exec -T caddy cat /etc/caddy/Caddyfile`, then `deploy/prod.sh exec -T caddy caddy reload --config /etc/caddy/Caddyfile` if it is current, or `deploy/prod.sh up -d --force-recreate --no-deps caddy` if not (a few seconds offline for all three domains; without `--no-deps` it restarts the API and dashboard too). `www.zurupos.com` redirects to `zurupos.com`. Its images come from `python3 docs/brand/generate_icons.py` (BRAND.md).

To preview it on your computer: `python3 -m http.server -d apps/landing 8765`, then open http://localhost:8765.
