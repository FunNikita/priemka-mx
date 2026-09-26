#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Run against an already-running Compose MySQL service before the role-snapshot migration.
# Credentials stay inside the container and are never written to command output.
duplicates=$(docker compose exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --batch --skip-column-names -u "$MYSQL_USER" "$MYSQL_DATABASE"' < scripts/preflight-document-confirmations.sql)
if [[ -n "$duplicates" ]]; then
  echo "DocumentConfirmation preflight failed: duplicate (documentVersionId, roleSnapshot) groups found" >&2
  exit 1
fi
echo "DocumentConfirmation preflight passed: 0 duplicate groups"
