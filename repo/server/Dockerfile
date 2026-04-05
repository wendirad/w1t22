FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

RUN mkdir -p /app/uploads /app/quarantine

EXPOSE 5000

CMD ["node", "dist/index.js"]
