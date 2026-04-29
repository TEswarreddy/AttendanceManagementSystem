# Attendance Management System - Technical Documentation

## 1. Executive Summary

### Project Name
**Attendance Management System (AMS)**

### Purpose
AMS digitizes end-to-end attendance operations for colleges/departments with multi-role governance, timetable-linked marking, defaulter tracking, and downloadable reports.

### Problems Solved
- Manual attendance errors and duplication
- Lack of role-specific visibility and controls
- Delayed defaulter identification
- Non-standard report generation for internal review and compliance
- Weak auditability for attendance edits

### Key Benefits
- Role-based workflows and accountability
- Consistent attendance calculations and threshold logic
- Faster reporting (student/class/department)
- Integrated notification pipeline (app/email/SMS hooks)
- Better operational traceability via audit logs

### Target Users
- Institution leadership (Admin/Principal)
- Department leadership (HOD)
- Attendance and timetable coordinators
- Class teachers and faculty
- Students
- IT operations / deployment team

---

## 2. System Overview

### High-Level Architecture

```text
[Browser SPA - React/Vite]
        |
        | HTTPS + JWT (Bearer)
        v
[Node.js + Express API Layer]
        |
        | Mongoose ODM
        v
[MongoDB]

[Redis] <-- token blacklist, refresh token cache, OTP cache, report cache
```

### User Interaction Model
1. User authenticates via `/api/auth/login`.
2. Frontend stores access+refresh token.
3. Protected routes enforce role constraints.
4. Role dashboards consume scoped APIs.
5. Attendance/report actions are logged and returned in structured responses.

### Main Modules
- Authentication & Profile
- User/Role Management
- Department/Subject/Class Management
- Timetable Management
- Attendance Marking & Edit Approval
- QR Attendance Sessions
- Notifications
- Reports & Exports (PDF/Excel)
- Admin Analytics & Audit Logs

---

## 3. Technology Stack

### Frontend
| Category | Stack |
|---|---|
| Framework | React 19 + Vite |
| Routing | react-router-dom |
| Styling | Tailwind CSS |
| Data Fetching | Axios + React Query helpers |
| Forms | react-hook-form |
| Feedback/UI | react-hot-toast, headlessui, heroicons |
| Charts | chart.js + react-chartjs-2 |
| Testing | Vitest + Testing Library |

### Backend
| Category | Stack |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Auth | JWT (access + refresh) |
| Security | helmet, cors, express-rate-limit |
| Validation | express-validator |
| Logging | morgan |
| Scheduling | node-cron |
| Files | pdfkit, exceljs |

### Database & Data Services
| Category | Stack |
|---|---|
| Primary DB | MongoDB (Mongoose) |
| Cache / Session-like store | Redis (ioredis/redis) |
| ODM | Mongoose |

### Dev/Delivery Tools
Git, Docker, Docker Compose, Nginx, Jest/Supertest, Postman, VS Code.

---

## 4. Folder Structure Documentation

## Root
- `frontend/`: SPA source and tests.
- `backend/`: API server, models, controllers, services.
- `docker-compose.yml`: production orchestration.
- `docker-compose.dev.yml`: development orchestration.

## Frontend
| Folder | Purpose |
|---|---|
| `src/pages/` | Role and feature pages (admin/hod/student/faculty/class-teacher/coordinator). |
| `src/components/shared/` | Reusable UI components, wrappers, protected routing. |
| `src/api/` | API clients by module/role. |
| `src/context/` | Auth context and session lifecycle. |
| `src/hooks/` | Feature hooks for attendance/reports/QR. |
| `src/lib/` | Data client setup (query client). |
| `src/utils/` | Constants and utility helpers. |
| `src/tests/` | Unit/integration UI tests. |
| `public/` & `src/assets/` | Static images/icons. |

## Backend
| Folder | Purpose |
|---|---|
| `src/routes/` | Route registration and role guards per module. |
| `src/controllers/` | Request handlers and orchestration logic. |
| `src/models/` | Mongoose schema definitions + statics/indexes. |
| `src/middlewares/` | Auth, RBAC, validation, rate limiting, error handling. |
| `src/services/` | Cross-cutting business services (PDF/Excel/Email/SMS/QR/etc.). |
| `src/config/` | DB, Redis, seeding, environment-based setup. |
| `src/utils/` | helpers: JWT, date, attendance calculations, response formatting. |
| `src/jobs/` | Cron registration. |

