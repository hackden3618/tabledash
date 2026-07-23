FROM oven/bun:1-alpine AS base
WORKDIR /app

# ── frontend build ─────────────────────────────────────────────
FROM base AS frontend
COPY apps/web/package.json apps/web/bun.lock ./apps/web/
COPY apps/web/ ./apps/web/
RUN bun install --cwd apps/web --frozen-lockfile
RUN bun run --cwd apps/web build

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
