const Department = require('../../src/models/Department');
const Student = require('../../src/models/Student');
const Attendance = require('../../src/models/Attendance');
const Faculty = require('../../src/models/Faculty');
const User = require('../../src/models/User');

describe('Database schema flow tests', () => {
  test('department schema enforces required unique fields', () => {
    const schemaPaths = Department.schema.paths;
    expect(schemaPaths.name.options.required).toBeTruthy();
    expect(schemaPaths.code.options.unique).toBe(true);
  });

  test('student schema keeps relation with Department and required academic fields', () => {
    const schemaPaths = Student.schema.paths;
    expect(schemaPaths.departmentId.options.ref).toBe('Department');
    expect(schemaPaths.semester.options.required).toBeTruthy();
    expect(schemaPaths.rollNumber.options.unique).toBe(true);
  });

  test('attendance schema has duplicate-prevention unique index', () => {
    const indexes = Attendance.schema.indexes();
    const hasUniqueAttendanceIndex = indexes.some(([fields, options]) => (
      options?.unique === true
      && fields.studentId === 1
      && fields.subjectId === 1
      && fields.date === 1
      && fields.periodNumber === 1
    ));

    expect(hasUniqueAttendanceIndex).toBe(true);
  });

  test('attendance schema includes report/performance indexes', () => {
    const indexes = Attendance.schema.indexes();
    const hasDepartmentDateIndex = indexes.some(([fields]) => fields.departmentId === 1 && fields.date === 1);
    const hasSubjectDatePeriodIndex = indexes.some(([fields]) => fields.subjectId === 1 && fields.date === 1 && fields.periodNumber === 1);

    expect(hasDepartmentDateIndex).toBe(true);
    expect(hasSubjectDatePeriodIndex).toBe(true);
  });

  test('faculty schema normalizes optional identifiers and indexes only non-empty values', () => {
    const faculty = new Faculty({
      name: 'Test Faculty',
      email: 'faculty@test.edu',
      departmentId: '507f1f77bcf86cd799439011',
      designation: 'Assistant Professor',
      phone: '   ',
      employeeId: '   ',
    });

    expect(faculty.phone).toBeNull();
    expect(faculty.employeeId).toBeNull();

    const indexes = Faculty.schema.indexes();
    const phoneIndex = indexes.find(([fields]) => fields.phone === 1);
    const employeeIdIndex = indexes.find(([fields]) => fields.employeeId === 1);

    expect(phoneIndex?.[1]?.unique).toBe(true);
    expect(phoneIndex?.[1]?.partialFilterExpression).toEqual({ phone: { $type: 'string', $gt: '' } });
    expect(employeeIdIndex?.[1]?.unique).toBe(true);
    expect(employeeIdIndex?.[1]?.partialFilterExpression).toEqual({ employeeId: { $type: 'string', $gt: '' } });
  });

  test('user schema keeps username optional and unique only for non-empty values', () => {
    const user = new User({
      email: 'user@test.edu',
      role: 'faculty',
      passwordHash: 'hash',
      username: '   ',
    });

    expect(user.username).toBeUndefined();

    const indexes = User.schema.indexes();
    const usernameIndex = indexes.find(([fields]) => fields.username === 1);

    expect(usernameIndex?.[1]?.unique).toBe(true);
    expect(usernameIndex?.[1]?.partialFilterExpression).toEqual({ username: { $type: 'string', $gt: '' } });
  });
});
