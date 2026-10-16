# Install on the existing shared VPS

Use only the `lrmcorp/lrmsmmnew` source tree for this application. This deployment uses Docker and the existing Nginx Proxy Manager network. It does not install a host web server, change DNS/firewall/Docker settings, or modify other applications.

## One-time root setup

Prerequisites: the existing Docker daemon, Compose, Python 3, OpenSSH, sudo, `proxy-net` containing Nginx Proxy Manager. The previous default domain and SSH port are reused. Pick a different free app port with `--port` if 4007 is occupied.

```bash
git clone https://github.com/lrmcorp/lrmsmmnew.git /opt/lrmsmmnew-source
cd /opt/lrmsmmnew-source
python3 deploy/bootstrap.py --domain lrmsosmed.playgo.id --network proxy-net --port 4007 --ssh-port 1506
```

The bootstrap refuses unknown existing files/users, checks the shared proxy network and port, creates a dedicated forced-command deployment account (no shell or Docker-group access), and pins the VPS's locally verified Ed25519 host key. It preserves existing secrets and data on repeat setup. Source files live in `/opt/lrmsmmnew-source`; runtime state lives in `/opt/lrmsmmnew`.

## GitHub Actions

The workflow runs the application tests, checks deployment boundaries, builds a cached Docker image and publishes `ghcr.io/lrmcorp/lrmsmmnew`. Until enabled, it publishes the image but explicitly skips VPS deployment.

On the VPS, use GitHub CLI authenticated to an account that can set secrets in `lrmcorp/lrmsmmnew`:

```bash
gh auth login
python3 /opt/lrmsmmnew-source/deploy/configure-actions.py --host 31.97.51.194 --port 1506
gh workflow run deploy.yml --repo lrmcorp/lrmsmmnew
```

Do not paste private keys or credentials into chat. The helper sends them directly to GitHub through stdin. Alternatively set these five repository secrets manually: `VPS_HOST`, `VPS_PORT`, `VPS_USER=deploy-lrmsmmnew`, `VPS_SSH_KEY` from `/opt/lrmsmmnew/access/actions_ed25519`, and `VPS_KNOWN_HOSTS` from `/opt/lrmsmmnew/access/known_hosts`. Set repository variable `ENABLE_VPS_DEPLOY=true`. Old repository secrets do not automatically transfer.

Each successful push to `main` deploys a digest pinned to this repository. SSH sends only a small JSON request and the ephemeral workflow registry token. Docker pulls missing layers with a 900-second deadline; a slow transfer fails without stopping the running application. The token is removed after the pull. Backups of the private environment and the complete stopped SQLite/media data directory are made under `backups/` before updates. Failed health checks restore the previous data and image. Backups are private and retained; monitor available disk space. Failed new-release data is retained separately for investigation.

Only one application instance runs. Deployment health checks require `mock:false`; simulation mode and public registration are disabled in production. Cached layers reduce transfer size but cannot guarantee network throughput; transfer is bounded to 15 minutes.

## Proxy and HTTPS

In Nginx Proxy Manager create or update only the host `lrmsosmed.playgo.id`:

- Scheme: `http`
- Forward hostname: `lrmsmmnew-app`
- Forward port: `3000`
- Existing `proxy-net` network
- SSL: valid certificate for this hostname; Force SSL

The old `lrmsosmed-app:5000` target is no longer used. DNS can continue pointing to the same VPS. For SSE and uploads, add this host's Advanced settings:

```nginx
client_max_body_size 110m;
proxy_buffering off;
proxy_read_timeout 300s;
```

Verify `https://lrmsosmed.playgo.id/healthz` returns `{"ok":true,"mock":false}`. This proves application reachability, not Instagram publication.

## Owner and Meta credentials

After the first successful deployment:

```bash
python3 /usr/local/sbin/lrmsmmnew-owner
```

Password input is hidden, not passed in command arguments, and never printed. This creates an owner only if the database is empty. This new repository currently uses **email/password** login; username-only login from the retired application is not imported. Public initial setup is disabled so another visitor cannot claim the owner account.

Set the private `IG_APP_ID`, `IG_APP_SECRET`, and optional Threads credentials in `/opt/lrmsmmnew/.env`. Keep `ENCRYPTION_KEY` unchanged. Restart only this application after changing credentials:

```bash
APP_IMAGE="$(cat /opt/lrmsmmnew/current-image)" docker compose -p lrmsmmnew --env-file /opt/lrmsmmnew/.env -f /opt/lrmsmmnew/compose.yml up -d --force-recreate
```

New Instagram callback: `https://lrmsosmed.playgo.id/connect/instagram/callback`. Update Meta's OAuth redirect setting; the retired Postiz callback path does not apply. Reconnect the Instagram accounts in the new app. Consult README for scopes and webhook endpoints, replacing its example domain with `lrmsosmed.playgo.id`.

## Inspect status

```bash
docker ps --filter label=com.docker.compose.project=lrmsmmnew --format 'table {{.Names}}\t{{.Status}}'
cat /opt/lrmsmmnew/current-image
curl -fsS http://127.0.0.1:4007/healthz
```

No deployment to a live VPS or real Meta publication is established by local/mock tests alone.
