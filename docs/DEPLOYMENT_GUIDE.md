# Attendance Management System - Deployment Guide

## 1. Local Setup

### Prerequisites
- Node.js >= 18
- npm
- Docker + Docker Compose (recommended)
- MongoDB connection URI
- Redis endpoint (optional but recommended)

### Option A: Docker Dev
```bash
git clone <repo-url>
cd AttendanceManagementSystem
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose -f docker-compose.dev.yml up --build
```

### Option B: Manual Local Run
```bash
# Terminal 1
cd backend
npm install
cp .env.example .env
npm run dev

# Terminal 2
cd frontend
npm install
cp .env.example .env
npm run dev
```

---

## 2. Production Deployment

## 2.1 Environment Preparation
1. Provision MongoDB (Atlas/self-hosted).
2. Provision Redis.
3. Configure DNS and SSL certificates.
4. Populate `backend/.env` with production values.

## 2.2 Docker Compose Deployment
```bash
cp backend/.env.example backend/.env
# Edit values
docker compose up -d --build
```

## 2.3 Health Validation
```bash
curl http://<server>/api/health
```
Expect healthy status + timestamp response.

---

## 3. Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Purpose |
|---|---|
| PORT | API port |
| NODE_ENV | runtime mode |
| MONGODB_URI | MongoDB connection string |
| MONGO_DNS_SERVERS | DNS resolvers for Mongo connections |
| JWT_SECRET / JWT_EXPIRES_IN | access token signing & TTL |
| JWT_REFRESH_SECRET / JWT_REFRESH_EXPIRES_IN | refresh token signing & TTL |
| REDIS_HOST / REDIS_PORT / REDIS_PASSWORD | Redis connectivity |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS | Email transport |
| FROM_EMAIL / EMAIL_REPLY_TO / SENDGRID_* | Mail identity |
| TWILIO_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE | SMS provider config |
| ATTENDANCE_THRESHOLD | default shortage threshold |
| MAX_EDIT_WINDOW_HOURS | attendance edit window |
| FRONTEND_URL | CORS allowed origin |

### Frontend (`frontend/.env`)
| Variable | Purpose |
|---|---|
| VITE_API_URL | API base URL |
| VITE_APP_NAME | product label |
| VITE_COLLEGE_NAME | organization label |
| VITE_ATTENDANCE_THRESHOLD | UI threshold display |
| VITE_APP_VERSION | frontend version stamp |

---

## 4. Nginx / Reverse Proxy Notes
- Frontend served via Nginx container in production compose.
- API requests routed to backend service.
- Enforce HTTPS and HSTS in final infra layer.

---

## 5. CI/CD Recommendations
- Lint + test gates on pull request.
- Build immutable backend/frontend images.
- Inject secrets via environment/secret manager (never commit secrets).
- Blue/green or rolling deployment for zero-downtime targets.

---

## 6. Monitoring & Maintenance
- Monitor API latency, error rates, and auth failures.
- Track MongoDB connection pool and slow queries.
- Monitor Redis memory and key evictions.
- Archive logs and rotate periodically.
- Verify backups and recovery every sprint/month.

---

## 7. Troubleshooting

| Problem | Check |
|---|---|
| Backend fails to start | Missing env, Mongo/Redis unreachable |
| CORS blocked | `FRONTEND_URL` mismatch |
| Login fails globally | JWT secret mismatch or invalid DB users |
| Reports timeout | DB performance, report filters, memory limits |
| 502/Bad Gateway | Reverse proxy upstream config |

---

## 8. Scaling Strategy
- Horizontal API scaling with stateless containers.
- Dedicated managed MongoDB/Redis tiers.
- Read replicas for analytics-heavy workloads.
- Async queues for heavy report generation in future phases.
