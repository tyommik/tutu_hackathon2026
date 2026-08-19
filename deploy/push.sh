#!/usr/bin/env bash
#
# Выкладка «Тропы» на сервер с рабочей машины.
#
#   deploy/push.sh                      # проверки, заливка, пересборка, прогрев
#   deploy/push.sh --skip-checks        # без tsc и тестов (когда уже прогнали)
#   deploy/push.sh --no-warm            # без прогрева кэша
#   deploy/push.sh --env                # ещё и перезалить .env с ключами
#   TROPA_HOST=root@other deploy/push.sh
#
set -euo pipefail

HOST="${TROPA_HOST:-root@tutu.shibaev.info}"
DIR="${TROPA_DIR:-/opt/tropa}"
URL="${TROPA_URL:-https://tutu.shibaev.info}"
CHECKS=1
WARM=1
PUSH_ENV=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-checks) CHECKS=0 ;;
    --no-warm) WARM=0 ;;
    --env) PUSH_ENV=1 ;;
    --host) HOST="$2"; shift ;;
    --dir) DIR="$2"; shift ;;
    --url) URL="$2"; shift ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Неизвестный ключ: $1 (--help)" >&2; exit 2 ;;
  esac
  shift
done

cd "$(dirname "$0")/.."
say() { printf '\n\033[1m› %s\033[0m\n' "$1"; }

say "Проверяю связь с $HOST"
ssh -o BatchMode=yes -o ConnectTimeout=8 "$HOST" true

if [ "$CHECKS" = 1 ]; then
  say "Типы и тесты"
  npx tsc --noEmit
  npm test --silent
fi

say "Обновляю снимок курсов ЦБ"
# Сервер в Казахстане до cbr.ru не достучится, поэтому курсы снимаем здесь и
# везём вместе с кодом. Не вышло — едем со старым снимком, это не повод
# останавливать выкладку.
node scripts/fetch-rates.mjs || echo "  не получилось, поедет прежний снимок"

say "Заливаю код в $HOST:$DIR"
# .env и .env.local исключены намеренно: на сервере лежит свой .env с ключами,
# а --delete снёс бы его. Исключённое rsync не удаляет.
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude '.env.local' --exclude coverage \
  ./ "$HOST:$DIR/"

if [ "$PUSH_ENV" = 1 ] || ! ssh "$HOST" "test -s $DIR/.env"; then
  say "Собираю серверный .env из локального .env.local"
  [ -f .env.local ] || { echo "Нет .env.local — положите в него ключи, см. .env.example" >&2; exit 1; }
  {
    cat .env.local
    echo
    echo "TUTU_MCP_URL=https://mcp.tutu.ru/mcp"
    echo "# сутки: прогретый кэш доживает до показа (npm run warm)"
    echo "TROPA_CACHE_TTL_MS=86400000"
    grep -q '^NEXT_PUBLIC_TILES_ATTRIBUTION=' .env.local \
      || echo "NEXT_PUBLIC_TILES_ATTRIBUTION=© MapTiler © OpenStreetMap"
  } | ssh "$HOST" "umask 077 && cat > $DIR/.env && chmod 600 $DIR/.env"
fi

say "Собираю образ и поднимаю контейнер"
# NEXT_PUBLIC_* попадают в клиентский бандл на этапе сборки, поэтому именно
# --build, а не просто up: без пересборки правки фронтенда не доедут.
ssh "$HOST" "cd $DIR && docker compose up -d --build"

say "Жду, пока контейнер станет healthy"
for i in $(seq 1 30); do
  state=$(ssh "$HOST" "docker inspect tropa --format '{{.State.Health.Status}}'" 2>/dev/null || echo unknown)
  [ "$state" = healthy ] && break
  [ "$i" = 30 ] && { echo "Не дождался healthy (последнее: $state)" >&2; ssh "$HOST" "docker logs --tail 40 tropa" >&2; exit 1; }
  sleep 2
done
echo "healthy"

say "Проверяю $URL"
code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$URL/")
echo "HTTP $code"
[ "$code" = 200 ] || { echo "Главная не отдалась" >&2; exit 1; }

if [ "$WARM" = 1 ]; then
  say "Грею кэш демо-легендой"
  # Кэш живёт в памяти процесса и умирает вместе с контейнером: после каждой
  # пересборки первый поиск снова идёт в Туту живьём, это минута ожидания.
  node scripts/warm.mjs "$URL"
fi

say "Готово: $URL"
