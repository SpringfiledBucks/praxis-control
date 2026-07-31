# Standard single-node cloud deployment

This profile runs the shared Web/API service with PostgreSQL on one Linux host.
It is independent from `infra/full` and does not modify the current NAS stack.

## Boundary

- PostgreSQL is reachable only on the internal Compose network.
- The application is published only on host loopback. Put an HTTPS reverse
  proxy on the same host in front of it; never publish the application or
  database directly to the public network.
- A one-shot `migration` service must finish successfully before the single
  `application` replica starts. The application itself has
  `RUN_MIGRATIONS=false`.
- The current password login limiter is process-local, so this profile must
  remain at one application replica until shared rate limiting and session
  coordination are implemented.
- `/health/live` checks the process. `/health/ready` checks database readiness.
  `/health` remains a compatibility alias for readiness.

## Prepare

Requirements: Linux, Docker Engine, Docker Compose v2, `awk`, and `openssl`.

```sh
cd infra/cloud
cp .env.example .env
install -d -m 0700 secrets
umask 077
openssl rand -hex 32 >secrets/database-admin-password.txt
openssl rand -hex 32 >secrets/database-app-password.txt
openssl rand -base64 24 >secrets/access-password.txt
openssl rand -hex 32 >secrets/session-secret.txt
chmod 0600 secrets/*.txt
sh preflight.sh
```

The default image tags make local evaluation reproducible at the configuration
level but are mutable registry references. Before production promotion, set
`PRAXIS_APP_IMAGE` and `PRAXIS_POSTGRES_IMAGE` to tested digest-pinned image
references (`repository@sha256:...`) and record them in the deployment log.

## Start and verify

```sh
docker compose --env-file .env build application
docker compose --env-file .env up -d
docker compose --env-file .env ps
curl --fail http://127.0.0.1:${PRAXIS_BIND_PORT:-4310}/health/live
curl --fail http://127.0.0.1:${PRAXIS_BIND_PORT:-4310}/health/ready
```

Do not use the loopback HTTP URL as an end-user login URL: production cookies
are Secure by design. Configure a real domain and trusted TLS certificate on
the host reverse proxy, forward to the loopback port, overwrite client-supplied
forwarding headers, disable caching of authenticated responses, and validate
the complete proxy configuration before reload.

## Upgrade and rollback

Create a non-overwriting, custom-format database dump before an upgrade:

```sh
sh backup.sh /secure/backup/praxis-control
```

The script requires the database service to be running, writes through a
private partial file, refuses replacement, and verifies the archive with
`pg_restore --list` before publishing the final filename. Copy backups off the
host and periodically restore them into an isolated database; archive parsing
alone is not a restore rehearsal.

For Nginx on the same host, render a new include file without overwriting any
existing configuration:

```sh
PRAXIS_SERVER_NAME=praxis.example.net \
PRAXIS_CERTIFICATE=/etc/letsencrypt/live/praxis.example.net/fullchain.pem \
PRAXIS_CERTIFICATE_KEY=/etc/letsencrypt/live/praxis.example.net/privkey.pem \
sh render-nginx.sh /tmp/praxis-control.conf
```

Run `nginx -t` against the complete host configuration before installing the
file or reloading Nginx. The template terminates TLS, forwards only to the
loopback application port, replaces forwarding headers, and strips inbound
identity and bearer-token headers. Certificate issuance and renewal remain the
operator's responsibility.

Back up and restore-test the database first. Set the new digest-pinned
`PRAXIS_APP_IMAGE`, pull/build it, and run `docker compose up -d`. Compose runs
the one-shot migration before replacing service readiness. Database migrations
are forward-only; an application image rollback is safe only when its documented
schema compatibility includes the newly applied migration. Otherwise restore a
verified database backup in an isolated recovery procedure.

Stopping the stack preserves the named database volume:

```sh
docker compose --env-file .env down
```

Removing the database volume is intentionally not documented as a routine
operation.
