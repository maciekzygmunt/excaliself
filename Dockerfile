FROM node:22-alpine AS base

RUN npm install -g pnpm@11.14.0

FROM base AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", ".output/server/index.mjs"]
