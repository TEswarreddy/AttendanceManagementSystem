# Automation Testing Documentation

## 1) Scope
This test framework covers:
- Frontend unit/component testing (Vitest + React Testing Library)
- Frontend E2E workflows (Playwright)
- Backend unit/API/integration testing (Jest + Supertest)
- Database schema/index flow testing (Jest + Mongoose models)
- CI execution on every push/PR

## 2) Test Folder Architecture
```text
tests/
 ├── e2e/
 ├── api/
 ├── unit/
 ├── integration/
 ├── fixtures/
 ├── utils/

frontend/tests/
 ├── e2e/
 ├── fixtures/
 └── utils/

backend/tests/
 ├── api/
 ├── unit/
 ├── integration/
 ├── database/
 ├── fixtures/
 └── utils/
```

## 3) Installation Commands
From repo root:

```bash
cd backend && npm ci
cd ../frontend && npm ci
cd ../frontend && npx playwright install --with-deps chromium
```

## 4) Run Commands

### Backend
```bash
cd backend
npm run test:unit
npm run test:api
npm run test:integration
npm run test:db
npm run test:all
```

### Frontend
```bash
cd frontend
npm run test:unit
npm run test:e2e
npm run test:all
```

## 5) Coverage Matrix

### Authentication
- Login page UI rendering
- Invalid login behavior
- Protected route redirect behavior
- Token/auth guard API checks

### Dashboards and Role Access
- Role-based authorization checks (`401`, `403`, `200`)
- Protected dashboard route guard smoke checks

### CRUD Modules
- Department API role restrictions + create flow
- E2E guard smoke checks for students/faculty/subjects/departments paths

### Attendance
- Duplicate attendance prevention API scenario
- Attendance calculation unit logic

### Reports
- Report routes covered in authorization/security pattern (extendable with fixture-driven tests)

### Database
- Insert and relation tests (Department ↔ Student)
- Duplicate prevention tests (Attendance unique index)

## 6) Reusable Helpers
- `backend/tests/utils/testAppFactory.js`: role-aware app factory for API contract tests.
- `backend/tests/fixtures/users.js`: standard role fixture objects.
- `frontend/tests/utils/auth-fixtures.js`: role credential fixtures for E2E login extensions.

## 7) Mock Data Strategy
- Keep static role fixtures for deterministic tests.
- Use in-memory sets for duplicate detection contract tests.
- Validate schema constraints and index strategy directly from Mongoose models.
- Use route-level smoke checks in E2E for guarded pages.

## 8) Reporting
- Jest coverage: text + lcov + html
- Playwright report: HTML
- Playwright traces/screenshots/videos retained on failure
- GitHub Actions uploads artifacts for coverage and E2E evidence

## 9) CI/CD Pipeline
Workflow: `.github/workflows/ci-cd.yml`

Pipeline stages:
1. Lint + unit tests (frontend and backend)
2. Backend API/integration/database tests
3. Frontend E2E tests with Playwright
4. Docker image build/push (main only)
5. Deployment + post-deploy health check (main only)

All quality gates fail the build when tests fail.

## 10) Best Practices
- Prioritize critical user journeys first (auth, attendance marking, exports).
- Keep fixtures role-based and reusable.
- Keep flaky tests isolated and retry only in CI.
- Prefer deterministic data over network-dependent tests.
- Keep selectors semantic where possible.
- Add one happy-path + one negative-path test for each new API/module.
