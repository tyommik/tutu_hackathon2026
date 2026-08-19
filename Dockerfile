# syntax=docker/dockerfile:1

# Многослойная сборка: зависимости и сборка остаются в промежуточных слоях,
# в финальный образ едет только standalone-сервер (~50 МБ вместо 387 МБ).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* вшиваются в клиентский бандл ИМЕННО на этом шаге. Забыть их
# здесь — значит собрать приложение, где карта отелей молча уходит в
# схематичный режим, а рантайм-переменные это уже не исправят.
ARG NEXT_PUBLIC_TILES_URL
ARG NEXT_PUBLIC_TILES_URL_DARK
ARG NEXT_PUBLIC_TILES_ATTRIBUTION
ENV NEXT_PUBLIC_TILES_URL=$NEXT_PUBLIC_TILES_URL \
    NEXT_PUBLIC_TILES_URL_DARK=$NEXT_PUBLIC_TILES_URL_DARK \
    NEXT_PUBLIC_TILES_ATTRIBUTION=$NEXT_PUBLIC_TILES_ATTRIBUTION \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# не от root: у процесса нет причин иметь права на файловую систему образа
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# healthcheck бьёт по главной: она статическая и не ходит в MCP
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
