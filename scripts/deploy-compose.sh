#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "Не найден .env в каталоге проекта" >&2
  exit 1
fi

port="${APP_PORT:-$(sed -nE 's/^APP_PORT=([0-9]+)[[:space:]]*$/\1/p' .env | tail -n 1)}"
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
  echo "Укажите корректный APP_PORT в .env или окружении" >&2
  exit 1
fi

docker compose config --quiet
docker compose up -d --build --remove-orphans

ready=false
for attempt in {1..20}; do
  if curl --fail --silent --show-error --max-time 3 "http://127.0.0.1:${port}/api/ready" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 3
done

if [[ "$ready" != true ]]; then
  echo "Readiness не прошёл на 127.0.0.1:${port}" >&2
  exit 1
fi

echo "Приложение готово на 127.0.0.1:${port}"
public_base_url="$(sed -nE 's/^PUBLIC_BASE_URL=(.*)$/\1/p' .env | tail -n 1)"
if [[ -z "$public_base_url" ]]; then
  echo "Укажите PUBLIC_BASE_URL в .env" >&2
  exit 1
fi

docker compose exec -T api node dist/src/scripts/ensure-max-webhook.js "$public_base_url"
echo "MAX webhook настроен"
