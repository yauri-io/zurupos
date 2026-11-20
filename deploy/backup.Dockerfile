# The backup service (compose.prod.yml): pg_dump from the Postgres image, plus
# rclone to copy the dumps off the server to Cloudflare R2 (D-052).
FROM postgres:17-alpine
# rclone is configured from RCLONE_CONFIG_R2_* variables; the empty file keeps it quiet.
RUN apk add --no-cache rclone && mkdir -p /root/.config/rclone && touch /root/.config/rclone/rclone.conf
