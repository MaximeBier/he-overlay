# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# After `npm ci` on purpose: this value changes on every release, and placing
# it earlier would reinstall the dependencies for each one.
ARG VITE_BUILD=dev
ENV VITE_BUILD=$VITE_BUILD

COPY . .
RUN npm run build

# ---- serve ----
# Unprivileged variant: listens on 8080 without root. Traefik exposes the
# service, so the port has no reason to be 80.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# The fragment goes to snippets/ rather than conf.d/: everything under conf.d
# is included automatically at the `http` level, whereas we need to include it
# location by location.
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
