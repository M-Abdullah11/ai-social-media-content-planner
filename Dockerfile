FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run check
ENV HOST=0.0.0.0 PORT=3000 PUBLIC_DEMO=true DB_PATH=/data/planner.sqlite
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["npm","start"]
