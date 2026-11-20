# Deploying ZuruPOS

How to run ZuruPOS for real shops: `app.zurupos.com` (owner dashboard) and `api.zurupos.com` (API for the dashboard and the cashier app), on one VPS behind Cloudflare (D-049).

The agent prepares and rehearses this locally. It connects to the server or deploys only when the owner of the project asks for that in the same message (CLAUDE.md, rule 1).

## Overview

```
tablet / phone ──HTTPS──▶ Cloudflare ──HTTPS :9443──▶ Caddy ─┬─▶ dashboard:3000
                                    (origin cert)            └─▶ api:4000 ──▶ postgres
                                                        worker ──▶ postgres, Resend
                                                        backup ──▶ postgres → deploy/backups/ → Cloudflare R2
```

Everything is in `deploy/`:

| File | What it is |
|---|---|
| `compose.prod.yml` | The production stack: postgres, migrate, api, worker, dashboard, caddy, backup |
| `backup.Dockerfile` | The backup image: Postgres client tools plus rclone for the R2 copy |
| `Caddyfile` | TLS with the Cloudflare origin certificate, Cloudflare-only access, security headers, real client IP |
| `env.prod.example` | Every production setting. Copy to `deploy/.env.prod` on the server (gitignored) |
| `prod.sh` | `docker compose` with the right file and env file: `deploy/prod.sh ps`, `logs -f api`, … |
| `backup-loop.sh` | Nightly `pg_dump` of `zuru` into `deploy/backups/` (keeps 14 days), copies it to R2, pings the backup monitor |
| `restore.sh` | `check` (restore into a scratch database and compare) or `replace` (restore over the live database) |
| `compose.rehearsal.yml` | Local rehearsal only: accepts local IPs, adds Mailpit and a local S3 server in place of R2 |

Only Caddy publishes a port (`HTTPS_PORT`, default 9443). Postgres, the API and the dashboard are reachable only inside the stack. Ports 80 and 443 on the VPS belong to another stack and aren't used.

## 1. Cloudflare (once)

1. Add `zurupos.com` to Cloudflare and set the nameservers at the registrar.
2. **DNS**: `A app → <VPS IP>` and `A api → <VPS IP>`, both **Proxied** (orange cloud).
3. **SSL/TLS → Overview**: mode **Full (strict)**.
4. **SSL/TLS → Origin Server → Create certificate** for `zurupos.com, *.zurupos.com` (RSA, 15 years). Save the certificate as `deploy/certs/origin.pem` and the private key as `deploy/certs/origin.key` on the server (`chmod 600` the key). The key is shown only once.
5. **Rules → Origin Rules → Create rule**: when *Hostname is in* `app.zurupos.com api.zurupos.com`, set *Destination Port* to `9443`.
6. **Security**: leave **Bot Fight Mode** off. It challenges non-browser clients, and the cashier app is one. If the tablet ever gets HTTP 403 from Cloudflare, add a WAF custom rule that skips bot checks for `api.zurupos.com`.

## 2. Email: Resend (once)

1. Create a Resend account, add the domain `zurupos.com`, and add the DNS records Resend shows (DKIM, SPF, MX on the `send` subdomain) in Cloudflare as **DNS only** (grey cloud).
2. Add a DMARC record: `TXT _dmarc` = `v=DMARC1; p=none; rua=mailto:<your address>`.
3. Wait until Resend shows the domain as verified, then create an API key with *Sending access* only. Put it in `RESEND_API_KEY`.

## 3. Off-site backups: Cloudflare R2 (once)

The nightly dumps are copied to an R2 bucket, so losing the VPS doesn't lose the data (D-052). In the Cloudflare dashboard:

1. **R2 Object Storage → Create bucket**: name `zurupos-backups`, location hint *Asia-Pacific*, storage class *Standard*. Leave public access off.
2. In the bucket, **Settings → Object lifecycle rules → Add rule**: apply to all objects, *delete objects 90 days after upload*. The server never deletes anything in the bucket; this rule is what removes old dumps.
3. **R2 Object Storage → Manage API tokens → Create API token**: permission **Object Read & Write**, *Apply to specific buckets only* → `zurupos-backups`, no expiry (or a long one, with a reminder). Cloudflare shows the **Access Key ID**, the **Secret Access Key** (shown only once) and the S3 endpoint `https://<account id>.r2.cloudflarestorage.com`.
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
curl -s https://api.zurupos.com/healthz     # {"status":"ok","db":"ok"}
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

Logs: `deploy/prod.sh logs -f api worker`. Each container keeps at most 50 MB of logs.

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
adb install apps/cashier/build/app/outputs/flutter-apk/app-release.apk
```

Release builds only talk HTTPS. A tablet that has the **debug** app must uninstall it first, because the signatures differ. Before uninstalling, make sure **Pesanan hari ini** shows no unsent order, because uninstalling deletes the device pairing and any order still waiting on the tablet. Then pair the tablet again, and revoke its old entry in the dashboard under **Perangkat**.

## 6. Updates

```sh
cd ~/zurupos
deploy/prod.sh exec backup /bin/sh /backup/backup-loop.sh now   # backup first
git pull
deploy/prod.sh up -d --build --wait
```

Migrations run automatically (the `migrate` service) before the API starts. They're forward-only: if an update goes wrong, check out the previous commit, rebuild, and if a migration changed data, restore the backup taken just before.

Update outside opening hours. The API restarts in a few seconds; the cashier app shows *Offline* meanwhile and an order completed during the restart waits on the tablet for **Coba lagi**.

## 7. Backups

- **Nightly**: the `backup` service writes `deploy/backups/zuru-YYYYMMDD-HHMM.dump` at 03:00 WIB and deletes local dumps older than 14 days. When `R2_BUCKET` is set, it then copies to R2 every dump the bucket doesn't have yet, so a dump whose upload failed goes up the next night. R2 keeps 90 days (the lifecycle rule). `deploy/prod.sh logs backup` shows each run, and the backup monitor alerts on a failure.
- **On demand**: `deploy/prod.sh exec backup /bin/sh /backup/backup-loop.sh now`. It also copies to R2 and pings the monitor.
- **What's in R2**: `deploy/prod.sh exec backup rclone lsl r2:zurupos-backups`.
- **Check a backup** (safe any time; do it monthly): `deploy/restore.sh check zuru-20261201-0300.dump`. It restores into a scratch database, compares row counts with the live one, and drops the scratch database.
- **Restore** (replaces the live data, asks you to type `restore`): `deploy/restore.sh replace zuru-20261201-0300.dump`. The API and worker stop during the restore.
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
  -subj "/CN=zurupos rehearsal" -addext "subjectAltName=DNS:app.zurupos.com,DNS:api.zurupos.com" \
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
