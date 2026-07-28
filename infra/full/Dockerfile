FROM gitea/gitea@sha256:d8667667b4ccbd1f67b86a376bffcc0a17b16cf71309ed04e3918231776d47dd AS build

RUN sed -i s/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g /etc/apk/repositories \
    && apk add --no-cache nodejs npm

WORKDIR /build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY migrations ./migrations
COPY views ./views
COPY public ./public
RUN npm run build \
    && npm prune --omit=dev

FROM gitea/gitea@sha256:d8667667b4ccbd1f67b86a376bffcc0a17b16cf71309ed04e3918231776d47dd

RUN sed -i s/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g /etc/apk/repositories \
    && apk add --no-cache nodejs \
    && mkdir -p /app/praxis \
    && chown git:git /app/praxis

WORKDIR /app/praxis
COPY --from=build --chown=git:git /build/package.json ./
COPY --from=build --chown=git:git /build/node_modules ./node_modules
COPY --from=build --chown=git:git /build/dist ./dist
COPY --from=build --chown=git:git /build/migrations ./migrations
COPY --from=build --chown=git:git /build/views ./views
COPY --from=build --chown=git:git /build/public ./public

USER git
EXPOSE 4310
ENTRYPOINT ["node", "dist/server.js"]
