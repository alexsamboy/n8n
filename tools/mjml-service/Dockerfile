FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node --chmod=644 package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node --chmod=644 server.js ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
