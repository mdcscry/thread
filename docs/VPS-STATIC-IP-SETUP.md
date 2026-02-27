# VPS Domain & Reverse Proxy Setup

**Document:** VPS-STATIC-IP-SETUP.md  
**Author:** molti  
**Date:** February 26, 2026  
**Status:** Design / Reference  

---

## Overview

One VPS. One public IP. Multiple domains. Caddy handles SSL and routing.

No certbot. No nginx config hell. Caddy fetches Let's Encrypt certs automatically when a domain points at the server.

---

## Architecture

```
Internet
    ↓
DNS: outerfit.net → VPS public IP        (at Cloudflare)
DNS: glyphmatic.us → VPS public IP       (at Cloudflare)
DNS: garden.tbd.com → VPS public IP      (at Cloudflare)
    ↓
VPS :80 / :443
    ↓
Caddy (reverse proxy + auto SSL)
    ↓  routes by domain name
    ├── outerfit.net        → localhost:3000  (THREAD app)
    ├── glyphmatic.us       → localhost:8080  (glyphmatic)
    └── garden.tbd.com      → localhost:3001  (garden service, future)
```

Apps bind to `localhost:PORT` only — never exposed to the internet directly. Caddy is the only process on ports 80 and 443.

---

## Step 1 — Cloudflare DNS

For each domain, add an A record pointing to the VPS public IP.

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | outerfit.net | `<VPS IP>` | DNS only (grey cloud) |
| A | www.outerfit.net | `<VPS IP>` | DNS only (grey cloud) |
| A | glyphmatic.us | `<VPS IP>` | DNS only (grey cloud) |
| A | www.glyphmatic.us | `<VPS IP>` | DNS only (grey cloud) |

**Important:** Set to **DNS only** (grey cloud), not proxied (orange cloud). Caddy needs to receive the raw connection to handle SSL itself. If Cloudflare proxies it, SSL breaks.

---

## Step 2 — Install Caddy on VPS

```bash
# Ubuntu 22.04
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

---

## Step 3 — Caddyfile

Edit `/etc/caddy/Caddyfile`:

```
outerfit.net, www.outerfit.net {
    reverse_proxy localhost:3000
}

glyphmatic.us, www.glyphmatic.us {
    reverse_proxy localhost:8080
}

# Garden service — add when ready
# garden.tbd.com {
#     reverse_proxy localhost:3001
# }
```

Reload Caddy:
```bash
sudo systemctl reload caddy
```

Caddy automatically:
- Fetches SSL certificates from Let's Encrypt
- Renews them before expiry
- Redirects HTTP → HTTPS

---

## Step 4 — App Configuration

Each app must bind to `localhost` only, not `0.0.0.0`.

**THREAD (outerfit) — server/index.js:**
```js
fastify.listen({ port: 3000, host: '127.0.0.1' })
```

**Glyphmatic — whatever serves it:**
```bash
# nginx, python http.server, node, etc — bind to 127.0.0.1:8080
```

**PM2 start:**
```bash
pm2 start "node server/index.js" --name thread
pm2 start "node glyphmatic.js" --name glyphmatic
pm2 save
pm2 startup  # auto-restart on reboot
```

---

## Step 5 — Firewall

Allow only SSH, HTTP, HTTPS:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

App ports (3000, 8080, etc.) are NOT opened — they're internal only.

---

## Verify

```bash
# Check Caddy is running
sudo systemctl status caddy

# Check certs were issued
curl -I https://outerfit.net

# Check app is reachable internally
curl http://localhost:3000/health

# Check logs
sudo journalctl -u caddy -f
```

---

## VPS Details (DatabaseMart)

- **Order:** 5148848963
- **Spec:** RTX Pro 4000 Ada, 24 cores, 60GB RAM, 320GB SSD
- **OS:** Ubuntu 22.04
- **IP:** retrieve from DatabaseMart control panel or `curl ifconfig.me` on server
- **Access:** SSH + Tailscale

---

## Domains

| Domain | App | Port | Status |
|--------|-----|------|--------|
| outerfit.net | THREAD wardrobe app | 3000 | Planned |
| glyphmatic.us | Glyphmatic generative art | 8080 | Planned |
| TBD | Garden Conversation Service | 3001 | Future |

---

## Notes

- Cloudflare DNS propagation takes minutes to a few hours after changing A records
- Caddy won't issue a cert until DNS is resolving to the server — don't reload Caddy until DNS is live
- Multiple domains can share one Caddyfile and one IP indefinitely
- Adding a new domain = one DNS A record + one block in Caddyfile + reload

---

*See also: GARDEN-CONVERSATION-BACKEND.md, DEPLOY.md*
