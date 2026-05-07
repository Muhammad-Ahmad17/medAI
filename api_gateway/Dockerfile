FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
    --fetch-retries=10 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000

COPY src ./src

EXPOSE 3000

CMD ["npm", "start"]
