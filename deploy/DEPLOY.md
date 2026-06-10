# SpikeIQ US — VPS Deployment Guide

Deploy to **http://spikeiq.mooo.com/** alongside existing Docker apps without disrupting them.

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

## 4. Updates

```bash
cd /opt/spikeiq_us
git pull
cd docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Port reference

| Service     | Production exposure        |
|------------|----------------------------|
| nginx      | 127.0.0.1:9080 (host only) |
| backend    | internal only              |
| frontend   | internal only              |
| clickhouse | internal only              |
| kafka      | internal only              |
| ib-gateway | 127.0.0.1:4002, :5900 VNC  |

## Troubleshooting

- **502 Bad Gateway**: wait for `ib-gateway` and `backend` to become healthy (`docker compose ps`).
- **Gateway login / 2FA**: connect VNC to `127.0.0.1:5900` (SSH tunnel if remote).
- **Conflicts with other apps**: this stack does not bind host ports 80, 443, 8000, or 5173.
