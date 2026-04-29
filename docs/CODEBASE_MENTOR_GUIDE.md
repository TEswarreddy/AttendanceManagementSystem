# Codebase Mentor Guide

This guide explains the Attendance Management System (AMS) in a practical learning order for developers.

## 1) Project purpose

AMS is a multi-role college attendance platform. It replaces manual registers and fragmented spreadsheets with a centralized workflow for attendance marking, timetable mapping, shortage detection, notifications, and reports.

## 2) Tech stack

- Frontend: React + Vite, React Router, React Query, Axios, Tailwind.
- Backend: Node.js + Express, Mongoose ODM.
- Datastores: MongoDB as primary database, Redis for token/cache style use cases.
- Auth/Security: JWT access + refresh tokens, role-based authorization, Helmet, CORS, rate limiting.

## 3) Architecture and folder map

- `frontend/src/App.jsx`: route map and role-based route protection.
- `frontend/src/context/AuthContext.jsx`: login session lifecycle and token/user state.
- `frontend/src/api/*`: API wrappers by feature/role.
- `backend/src/app.js`: Express middleware and route mounting.
- `backend/src/routes/*`: endpoint grouping.
- `backend/src/controllers/*`: request handling and orchestration.
- `backend/src/models/*`: schema and data constraints.
- `backend/src/services/*`: reusable business services (PDF, Excel, QR, notifications).

## 4) Entry and execution flow

- Backend starts in `backend/server.js`.
  1. Load env.
  2. Connect MongoDB.
  3. Seed indexes.
  4. Connect Redis (best effort).
  5. Start Express server and cron jobs.
- Frontend starts in `frontend/src/main.jsx`, rendering `App`.

## 5) Core business logic

Key logic centers:

- Attendance marking/editing and retrieval.
- Role-based dashboards and permissions.
- Timetable-aware attendance display and summaries.
- Defaulter/shortage reporting and exports.

## 6) Database model fundamentals

Important collections and links:

- `User` stores identity, role, permissions, auth metadata.
- `Student` and `Faculty` store role profile entities.
- `Attendance` links student + subject + faculty + date + period with unique constraints.
- `Timetable` links scheduling metadata used for attendance context.

## 7) Authentication and security design

- Login validates password hash and returns tokens.
- Access token protects API requests (`Authorization: Bearer`).
- Refresh token supports session continuity.
- Frontend stores auth tokens and user locally and refreshes user state periodically.

## 8) API layout

Main groups mounted under `/api/*` include:

- `auth`, `attendance`, `qr`, `reports`, `timetable`.
- role-focused groups: `student`, `students`, `faculty`, `class-teacher`, `hod`, `admin`, `attendance-coordinator`.

## 9) Local setup summary

- Copy env examples for backend and frontend.
- Run Docker compose for development.
- Alternatively run backend/frontend separately with npm scripts.

## 10) Notable weak areas

- Route naming overlap/duplication indicates legacy transition and maintainability risk.
- Role logic appears in both frontend and backend; drift risk without centralized policy tests.
- Mixed “legacy artifact” references in docs indicate potential dead code paths.

## 11) Suggested improvements

- Consolidate duplicated role-routing/authorization declarations into shared policy definitions.
- Add stricter schema-level and API-level validation coverage.
- Introduce end-to-end regression flows for high-risk operations (attendance edit approvals, QR).
- Improve observability (structured logs, trace IDs, metrics dashboards).

## 12) Learning roadmap for a junior developer

1. Read `README.md` and technical docs to learn domain and roles.
2. Trace backend boot: `server.js` -> `app.js` -> one route file -> one controller.
3. Study models in this order: `User`, `Student`, `Faculty`, `Attendance`, `Timetable`.
4. Trace one end-to-end feature: Login, Mark Attendance, View Student Dashboard.
5. Study frontend auth and protected routes.
6. Study reporting services and exports.
7. Review tests and add missing integration tests where confidence is low.
