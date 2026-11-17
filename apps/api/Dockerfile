# API image for local docker-compose (and later deployment). Build context: repo root.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @zurupos/api...
COPY apps/api apps/api
RUN pnpm --filter @zurupos/api run build && pnpm --filter @zurupos/api deploy --prod --legacy /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
