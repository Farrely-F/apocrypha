# Apocrypha container image: Next.js standalone server plus migrations on boot.
# Build:  docker build -t apocrypha .
# Run:    see docker-compose.yml and docs/SELF-HOSTING.md

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholders only so the build can import the auth module. Real values are read at runtime, never baked in.
RUN BETTER_AUTH_SECRET=build-only-placeholder-0123456789abcdef \
    BETTER_AUTH_URL=http://localhost:3000 \
    DATABASE_URL=file:/tmp/build.db \
    npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/apocrypha.db
RUN groupadd --system --gid 1001 apocrypha && useradd --system --uid 1001 --gid apocrypha apocrypha \
    && mkdir -p /data && chown apocrypha:apocrypha /data
COPY --from=build --chown=apocrypha:apocrypha /app/.next/standalone ./
COPY --from=build --chown=apocrypha:apocrypha /app/.next/static ./.next/static
COPY --from=build --chown=apocrypha:apocrypha /app/public ./public
# The migration step needs the migrator and the SQL files, which the traced standalone bundle may omit.
COPY --from=build --chown=apocrypha:apocrypha /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=build --chown=apocrypha:apocrypha /app/drizzle ./drizzle
COPY --from=build --chown=apocrypha:apocrypha /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=apocrypha:apocrypha /app/scripts/backup.mjs ./scripts/backup.mjs
COPY --chown=apocrypha:apocrypha docker-entrypoint.sh ./docker-entrypoint.sh
USER apocrypha
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
