FROM node:22-alpine AS base

RUN npm install -g pnpm

FROM base AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm db:push
RUN pnpm build

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build ./node_modules/better-sqlite3/build

RUN mkdir -p /app/data

VOLUME /app/data

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/excalidraw.db

CMD ["node", ".output/server/index.mjs"]
