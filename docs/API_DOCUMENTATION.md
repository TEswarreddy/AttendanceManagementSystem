# Attendance Management System - API Documentation

**Base URL:** `/api`  
**Auth Header:** `Authorization: Bearer <accessToken>`

## Response Envelope
Typical successful response:
```json
{
  "status": "success",
  "message": "Operation completed",
  "data": {}
}
```

Typical error response:
```json
{
  "status": "error",
  "message": "Validation failed"
}
```

---

## 1. Authentication APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Login and get access/refresh token |
| POST | `/auth/logout` | Yes | Logout and invalidate session |
| POST | `/auth/refresh-token` | No | Refresh access token |
| GET | `/auth/me` | Yes | Get current user payload |
| GET | `/auth/profile` | Yes | Get merged account+profile details |
| POST | `/auth/profile` | Yes | Create extra profile |
| PUT | `/auth/profile` | Yes | Update profile |
| DELETE | `/auth/profile` | Yes | Delete extra profile |
| POST | `/auth/forgot-password` | No | Send OTP |
| POST | `/auth/reset-password` | No | Reset password with OTP |
| PUT | `/auth/change-password` | Yes | Change current password |

### Example: POST `/auth/login`
**Body**
```json
{ "email": "faculty@college.edu", "password": "Secret123" }
```
**Success (200)**
```json
{
  "data": {
    "user": { "id": "...", "email": "faculty@college.edu", "role": "faculty" },
    "accessToken": "jwt",
    "refreshToken": "jwt"
  }
}
```
**Errors:** `401 Invalid email or password`, `429 Too many requests`

---

## 2. Attendance APIs

| Method | Endpoint | Auth | Roles |
|---|---|---|---|
| POST | `/attendance/mark` | Yes | faculty, time_table_coordinator, attendance_coordinator |
| GET | `/attendance/class` | Yes | faculty/class_teacher/ttc/ac/admin/hod |
| GET | `/attendance/student/:studentId` | Yes | self student OR staff roles |
| GET | `/attendance/student/:studentId/subject/:subjectId` | Yes | staff roles |
| PUT | `/attendance/:attendanceId` | Yes | faculty/ttc/ac |
| PUT | `/attendance/admin/:attendanceId` | Yes | admin/hod |
| GET | `/attendance/:attendanceId/history` | Yes | faculty/admin/hod/ttc/ac |
| GET | `/attendance/department/stats` | Yes | admin/hod/ac |
| GET | `/attendance/subject/:subjectId/report` | Yes | faculty/class_teacher/admin/hod/ttc/ac |
| GET | `/attendance/low-attendance` | Yes | faculty/class_teacher/admin/hod/ttc/ac |

### Example: POST `/attendance/mark`
**Body (current implementation pattern)**
```json
{
  "subjectId": "664...",
  "date": "2026-04-25",
  "session": "morning",
  "records": [
    { "studentId": "664...", "status": "P", "remarks": "On time" },
    { "studentId": "665...", "status": "A" }
  ]
}
```
**Success:** inserted/updated counters + normalized date/session details.

---

## 3. Student APIs (`/student`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/student/today-attendance` | Today attendance for student |
| GET | `/student/attendance-summary` | Aggregate summary |
| GET | `/student/attendance/:subjectId` | Subject detail |
| GET | `/student/timetable` | Class timetable |
| GET | `/student/notifications` | Student notices |
| GET | `/student/leaves` | Leave history |

---

## 4. Class Teacher APIs (`/class-teacher`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/class-teacher/timetable` | Assigned class timetable |
| GET | `/class-teacher/daily-attendance` | Daily class attendance |
| POST | `/class-teacher/send-absent-sms` | Trigger absent SMS |
| POST | `/class-teacher/students` | Add student |
| PUT | `/class-teacher/students/:studentId` | Update student |
| GET | `/class-teacher/students` | List class students |
| POST | `/class-teacher/notices` | Send notice |
| GET | `/class-teacher/notices` | Notice history |
| GET | `/class-teacher/leave-requests` | Leave requests |
| GET | `/class-teacher/monthly-alerts` | Low attendance monthly view |
| POST | `/class-teacher/monthly-alerts` | Trigger monthly alerts |
| GET | `/class-teacher/reports/monthly` | Download monthly report |
| GET | `/class-teacher/reports/semester` | Download semester report |

---

