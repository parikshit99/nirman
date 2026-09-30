# Build from the repository root:  docker build -f apps/server/Dockerfile .
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @nirman/server --include-workspace-root=false
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @nirman/server

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --omit=dev --workspace @nirman/server --include-workspace-root=false && npm cache clean --force
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY apps/server/migrations apps/server/migrations
USER node
EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]
