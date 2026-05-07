FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Full install: Vite and plugin-react are devDependencies but required for `vite build`
RUN npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
