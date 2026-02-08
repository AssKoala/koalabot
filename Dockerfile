# Builder
FROM node:lts-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm run generate-version-info

# Production
FROM node:lts-slim AS production
# --no-install-recommends reduces image size; rm lists avoids caching apt metadata in the layer
RUN apt-get update && apt-get install -y --no-install-recommends python3 python-is-python3 python3-praw && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
# Strip source maps and test artifacts from the production image (single layer)
RUN find ./dist -name "*.js.map" -delete && rm -rf ./dist/__mocks__ ./dist/__tests__

CMD ["node", "./dist/main.js"]
