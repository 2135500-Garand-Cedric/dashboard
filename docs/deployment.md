# Deploying the dashboard to Synology

GitHub Actions builds `Dockerfile.prod` on a GitHub-hosted Ubuntu runner for
`linux/amd64` and publishes one image used by both the website and notification
worker. The DS224+ only pulls and runs that image. Publishing never contacts or
restarts the NAS. Production deployments are manual.

## GitHub setup

1. Commit `.github/workflows/docker-publish.yml` and push to `main`. In repository
   **Settings → Actions → General**, enable Actions and permit the official
   `actions/checkout` and `docker/*` actions used by this workflow. Organization
   policies must allow package publishing. The workflow requests only
   `contents: read` and `packages: write`; it does not require broadly enabling
   write access for all workflows.
2. In **Actions → Publish dashboard image**, wait for the run to succeed.
   **Run workflow** also works; select `main`. Runs for other branches are skipped
   so they cannot overwrite `latest`.
3. The image name is the lowercase GitHub owner/repository:
   `ghcr.io/2135500-garand-cedric/dashboard`. Each successful build publishes
   `:latest` and `:<full-40-character-commit-SHA>` pointing to the same image.
   The full SHA is visible on the workflow run. Preserve tags needed for rollback.
4. Open the GitHub profile's **Packages → dashboard → Package settings**. Verify
   its visibility is **Private** and its linked repository is this repository.
   If a package with this name already exists, give this repository access under
   **Manage Actions access**. Do not make the package public to fix access errors.

The workflow uses its automatically supplied `GITHUB_TOKEN`; no personal access
token, NAS SSH credentials, production database, `.env`, OAuth secret or VAPID key
is needed in Actions. Docker layer caching uses GitHub Actions cache storage.

