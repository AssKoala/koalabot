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
RUN apt-get update && apt-get install -y python3 python-is-python3 python3-praw
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/scripts ./scripts
RUN find ./dist -name "*.js.map" -exec rm {} \;
RUN rm -rf ./dist/__mocks__
RUN rm -rf ./dist/__tests__

CMD ["node", "./dist/main.js"]
