# Dashboard image for local docker-compose. Build context: repo root.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/api-client packages/api-client
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @zurupos/dashboard...
COPY apps/dashboard apps/dashboard
RUN pnpm --filter @zurupos/dashboard run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /repo/apps/dashboard/.output ./.output
# Build version (D-057), passed by deploy/prod.sh. Last, so a new version only rebuilds this layer.
ARG ZURU_VERSION=dev
ENV NUXT_PUBLIC_APP_VERSION=$ZURU_VERSION
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
