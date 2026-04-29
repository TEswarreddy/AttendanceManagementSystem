# Attendance Management System - Admin Manual

## 1. Audience
This guide is intended for Principal/Super Admin equivalent, Admin, and HOD-level operators.

## 2. Administrative Responsibilities

| Role | Main Responsibilities |
|---|---|
| Principal / Super Admin | Institution-wide policy and oversight |
| Admin | Master data, user lifecycle, thresholds, reports |
| HOD | Department governance, coordinator assignment, audit visibility |

## 3. Admin Operational Workflows

### 3.1 Department Setup
1. Create department (name, code, semester count).
2. Assign HOD.
3. Verify department appears active.

### 3.2 Faculty & Student Provisioning
1. Create records individually or bulk upload students.
2. Ensure profile email and user account mapping.
3. Deactivate (not hard delete) when users leave.

### 3.3 Coordinator Assignment (HOD/Admin)
- Assign Time Table Coordinator.
- Assign Attendance Coordinator.
- Assign Class Teacher by class and academic year.

### 3.4 Timetable Governance
- Validate no slot conflicts.
- Keep academic year tags consistent.
- Deactivate stale schedules instead of deleting historical data.

### 3.5 Attendance Policy Controls
- Set global threshold.
- Set departmental overrides where required.
- Communicate edit-window policy to faculty.

### 3.6 Audit & Compliance
- Review attendance edit history.
- Review system audit logs.
- Retain reports for accreditation/internal audits.

## 4. Report Governance
- Generate college-level reports.
- Trigger low-attendance alerts where configured.
- Export and archive department/student reports.

## 5. Security Administration
- Rotate JWT and SMTP/Twilio secrets.
- Enforce strong password policies.
- Restrict API access via network/firewall when possible.
- Use HTTPS and valid SSL certificates.

## 6. Backup and Recovery Checklist
- MongoDB scheduled backups (daily incremental + weekly full).
- Backup retention policy and restore verification drills.
- Redis recovery expectations documented (cache can rebuild).

## 7. Change Management
- Use staging before production deployment.
- Maintain release notes per deployment.
- Rollback plan: previous container image + env snapshot.

## 8. Admin Troubleshooting Matrix

| Symptom | Admin Action |
|---|---|
| Multiple 401 errors | Validate JWT secrets and token expiry values |
| Students missing from class list | Verify student department/semester/section alignment |
| Timetable not appearing | Confirm academicYear and `isActive=true` |
| Export unavailable | Check report endpoint role permission and service logs |
| OTP/reset issues | Validate SMTP config and Redis OTP key TTL |
