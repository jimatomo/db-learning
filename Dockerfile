# Single container: Bun serves API + Vite-built static assets.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN bun run --cwd apps/web build

FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV LESSON=c
ENV DATABASE_PATH=/data/app-c.db

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

# Seed only when explicitly requested (first boot / demos).
CMD ["sh", "-c", "if [ \"${RUN_SEED}\" = 1 ]; then bun run --cwd apps/server scripts/seed.ts; fi && bun apps/server/src/index.ts"]
