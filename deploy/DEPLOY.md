# SpikeIQ US — VPS Deployment Guide

Deploy to **https://spikeiq.mooo.com/** alongside existing Docker apps without disrupting them.

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

If nginx already serves other sites on the VPS, add the snippet from `deploy/host-nginx-spikeiq.mooo.com.conf`:

```bash
sudo cp /opt/spikeiq_us/deploy/host-nginx-spikeiq.mooo.com.conf /etc/nginx/sites-available/spikeiq.mooo.com
sudo ln -s /etc/nginx/sites-available/spikeiq.mooo.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Ensure DNS for `spikeiq.mooo.com` points to your VPS IP.

## 4. Enable HTTPS (Let's Encrypt)

Your VPS already uses Certbot for other sites. Add SSL for SpikeIQ:

```bash
sudo certbot --nginx -d spikeiq.mooo.com
```

When prompted:
- Enter email for renewal notices
- Agree to terms
- Choose **redirect HTTP → HTTPS** (recommended)

Verify:

```bash
curl -s https://spikeiq.mooo.com/api/status
sudo certbot renew --dry-run
```

Certbot auto-renews. It updates `/etc/nginx/sites-available/spikeiq.mooo.com` with SSL and does not affect other vhosts.

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
sudo cp ~/spikeiq_us/deploy/host-nginx-ch.spikeiq.mooo.com.conf \
  /etc/nginx/sites-available/ch.spikeiq.mooo.com
sudo ln -sf /etc/nginx/sites-available/ch.spikeiq.mooo.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ch.spikeiq.mooo.com
```

Add DNS: `ch.spikeiq.mooo.com` → VPS IP.

Open **https://ch.spikeiq.mooo.com/play** (or `http://YOUR_VPS_IP:8126/play`) and log in with `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` from `docker/.env`.

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