---

## 5. User Roles & Permissions

> Note: Codebase includes both `admin` and `principal` roles; principal acts as super-admin equivalent.

| Role | Core Permissions | Visibility Scope | Typical Actions |
|---|---|---|---|
| Principal / Super Admin | All controls | Institution-wide | Governance, audits, role governance, high-level stats |
| Admin | Full operational management | Institution-wide | Departments, users, subjects, timetables, thresholds, reports |
| HOD | Department governance | Department-wide | Assign coordinators, manage faculty/students, low-attendance review |
| Attendance Coordinator | Attendance analytics operations | Department-wide | Defaulter lists, attendance downloads, alerts |
| Time Table Coordinator | Timetable operations + attendance-capable | Department-wide | Create/update timetables, schedule stewardship |
| Class Teacher | Class-level management | Assigned class | Student updates, notices, monthly alerts/reports |
| Faculty | Academic operations | Assigned subjects/classes | Mark/edit attendance (windowed), class summary |
| Student | Personal access only | Self | View attendance/timetable/notifications/leaves |

### CRUD & Approval Summary
- **Create/Update/Delete**: Admin/HOD-led for users/departments/subjects.
- **Attendance Edit (windowed)**: Faculty roles within edit window.
- **Attendance Edit (override)**: Admin/HOD with reason.
- **Approval Workflow**: Edit approval request entity supports pending/approved/rejected/auto-expired states.

---

## 6. Authentication & Security

### Login Flow
1. User submits email/password.
2. Backend verifies password hash (`bcrypt`).
3. Access + refresh JWT tokens are issued.
4. Refresh token cached in Redis with TTL.

### JWT Flow
- Access token: required in `Authorization: Bearer <token>`.
- Refresh token: exchanged at `/api/auth/refresh-token`.

### Logout / Session Controls
- Access token blacklisted in Redis.
- Refresh token removed from Redis.
- Password changes invalidate active token chain.

### RBAC & Protected Routes
- Backend: `protect` + `authorize(...)` middleware.
- Frontend: `ProtectedRoute` with `allowedRoles` route-level policy.

### Password Handling
- Password stored as `passwordHash` only.
- Hashing via bcrypt pre-save hook.

### Security Best Practices Implemented
- Helmet headers
- CORS origin restriction via env
- Rate limiters for auth/report/attendance marking
- Structured error handling (AppError)
- Token invalidation with Redis blacklist

---

## 7. Database Documentation

> Primary datastore is MongoDB with normalized references and embedded subdocuments where useful.

### Core Collections
- `users`
- `students`
- `faculties`
- `departments`
- `subjects`
- `timetables`
- `attendance`
- `auditlogs`
- `editapprovalrequests`
- `notices`
- `shortagelists`
- `eligibilityreports`
- `qrsessions`
- `userprofiles`

### Schema Summary (High-Level)

| Collection | Key Fields | Relationships | Constraints / Indexes |
|---|---|---|---|
| Users | email, passwordHash, role, profileId | `profileId` -> Student/Faculty | unique email; role enum; refresh token limit |
| Students | rollNumber, name, dept, semester, section | dept ref | unique roll/email; dept-sem-section index |
| Faculty | employeeId, name, dept, designation | dept ref | unique sparse employeeId |
| Departments | name, code, hodId, coordinator IDs | faculty refs | unique name/code |
| Subjects | subjectCode, dept, semester, type | dept ref | unique subjectCode; dept-sem index |
| Timetable | facultyId, subjectId, semester, section, schedule[] | faculty/subject/dept refs | unique assignment composite |
| Attendance | studentId, subjectId, facultyId, date, periodNumber, status | student/subject/faculty refs | unique student+subject+date+period |
| AuditLog | action, performedBy, targetId, old/new values | user ref | immutable semantics + TTL cleanup |
| EditApprovalRequest | requestedBy, requestedStatus, reason, review status | user/attendance refs | status index + expiry index |
| Notice | title, message, target class, recipientRoles | dept/user refs | target and role target indexes |
| ShortageList | generatedBy, examType, students[] | dept/user refs | dept-sem-academicYear-examType index |
| EligibilityReport | generatedBy, threshold, students[] | dept/user refs | generated snapshots |
| QRSession | sessionId, token, scannedStudents[], expiresAt | subject/dept/student refs | TTL on expiresAt + sessionId unique |

