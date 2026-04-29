# ── Stage 1: Build React app ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build args for environment variables baked into the bundle
ARG VITE_API_URL=/api
ARG VITE_APP_NAME="Attendance Management System"
ARG VITE_COLLEGE_NAME="Your College"
ARG VITE_ATTENDANCE_THRESHOLD=75
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_COLLEGE_NAME=$VITE_COLLEGE_NAME
ENV VITE_ATTENDANCE_THRESHOLD=$VITE_ATTENDANCE_THRESHOLD
RUN npm run build

# ── Stage 2: Serve with Nginx ──
FROM nginx:1.25-alpine AS production
# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html
# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf.bak 2>/dev/null || true

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/index.html | grep -q 'Attendance' || exit 1

CMD ["nginx", "-g", "daemon off;"]
