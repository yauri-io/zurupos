# Public online menu image (SPEC §12.7). Build context: repo root.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/menu/package.json apps/menu/
COPY packages/api-client packages/api-client
COPY packages/menu-ui packages/menu-ui
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @zurupos/menu...
COPY apps/menu apps/menu
RUN pnpm --filter @zurupos/menu run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
COPY --from=build /repo/apps/menu/.output ./.output
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://127.0.0.1:3001/healthz >/dev/null || exit 1
CMD ["node", ".output/server/index.mjs"]