### ER Diagram (Text)

```text
Department 1---* Student
Department 1---* Faculty
Department 1---* Subject
Department 1---* Timetable
Department 1---* Attendance

User 1---1 Student (for role=student)
User 1---1 Faculty (for role in faculty-group)
User 1---0..1 UserProfile

Subject 1---* Attendance
Student 1---* Attendance
Faculty 1---* Attendance

Faculty 1---* Timetable
Subject 1---* Timetable

Attendance 1---* EditApprovalRequest
Attendance 1---* AuditLog (targeted history)

Department 1---* Notice
Department 1---* ShortageList
Department 1---* EligibilityReport
```

---

## 8. Functional Modules Documentation

### Dashboard
- Role-specific cards (totals, percentages, pending actions)
- Trend/analytics blocks (attendance rate patterns)
- Recent activity and notifications

### User Management
- Student/faculty creation and updates
- HOD/account provisioning
- Role updates and deactivation flows

### Department/Subject/Class Management
- Department CRUD
- Subject CRUD
- Timetable assignment + updates

### Attendance Marking
- Period/session-based marking
- Assignment validation against timetable
- Duplicate prevention via unique attendance index
- Bulk write transaction handling

### Attendance Reports & Export
- Student/class/department reports
- PDF and Excel generation services
- Dashboard stats endpoints for analytics widgets

### Notifications
- Read/unread tracking
- Role and class scoped notices

### Settings/Profile
- Attendance threshold/academic-year controls
- User profile CRUD (account + extended profile)

---

## 9. API Documentation (Reference)

Full endpoint-level specification is maintained in: **`docs/API_DOCUMENTATION.md`**.

---

## 10. Frontend Documentation

### Routing Structure
- Public: `/`, `/about`, `/login`
- Protected base redirect: `/app` (redirect by role)
- Role areas: `/student/*`, `/faculty/*`, `/class-teacher/*`, `/hod/*`, `/attendance-coordinator/*`, `/ttc/*`, `/admin/*`

### Protected Routes
- `ProtectedRoute` validates authentication and allowed roles.
- Unauthorized users redirected to `/unauthorized` or `/login`.

### State Management
- Auth: Context + reducer
- Server data: query client hooks + axios API abstraction

### API Integration
- Axios interceptor injects bearer token
- 401 handler attempts refresh and retries once
- Fallback to logout/redirect on refresh failure

### Forms & Validation
- Form-level validation using `react-hook-form`
- Backend validation enforced with express-validator

### Responsive Strategy
- Utility-first styling via Tailwind
- Shared component primitives for tables/nav/layout/status

---

## 11. Backend Documentation

### Server Setup
- `server.js` loads env, connects DB, seeds indexes, connects Redis, starts app.
- Graceful SIGTERM/SIGINT shutdown closes HTTP + DB + Redis.

### Middleware Chain
`helmet -> cors -> json/urlencoded parsers -> morgan -> route modules -> 404 handler -> error handler`

### Route Registration
All routes are mounted under `/api/*` namespaces (`auth`, `attendance`, `reports`, `admin`, etc.).

### Controllers & Services
- Controllers orchestrate validation + model operations + responses.
- Services encapsulate PDF/Excel/email/sms/QR/report utilities.

### Error Handling & Logging
- Custom `AppError` and centralized `errorHandler`
- Request logging via morgan
- Audit logs for critical attendance modifications

### Validation
- Request validation rules in `middlewares/validate.js`
- Role and auth validation via `protect`/`authorize`

### File Generation
- PDF: pdfkit-based services
- Excel: exceljs workbook generation and streaming

---

## 12. Attendance Logic (Business Rules)

- Attendance can be marked only by authorized and assigned faculty roles.
- Future date marking is blocked.
- Duplicate entries prevented using unique compound index.
- Late (`L`) contributes partially in percentage calculations.
- Edit window controlled by `MAX_EDIT_WINDOW_HOURS`.
- Admin/HOD override edit requires explicit reason.
- Threshold-based shortage detection uses configured/default threshold.

