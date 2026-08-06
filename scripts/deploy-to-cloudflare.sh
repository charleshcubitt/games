#!/usr/bin/env bash
# Deploys the whole games repo to Cloudflare Pages and points the portal
# (neon-flashback.com) at each game's latest revision on that new host.
#
# Replaces the old GitHub Pages + sync-portal.yml pipeline: this script
# runs locally via `wrangler`, never inside GitHub Actions, so a GitHub
# outage (Actions or Pages) can never block a release again -- see
# 2026-08-06's outage, which is exactly why this exists.
#
# Requires: wrangler authenticated locally (`npx wrangler whoami`), and
# ADMIN_TOKEN in the environment (sourced from games-portal/.dev.vars
# below if not already set).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_NAME="games"
PORTAL_URL="https://neon-flashback.com"
# Stable production domain for the Pages project -- doesn't change
# between deploys (unlike the per-deployment preview hash URL wrangler
# also prints), so URLs stored in the portal's DB stay valid across
# future deploys of the same revision file.
DEPLOY_DOMAIN="https://games-3lp.pages.dev"

if [ -z "${ADMIN_TOKEN:-}" ]; then
  DEV_VARS="../games-portal/.dev.vars"
  if [ -f "$DEV_VARS" ]; then
    ADMIN_TOKEN=$(grep "^ADMIN_TOKEN=" "$DEV_VARS" | cut -d= -f2)
  fi
fi
if [ -z "${ADMIN_TOKEN:-}" ]; then
  echo "::error:: ADMIN_TOKEN not set and not found in $DEV_VARS" >&2
  exit 1
fi

echo "Deploying repo to Cloudflare Pages project '$PROJECT_NAME'..."
npx wrangler pages deploy . --project-name="$PROJECT_NAME" --commit-dirty=true --branch=main
deploy_url="$DEPLOY_DOMAIN"
echo "Deployed. Production domain: $deploy_url"
echo ""

for row in $(jq -c '.games[]' games-manifest.json); do
  slug=$(echo "$row" | jq -r '.slug')
  dir=$(echo "$row" | jq -r '.dir')
  prefix=$(echo "$row" | jq -r '.prefix')

  latest=$(ls "${dir}/${prefix}"*.html 2>/dev/null | sort -V | tail -1 || true)
  if [ -z "$latest" ]; then
    echo "::warning:: no revision files found for $slug (${dir}/${prefix}*.html) -- skipping"
    continue
  fi
  filename=$(basename "$latest")
  source_url="${deploy_url}/${dir}/${filename}"

  echo "Waiting for $source_url to publish on Cloudflare Pages..."
  # -L: Cloudflare Pages 308-redirects "*.html" to the extensionless
  # clean URL by default. Harmless in production (fetch() follows
  # redirects too), but the check needs to follow it to get a real 200.
  live=""
  for i in $(seq 1 20); do
    status=$(curl -sL -o /dev/null -w "%{http_code}" "$source_url")
    if [ "$status" = "200" ]; then live="1"; break; fi
    sleep 3
  done
  if [ -z "$live" ]; then
    echo "::error:: $source_url never returned 200 -- not updating $slug"
    continue
  fi

  echo "Updating portal: $slug -> $source_url"
  http_code=$(curl -s -o /tmp/deploy-resp.json -w "%{http_code}" -X POST "$PORTAL_URL/api/admin/update-game-source" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"slug\":\"${slug}\",\"sourceUrl\":\"${source_url}\"}")
  echo "Portal responded $http_code: $(cat /tmp/deploy-resp.json)"
  rm -f /tmp/deploy-resp.json
  if [ "$http_code" != "200" ]; then
    echo "::warning:: portal update for $slug returned $http_code"
  fi
  echo ""
done
