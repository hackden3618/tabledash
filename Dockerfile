FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── frontend build ─────────────────────────────────────────────
FROM base AS frontend
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/bun.lock ./
RUN bun install --frozen-lockfile
COPY apps/web/ ./
RUN bun run build

# ── backend ────────────────────────────────────────────────────
FROM base AS backend
COPY package.json bun.lock ./
COPY apps/api/ ./apps/api/
COPY shared/ ./shared/
COPY infrastructure/ ./infrastructure/
COPY prisma/ ./prisma/
COPY --from=frontend /app/apps/web/dist ./apps/web/dist

RUN bun install --frozen-lockfile --production
RUN bunx prisma generate

EXPOSE 3000
CMD ["bun", "run", "apps/api/server.ts"]