---

## 13. Reports System

### Report Types
- Daily class report
- Monthly class report
- Student-wise report
- Department-wise report
- Defaulter/shortage snapshots

### Export
- PDF and Excel supported natively.
- Download endpoints enforce role-based access.

---

## 14. UI/UX Documentation

- Clean, modular dashboard-first layout.
- Consistent status badges and tabular views.
- Tailwind-led design tokens and responsive spacing.
- Accessibility baseline: semantic controls, keyboard-friendly patterns via React components.

---

## 15. Installation Guide

### Local Setup
1. Clone repository
2. Configure env files from examples
3. Install dependencies (`npm install` in `frontend` and `backend`) or use compose
4. Start backend and frontend (or compose dev stack)

### Production Deployment
1. Prepare backend `.env`
2. Build and run `docker compose up -d --build`
3. Configure domain + reverse proxy + SSL
4. Validate health endpoint and frontend API connectivity

(Expanded operations in `docs/DEPLOYMENT_GUIDE.md`.)

---

## 16. Environment Variables

### Backend
- `PORT`, `NODE_ENV`
- `MONGODB_URI`, `MONGO_DNS_SERVERS`
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `SMTP_*`, `FROM_EMAIL`, `SENDGRID_*`
- `TWILIO_*`
- `ATTENDANCE_THRESHOLD`, `MAX_EDIT_WINDOW_HOURS`, `FRONTEND_URL`

### Frontend
- `VITE_API_URL`, `VITE_APP_NAME`, `VITE_COLLEGE_NAME`, `VITE_ATTENDANCE_THRESHOLD`, `VITE_APP_VERSION`

---

## 17. Testing Documentation

- **Backend unit/integration:** Jest + Supertest patterns
- **Frontend unit/integration:** Vitest + React Testing Library
- **API testing:** Jest + Supertest contract/integration suites (`backend/tests/api`, `backend/tests/integration`)
- **End-to-end testing:** Playwright multi-device suite (`frontend/tests/e2e`)
- **Database testing:** Mongoose schema/index flow tests (`backend/tests/database`)
- **Edge cases:** token expiry, duplicate attendance, permission denial, invalid IDs, export failures

---

## 18. Performance Optimization

- DB indexes on frequent query paths (attendance/student/date/subject)
- Redis caching for stats/report datasets
- Pagination helpers for heavy datasets
- React lazy-loading and route-level code splitting
- HTTP compression/proxy-level optimizations via Nginx (deploy layer)

---

## 19. Error Handling & Troubleshooting

| Issue | Probable Cause | Resolution |
|---|---|---|
| 401 Unauthorized | Missing/expired access token | Refresh token flow or re-login |
| Token expired loops | Refresh endpoint mismatch/config issue | Verify refresh route and frontend interceptor settings |
| Report download failure | Missing query params/permission | Validate role and required IDs/date filters |
| Dashboard counts stale | Cache not invalidated yet | Wait TTL or force refresh/invalidation routine |
| CORS error | FRONTEND_URL mismatch | Align backend CORS origin env |
| DB connection failure | Bad URI/network/DNS | Validate `MONGODB_URI` and outbound access |

---

## 20. Maintenance Guide

- Scheduled Mongo backup and restore drills
- Redis persistence/eviction strategy review
- Centralized log retention and alerting
- Dependency patching cadence (monthly)
- Index health checks and slow query review
- Horizontal scaling through container replicas and externalized Redis/DB

---

## 21. Future Enhancements

- Biometric integration (device API)
- Face-recognition attendance workflow
- Mobile app (student/faculty companion)
- Enhanced push notifications (FCM/WebPush)
- AI analytics for risk prediction and intervention planning

---

## Assumptions & Notes

1. Some endpoints/services indicate planned/legacy extensions (e.g., mixed API clients, placeholder docs paths); this document captures the **current implementation intent** and operational design.
2. “Super Admin” is mapped to `principal` where applicable.
3. Primary report exports are PDF/Excel; CSV can be added as an extension with existing data service patterns.
