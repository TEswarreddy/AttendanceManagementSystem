# Attendance Management System (AMS)

A production-ready, role-based web platform for academic attendance operations across departments, semesters, and sections.

## Documentation Pack (Complete)

This repository now includes an enterprise documentation set for developers, administrators, coordinators, faculty, and deployment teams:

1. **Professional README** (this file)
2. **Technical Documentation** → [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md)
3. **User Manual** → [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md)
4. **Admin Manual** → [`docs/ADMIN_MANUAL.md`](docs/ADMIN_MANUAL.md)
5. **API Docs** → [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md)
6. **Testing Docs** → [`docs/TESTING_DOCUMENTATION.md`](docs/TESTING_DOCUMENTATION.md)
7. **Deployment Guide** → [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md)

---

## Quick Snapshot

- **Frontend:** React + Vite + Tailwind + React Router + React Query
- **Backend:** Node.js + Express + Mongoose + Redis
- **Database:** MongoDB (primary), Redis (cache/session/blacklist)
- **Authentication:** JWT access + refresh token, role-based authorization
- **Core Capability:** Attendance marking, monitoring, alerts, and downloadable reports

## Roles Supported

- Admin
- Principal / Super Admin equivalent
- HOD
- Attendance Coordinator
- Time Table Coordinator
- Class Teacher
- Faculty
- Student

## Local Development (Fast Start)

```bash
git clone <repo-url>
cd AttendanceManagementSystem
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose -f docker-compose.dev.yml up --build
```

Then open frontend and backend health endpoint according to your local setup.

## Production Deployment (Docker Compose)

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

## Test Commands

```bash
cd backend && npm test
cd frontend && npm run test:run
```

---

## Important Notes

- This codebase primarily uses **MongoDB models**, though legacy Sequelize artifacts exist in scripts/dependencies.
- Documentation includes **explicit assumptions** where implementation details are implied by current repository structure.

For complete architecture, workflows, schema, API contracts, deployment, troubleshooting, and maintenance playbooks, use the docs linked above.
