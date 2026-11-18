# Deploying ZuruPOS

How to run ZuruPOS for real shops: `app.zurupos.com` (owner dashboard) and `api.zurupos.com` (API for the dashboard and the cashier app), on one VPS behind Cloudflare (D-049).

The agent prepares and rehearses this locally. It connects to the server or deploys only when the owner of the project asks for that in the same message (CLAUDE.md, rule 1).

## Overview

```
tablet / phone ──HTTPS──▶ Cloudflare ──HTTPS :9443──▶ Caddy ─┬─▶ dashboard:3000
                                    (origin cert)            └─▶ api:4000 ──▶ postgres
                                                        worker ──▶ postgres, Resend
                                                        backup ──▶ postgres → deploy/backups/
```

Everything is in `deploy/`:

| File | What it is |
|---|---|
| `compose.prod.yml` | The production stack: postgres, migrate, api, worker, dashboard, caddy, backup |
| `Caddyfile` | TLS with the Cloudflare origin certificate, Cloudflare-only access, security headers, real client IP |
| `env.prod.example` | Every production setting. Copy to `deploy/.env.prod` on the server (gitignored) |
| `prod.sh` | `docker compose` with the right file and env file: `deploy/prod.sh ps`, `logs -f api`, … |
| `backup-loop.sh` | Nightly `pg_dump` of `zuru` into `deploy/backups/`, keeps 14 days |
| `restore.sh` | `check` (restore into a scratch database and compare) or `replace` (restore over the live database) |
| `compose.rehearsal.yml` | Local rehearsal only: accepts local IPs, adds Mailpit |

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

## 3. Server setup (once)

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

Add an HTTP monitor for `https://api.zurupos.com/healthz` (expects `"status":"ok"`) and `https://app.zurupos.com` in any uptime checker (the Uptime Kuma already running on the VPS can do it). Logs: `deploy/prod.sh logs -f api worker`. Each container keeps at most 50 MB of logs.

## 4. Cashier app

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

A release build without this file fails on purpose; it never falls back to the debug key.

### Build and install

```sh
apps/cashier/tool/build_release.sh https://api.zurupos.com
adb install apps/cashier/build/app/outputs/flutter-apk/app-release.apk
```

Release builds only talk HTTPS. A tablet that has the **debug** app must uninstall it first, because the signatures differ. Before uninstalling, make sure **Pesanan hari ini** shows no unsent order, because uninstalling deletes the device pairing and any order still waiting on the tablet. Then pair the tablet again, and revoke its old entry in the dashboard under **Perangkat**.

## 5. Updates

```sh
cd ~/zurupos
deploy/prod.sh exec backup /bin/sh /backup/backup-loop.sh now   # backup first
git pull
deploy/prod.sh up -d --build --wait
```

Migrations run automatically (the `migrate` service) before the API starts. They're forward-only: if an update goes wrong, check out the previous commit, rebuild, and if a migration changed data, restore the backup taken just before.

Update outside opening hours. The API restarts in a few seconds; the cashier app shows *Offline* meanwhile and an order completed during the restart waits on the tablet for **Coba lagi**.

## 6. Backups

- **Nightly**: the `backup` service writes `deploy/backups/zuru-YYYYMMDD-HHMM.dump` at 03:00 WIB and deletes dumps older than 14 days. `deploy/prod.sh logs backup` shows each run.
- **On demand**: `deploy/prod.sh exec backup /bin/sh /backup/backup-loop.sh now`.
- **Check a backup** (safe any time; do it monthly): `deploy/restore.sh check zuru-20261201-0300.dump`. It restores into a scratch database, compares row counts with the live one, and drops the scratch database.
- **Restore** (replaces the live data, asks you to type `restore`): `deploy/restore.sh replace zuru-20261201-0300.dump`. The API and worker stop during the restore.
- **Off the server**: dumps on the VPS don't survive losing the VPS. Turn on the provider's weekly droplet backups, and copy the dumps off the server regularly, for example from your computer:

  ```sh
  rsync -av -e "ssh -p <port> -i <key>" <user>@<server>:zurupos/deploy/backups/ ~/zurupos-backups/
  ```

The dumps contain the shop's sales, staff and the hashed passwords and PINs. Keep copies as private as the server.

## Rehearse locally

The whole production stack runs on a development machine with a self-signed certificate and Mailpit instead of Resend. This is how the files in `deploy/` were tested (2026-11-18).

```sh
# Throwaway settings (gitignored): copy env.prod.example to deploy/.env.rehearsal and set
# random passwords, SIGNUP_ENABLED=true, EMAIL_PROVIDER=smtp, SMTP_URL=smtp://mailpit:1025.
mkdir -p deploy/certs && openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -subj "/CN=zurupos rehearsal" -addext "subjectAltName=DNS:app.zurupos.com,DNS:api.zurupos.com" \
  -keyout deploy/certs/origin.key -out deploy/certs/origin.pem
export ZURU_REHEARSAL=1 ZURU_ENV_FILE=deploy/.env.rehearsal
deploy/prod.sh up -d --build --wait
curl -sk --resolve api.zurupos.com:9443:127.0.0.1 https://api.zurupos.com:9443/healthz
pnpm --filter @zurupos/dashboard test:e2e:rehearsal    # signup in a browser over HTTPS
deploy/prod.sh exec -T backup /bin/sh /backup/backup-loop.sh now
deploy/restore.sh check <file>       # and `replace` to rehearse a full restore
deploy/prod.sh down -v               # remove the rehearsal, data included
```

Mail from the rehearsal is at http://localhost:18025.
