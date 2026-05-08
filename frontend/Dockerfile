# stage 1 
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Full install: Vite and plugin-react are devDependencies but required for `vite build`
RUN npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build


# stage 2
# starting a completley new image, discarding last one cuz we dont need code 
# and other artifact in our image, we just need dist

FROM nginx:alpine
# copy nginx.conf[local] to [docker image] conf
COPY nginx.conf /etc/nginx/conf.d/default.conf  
# from the above stage 1 [build] copy dist into /usr/share/nginx/html
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
