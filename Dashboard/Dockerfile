# =============================================================================
# SkyGuard AI - Production Operational Monitoring Dashboard (React + Vite)
# =============================================================================
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies using cached layer
COPY sih/package*.json ./
RUN npm ci

# Copy full application code & build optimized production bundle
COPY sih/ ./
RUN npm run build

# =============================================================================
# Production Serving Stage with NGINX Reverse Proxy
# =============================================================================
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
