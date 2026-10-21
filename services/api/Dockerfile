# Compile TypeScript
FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Application runtime
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]

# Local development: add Azure CLI
FROM runtime AS local

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fsSL \
       'https://azurecliprod.blob.core.windows.net/$root/deb_install.sh' \
       -o /tmp/install-azure-cli.sh \
    && bash /tmp/install-azure-cli.sh \
    && rm /tmp/install-azure-cli.sh \
    && rm -rf /var/lib/apt/lists/*

USER node

# Default build for deployment
FROM runtime AS production