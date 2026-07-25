FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server ./server
COPY data ./data
COPY bots ./bots
RUN mkdir -p data bots
EXPOSE 3001
CMD ["node", "server/index.js"]