Official references: [Docker's GitHub Actions setup](https://docs.docker.com/build/ci/github-actions/)
and [GitHub Container Registry authentication and access](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## NAS initial setup

Use SSH over your existing trusted network. Commands below use `sudo docker`;
log in to GHCR with the same OS identity used for subsequent Docker commands.
An unprivileged `docker login` will not supply credentials to `sudo docker`.

The deployment directory is `/volume1/Subdomains/dashboard/`. **Keep the existing
Compose project name.** Compose normally derives it from the directory name;
changing it can create empty, differently named volumes instead of using existing
data. Check the running deployment before changing anything:

```sh
cd /volume1/Subdomains/dashboard/
sudo docker inspect dashboard --format '{{ index .Config.Labels "com.docker.compose.project" }}'
sudo docker compose -f docker-compose.prod.yml ps
sudo docker network inspect web-network
```

If the existing project's name differs from `dashboard`, set
`COMPOSE_PROJECT_NAME` to that existing value in the NAS `.env` before using the
new Compose file. Do not rename or move volumes. `web-network` remains an external
network shared with the existing reverse proxy; this change adds no exposed ports.

For a private image, create a GitHub **personal access token (classic)** with only
`read:packages`, using an account allowed to read the package. Authorize SSO if an
organization requires it. This is separate from the dashboard's GitHub OAuth
client secret. The NAS does not need `write:packages`, a GitHub password, or an
Actions token. Protect Docker's login configuration; it stores a reusable
credential unless a credential helper is configured.

```sh
sudo docker login ghcr.io --username 2135500-Garand-Cedric
```

Paste the read-only token at the password prompt, never as a command-line
argument. No NAS credential should be added to this repository.

Update the checkout to the release containing this configuration:

```sh
git pull --ff-only origin main
```

Edit the existing NAS `.env` locally, preserving all existing values, and add:

```dotenv
DASHBOARD_IMAGE=ghcr.io/2135500-garand-cedric/dashboard:latest
```

For a predictable release, replace `latest` with the full SHA of the successful
GitHub Actions build. Both services must always use the same reference. If the
repository is renamed, update the owner/repository accordingly, in lowercase.
Do not copy the placeholder database credentials from `.env.example` over the
NAS `.env`.

Validate without printing resolved secrets:

```sh
sudo docker compose -f docker-compose.prod.yml config --quiet
sudo docker compose -f docker-compose.prod.yml config --images
```

The two application references must be identical; PostgreSQL remains
`postgres:15`, pgAdmin remains `dpage/pgadmin4`. The existing `dashboard_data`,
`finance_files` and `work_files` volumes, environment configuration, restart
policies, healthchecks, dependencies and reverse-proxy network are preserved.

## First and subsequent deployments

First confirm the GitHub image publication succeeded. Update the NAS checkout
when Compose, backup scripts or deployment documentation change; application
source on the NAS is no longer compiled. Set `DASHBOARD_IMAGE` in `.env` to the
chosen release before pulling. Keep the old containers running during the pull.

```sh
cd /volume1/Subdomains/dashboard/
sudo docker compose -f docker-compose.prod.yml config --quiet
sudo docker compose -f docker-compose.prod.yml pull dashboard notification-worker
```

Before a release with migrations, take a current backup and review pending SQL:

```sh
sudo sh scripts/backup-database.sh /volume1/backups/dashboard
sudo docker compose -f docker-compose.prod.yml run --rm --no-deps dashboard npx prisma migrate status
```

`migrate status` is read-only, does not start dependencies, and uses the new image
against the existing database. It may exit nonzero for pending migrations; review
the output. A failed or diverged migration is a reason to stop, not proceed.
The database backup includes every module and Prisma migration state. Original
documents are separate: also back up the finance/work volumes and keep `.env`
securely. See [Finance maintenance](FINANCE_MAINTENANCE.md) for a coordinated
database/files backup and isolated restore verification.

Once pending migrations are reviewed and any failed migration is resolved through
a separate, verified recovery procedure, deploy:

```sh
sudo docker compose -f docker-compose.prod.yml up -d --no-build dashboard notification-worker
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs --tail=100 dashboard notification-worker
sudo docker compose -f docker-compose.prod.yml exec -T dashboard node -e "fetch('http://127.0.0.1:3000/api/auth/providers').then(r=>{console.log('HTTP',r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
sudo docker compose -f docker-compose.prod.yml exec -T dashboard npx prisma migrate status
```

The website retains its startup command, `npx prisma migrate deploy && npm run
start`. The worker waits for a healthy website. `up` may wait for this condition;
if it fails, inspect status/logs before retrying. The healthcheck allows 120 seconds
of startup grace. The worker itself has no separate Docker healthcheck; verify
its logs and heartbeat in **Settings → Phone & notifications**. Also open the
public HTTPS site, sign in, check a private page and verify notification settings.
An HTTP health response alone does not prove database or notification delivery
health. Never paste sensitive logs or resolved Compose configuration publicly.

Subsequent deployments use the same commands: choose a successful image, pull,
review migrations/backups, then `up --no-build` and verify. The production Compose
file has no `build:` directives. Do not run a NAS build, `down`, `down -v`,
`prisma migrate reset`, `prisma migrate dev`, or example-data seeds for deployment.

### Existing migration issue: review before upgrading real data

`prisma/migrations/20261118121000_drop_unused_practice_timestamp/migration.sql`
deliberately raises an exception if `ActivityVocab.lastPracticed` contains any
historical values. The following
`20261118122000_restore_activity_review_timers` migration restores the field, but
it cannot run past the earlier failure. This CI/CD change does **not** repair the
failure, alter either SQL file, discard timestamps, or mark any migration applied.

If this is the failed production migration, stop deployment. Preserve the backup,
database values and error details; inspect the actual schema and `_prisma_migrations`
state and rehearse a data-preserving recovery on an isolated restore first. Have
that separate recovery reviewed before running it on production. Do not blindly
rerun, edit old migration SQL, or use `migrate resolve --applied` to bypass it.
Building/pulling a new image does not solve a failed database migration.

For the separately diagnosed case where the drop migration is recorded completed
but the original timestamp column remains and the restore migration failed, see
[Retained activity-review column recovery](ACTIVITY_REVIEW_TIMER_RECOVERY.md).
That procedure preserves timestamps and validates the repair before resolving
the failed migration record; it is not an automatic deployment step.

## Rollback

Use a previously published full commit SHA, not `latest`. First verify its schema
compatibility with the **current** database and retain a backup. Change only the
image setting in the NAS `.env`:

```dotenv
DASHBOARD_IMAGE=ghcr.io/2135500-garand-cedric/dashboard:PREVIOUS_FULL_COMMIT_SHA
```

Then:

```sh
sudo docker compose -f docker-compose.prod.yml config --quiet
sudo docker compose -f docker-compose.prod.yml pull dashboard notification-worker
sudo docker compose -f docker-compose.prod.yml up -d --no-build dashboard notification-worker
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs --tail=100 dashboard notification-worker
```

These commands retain all volumes. SHA tags identify a specific commit; registry
tags are technically mutable, so do not overwrite/delete release tags. For a
strictly immutable reference, `DASHBOARD_IMAGE=ghcr.io/.../dashboard@sha256:...`
also works; obtain the published digest from the successful build.

Rolling back code does **not** undo migrations. Older code may fail after column
changes, and older images still run `migrate deploy` at startup. A database restore
is a separate recovery operation requiring explicit review; it can lose writes
made since the backup. Do not automatically restore or reverse migrations as part
of an image rollback.

## Build and runtime details

- `Dockerfile.prod` is unchanged: Node 22 Alpine builder, `npm ci`, explicit Prisma
  Client generation, then `next build`. The runner includes compiled Next.js,
  public assets, Prisma schema/migrations/generated client, notification modules
  and maintenance scripts. Development tools remain because the existing runtime
  configuration/maintenance scripts use TypeScript; standalone/pruned images are
  a separate optimization rather than part of this deployment change.
- Builds need npm registry and Google Fonts network access (`next/font/google`).
  They do not need a running database, GitHub OAuth credentials, API keys or VAPID
  keys. The workflow passes no production secrets or application build arguments.
  The root layout uses server sessions, keeping authenticated data dynamic.
- `.dockerignore` excludes `.env` variants, private uploads, backups, local
  credentials, build output and locally generated Prisma Client. Prisma's Linux
  client is generated inside the builder, never replaced by a host-generated copy.
- Supply `DATABASE_URL`, PostgreSQL settings, `NEXTAUTH_URL` (public HTTPS),
  `NEXTAUTH_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` at runtime using
  the existing NAS `.env`. Preserve optional YouTube/time-manager API keys,
  timezone settings and stable Web Push configuration. Upload paths are still
  set in Compose. There are currently no `NEXT_PUBLIC_*` build inputs; introducing
  one later requires review because Next.js embeds those values during compilation.
- To generate VAPID keys for the first time, after pulling the image:
  `sudo docker compose -f docker-compose.prod.yml run --rm --no-deps dashboard npm run notifications:keys`.
  Keep them in `.env` and reuse them; do not regenerate on each deployment.
- Private package storage and Actions/cache usage may count against your GitHub
  plan. Monitor usage and retain the releases needed for recovery.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `unauthorized` / `denied` pulling | Log in as the same OS user running Docker; use a classic token with `read:packages`, package access and any required SSO authorization. Check token expiry. |
| `permission_denied: write_package` in Actions | Verify workflow/package publishing is allowed, and this repository has Actions access to an existing package. No NAS PAT belongs in Actions. |
| Image/tag not found | Confirm the workflow succeeded on `main`, owner/repository is lowercase, and the full SHA tag exists. Builds are not available until publication completes. |
| Workflow build fails | Read the failing step: npm lock/dependency install, font downloads/network, Prisma generation, Next.js TypeScript/build errors or GitHub runner resources. Fix source and push again; do not move the build back to the NAS. |
| `DASHBOARD_IMAGE` required | Add it to the NAS `.env` in the deployment directory; validate with `config --quiet`. |
| Website exits/restarts at migration | Read dashboard logs and run the read-only migration status command. Follow the migration warning above; never reset/delete volumes or automatically resolve failed migrations. |
| Website unhealthy | Check migration completion, required environment values, database health/connection, available NAS RAM/disk, and startup logs. Once repaired, rerun `up --no-build`. |
| Worker not started | Website must be healthy first. Check worker logs, runtime push keys, `PUSH_ENABLED`, database access and outbound HTTPS; check its Settings heartbeat. |
| Login fails after update | Preserve runtime `NEXTAUTH_SECRET`, public HTTPS `NEXTAUTH_URL`, OAuth callback URL and owner credentials; no real OAuth values are baked into the image. |
| Uploads missing | Stop and verify existing Compose project/volume names and upload mount paths. Do not seed or initialize replacement data. |
| NAS still appears to build | Verify the updated production Compose file has `image:` for both services and no old build override is being combined with it. Use `--no-build`. |

This setup does not require Kubernetes, a NAS build runner, automatic SSH access,
new services or public SSH exposure. Validation of actual GHCR publishing, NAS
token access and public HTTPS/iPhone behavior must be performed by the operator;
local checks do not prove those remote operations succeeded.

## Local implementation verification

- The workflow passed `actionlint`; its YAML, triggers and minimum token
  permissions were also parsed and checked locally.
- Production Compose passed `config --quiet` with a temporary image reference;
  `config --images` showed the same image for the website and worker. A structural
  comparison against the original file confirmed every other service setting,
  volume and network was preserved.
- `docker buildx build --platform linux/amd64 --file Dockerfile.prod --tag
  dashboard-cicd-check:local --load .` succeeded, including Prisma generation,
  production compilation and static-page generation. No application credentials
  or database were supplied. The resulting image was approximately 436 MiB.
- The image started in a temporary `--network none` container with dummy runtime
  authentication values and an unreachable dummy database URL. Its
  `/api/auth/providers` endpoint returned HTTP 200. Prisma Client and notification
  engine dependencies loaded successfully; required runtime assets were present.
- Checks inside the image confirmed root `.env` files, private uploads, backups,
  Git metadata and local credential directories were absent. Only `.env.example`
  was tracked among the inspected environment/key/backup paths.
- `node --test tests/*.test.mjs` passed all 40 test files, and `git diff --check`
  passed. No existing migration SQL, schema or production data was changed.

These checks do not exercise a production migration, actual push delivery, GHCR
authentication/publication or the NAS reverse proxy. The temporary smoke-test
container was stopped after verification.