## 5. HOD APIs (`/hod`)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/hod/time-table-coordinator/assign` | Assign TTC |
| POST | `/hod/attendance-coordinator/assign` | Assign attendance coordinator |
| POST | `/hod/class-teacher/assign` | Assign class teacher |
| PUT | `/hod/attendance-coordinator/update` | Update attendance coordinator |
| DELETE | `/hod/attendance-coordinator/remove` | Remove attendance coordinator |
| GET | `/hod/faculty` | Department faculty list |
| POST | `/hod/faculty` | Add department faculty |
| GET | `/hod/low-attendance` | Department low attendance |
| POST | `/hod/shortage-list` | Generate shortage list |
| GET | `/hod/audit-logs` | Department audit logs |
| PUT | `/hod/calendar` | Manage department calendar |

---

## 6. Attendance Coordinator APIs (`/attendance-coordinator`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/attendance-coordinator/dashboard` | Dashboard summary |
| GET | `/attendance-coordinator/department-classes` | Class overview |
| GET | `/attendance-coordinator/reports/class` | Class reports |
| GET | `/attendance-coordinator/reports/students` | Student reports |
| GET | `/attendance-coordinator/reports/semester` | Semester reports |
| GET | `/attendance-coordinator/reports/monthly` | Monthly reports |
| GET | `/attendance-coordinator/students/below-threshold` | Defaulters |
| GET | `/attendance-coordinator/students/above-threshold` | Safe-list |
| GET | `/attendance-coordinator/reports/download` | Download reports |
| POST | `/attendance-coordinator/alerts` | Push alerts |

---

## 7. Admin APIs (`/admin`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/dashboard` | Admin dashboard overview |
| POST/PUT/DELETE | `/admin/hods` | HOD management |
| POST | `/admin/hods/create` | Create HOD account |
| POST | `/admin/faculty/create` | Create faculty account |
| PUT | `/admin/threshold` | Set attendance threshold |
| PUT | `/admin/academic-year` | Manage academic year |
| GET | `/admin/reports/college` | College report |
| POST | `/admin/eligibility` | Generate eligibility report |
| GET | `/admin/roles` | Role management listing |
| PUT | `/admin/roles/:userId` | Update user role |
| GET | `/admin/audit-logs` | System audit logs |
| GET | `/admin/stats` | College dashboard stats |

---

## 8. Master Data APIs

### Departments (`/departments`)
- `GET /departments`
- `POST /departments`
- `PUT /departments/:id`
- `DELETE /departments/:id`

### Subjects (`/subjects`)
- `GET /subjects`
- `POST /subjects`
- `PUT /subjects/:id`
- `DELETE /subjects/:id`

### Students (`/students`)
- `GET /students`
- `POST /students`
- `POST /students/bulk-upload` (multipart file)
- `PUT /students/:id`
- `PUT /students/:id/deactivate`

### Faculty (`/faculty`)
- `GET /faculty`
- `POST /faculty`
- `PUT /faculty/:id`
- `DELETE /faculty/:id`

---

## 9. Timetable APIs

| Method | Endpoint |
|---|---|
| GET | `/timetable` |
| POST | `/timetable` |
| PUT | `/timetable/:id` |
| DELETE | `/timetable/:id` |
| POST | `/timetable-coordinator/timetable` |
| PUT | `/timetable-coordinator/timetable/:id` |

---

## 10. Reports APIs (`/reports`)

| Method | Endpoint | Output |
|---|---|---|
| GET | `/reports/student/:studentId/pdf` | PDF |
| GET | `/reports/student/:studentId/excel` | XLSX |
| GET | `/reports/class/pdf` | PDF |
| GET | `/reports/class/excel` | XLSX |
| GET | `/reports/department/pdf` | PDF |
| GET | `/reports/department/excel` | XLSX |
| POST | `/reports/alerts/trigger` | JSON |
| GET | `/reports/dashboard/stats` | JSON |

---

## 11. Notifications APIs

| Method | Endpoint |
|---|---|
| GET | `/notifications` |
| GET | `/notifications/unread-count` |
| PUT | `/notifications/read-all` |
| PUT | `/notifications/:notificationId/read` |

---

## 12. QR Attendance APIs (`/qr`)

| Method | Endpoint | Roles |
|---|---|---|
| POST | `/qr/generate` | faculty/class_teacher/ttc/ac |
| POST | `/qr/scan` | student |
| GET | `/qr/status/:sessionId` | faculty/class_teacher/ttc/ac |
| POST | `/qr/close/:sessionId` | faculty/class_teacher/ttc/ac |

### Example Error Codes
- `400` Invalid parameters
- `401` Unauthorized
- `403` Forbidden role
- `404` Resource not found
- `409` Duplicate conflict
- `429` Rate limit exceeded
- `500` Internal server error

---

## 13. API Security Notes
- Access tokens are short-lived and validated against blacklist.
- Refresh token endpoint must be protected by secure transport (HTTPS in production).
- Sensitive operations are role-restricted and audited.
