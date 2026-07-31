ARG NODE_BASE_IMAGE=node:24-bookworm-slim
FROM ${NODE_BASE_IMAGE} AS build

WORKDIR /build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY migrations ./migrations
COPY views ./views
COPY public ./public
RUN npm run build \
    && npm prune --omit=dev

FROM ${NODE_BASE_IMAGE}

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /build/package.json ./
COPY --from=build --chown=node:node /build/node_modules ./node_modules
COPY --from=build --chown=node:node /build/dist ./dist
COPY --from=build --chown=node:node /build/migrations ./migrations
COPY --from=build --chown=node:node /build/views ./views
COPY --from=build --chown=node:node /build/public ./public

USER node
EXPOSE 4310
CMD ["node", "dist/server.js"]
