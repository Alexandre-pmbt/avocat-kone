FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js parametres-initiaux.json ./
COPY public ./public
COPY scripts ./scripts
ENV DATA_DIR=/app/data PORT=3000
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
