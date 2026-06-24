# SpikeIQ US — VPS Deployment Guide

Deploy to **https://spikeiq.chickenkiller.com/** alongside existing Docker apps without disrupting them.

## Architecture

```
Internet → Host nginx (port 80) → 127.0.0.1:9080 → spikeiq_nginx container
                                                      ├── frontend:5173
                                                      └── backend:8000
```

- Project name `spikeiq_us` isolates containers/volumes from other stacks.
- Only **127.0.0.1:9080** is exposed on the host (not 80/443/8000/5173).
- IB Gateway, ClickHouse, and Kafka stay on the internal Docker network.

## 1. Clone on VPS

```bash
cd /opt
sudo git clone https://github.com/akram1089/spikeiq_us.git
cd spikeiq_us/docker
cp .env.example .env
nano .env   # set TWS_USERID, TWS_PASSWORD, and other secrets
python3 ../scripts/sync_telegram_env.py   # copy TELEGRAM_* from root .env if present
```

## 2. Start the stack (production)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Verify internal proxy:

```bash
curl -s http://127.0.0.1:9080/api/status
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

## 3. Point the domain (host nginx)

If nginx already serves other sites on the VPS, add the snippet from `deploy/host-nginx-spikeiq.chickenkiller.com.conf`:

```bash
sudo cp /opt/spikeiq_us/deploy/host-nginx-spikeiq.chickenkiller.com.conf /etc/nginx/sites-available/spikeiq.chickenkiller.com
sudo ln -s /etc/nginx/sites-available/spikeiq.chickenkiller.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Ensure DNS for `spikeiq.chickenkiller.com` points to your VPS IP.

## 4. Enable HTTPS (Let's Encrypt)

Your VPS already uses Certbot for other sites. Add SSL for SpikeIQ:

```bash
sudo certbot --nginx -d spikeiq.chickenkiller.com
```

When prompted:
- Enter email for renewal notices
- Agree to terms
- Choose **redirect HTTP → HTTPS** (recommended)

Verify:

```bash
curl -s https://spikeiq.chickenkiller.com/api/status
sudo certbot renew --dry-run
```

Certbot auto-renews. It updates `/etc/nginx/sites-available/spikeiq.chickenkiller.com` with SSL and does not affect other vhosts.

**Important — WebSocket / Market Stream LIVE:** After `certbot --nginx`, open the HTTPS `server { listen 443 ssl; ... }` block and confirm it includes the same WebSocket proxy headers as the HTTP block (`Upgrade`, `Connection $connection_upgrade`, `proxy_read_timeout 86400`). Without these, the dashboard shows **Market Stream OFFLINE** while ticks still ingest to ClickHouse.

```bash
sudo nginx -T | grep -A 30 "server_name spikeiq.chickenkiller.com"
```

If the `443` block is missing upgrade headers, copy them from `deploy/host-nginx-spikeiq.chickenkiller.com.conf` (see the HTTPS comment at the bottom), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Test WebSocket from the VPS:

```bash
# apt install websocat   # if needed
websocat -v "ws://127.0.0.1:9080/api/ws/ticks?symbols=NDX"
```

You should see `{"type":"connected","symbols":["NDX"]}` and backend logs `WebSocket client connected`.

## 5. Updates

```bash
cd /opt/spikeiq_us
git pull
cd docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 6. ClickHouse UI (optional)

SpikeIQ ClickHouse uses host port **8126** (not 8123) to avoid conflicting with other products.

```bash
sudo cp ~/spikeiq_us/deploy/host-nginx-ch.spikeiq.chickenkiller.com.conf \
  /etc/nginx/sites-available/ch.spikeiq.chickenkiller.com
sudo ln -sf /etc/nginx/sites-available/ch.spikeiq.chickenkiller.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ch.spikeiq.chickenkiller.com
```

Add DNS: `ch.spikeiq.chickenkiller.com` → VPS IP.

Open **https://ch.spikeiq.chickenkiller.com/play** (or `http://YOUR_VPS_IP:8126/play`) and log in with `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` from `docker/.env`.

If port 8126 times out from your PC, open the firewall on the VPS:

```bash
sudo ufw allow 8126/tcp
sudo ufw reload
```

## Port reference

| Service     | Production exposure        |
|------------|----------------------------|
| nginx      | 127.0.0.1:9080 (host only) |
| clickhouse | 8126 (host HTTP, public)     |
| backend    | internal only              |
| frontend   | internal only              |
| kafka      | internal only              |
| ib-gateway | 127.0.0.1:4002, :5900 VNC  |

## Troubleshooting

- **502 Bad Gateway**: wait for `ib-gateway` and `backend` to become healthy (`docker compose ps`).
- **Gateway login / 2FA**: connect VNC to `127.0.0.1:5900` (SSH tunnel if remote).
- **Conflicts with other apps**: this stack does not bind host ports 80, 443, 8000, or 5173.
- **Remote users see blank page / Firefox `NS_BINDING_ABORTED` on JS**: host nginx must **not** use `proxy_buffering off` for `/` and `/assets/` (only for `/api/ws/`). Update from `deploy/host-nginx-spikeiq.chickenkiller.com.conf`, then `sudo nginx -t && sudo systemctl reload nginx`. Rebuild frontend so assets are served as a production build (not Vite dev).
- **Telegram goes to bot DM instead of channel**: set `TELEGRAM_CHAT_ID=@YourChannel` in `docker/.env` (not the project root `.env` only). Run `python3 ../scripts/sync_telegram_env.py` from `docker/`, then recreate backend: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend`. Confirm in logs: `Telegram pre-spike alerts → @YourChannel`, or `GET /api/market/pre-spike/alert-config` → `telegram_chat_id`.
