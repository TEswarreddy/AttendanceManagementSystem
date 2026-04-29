const {
  calculatePercentage,
  classesNeededFor75,
  classesCanAffordToMiss,
  getAttendanceStatus,
  buildSubjectSummary,
  calculateOverallPercentage,
} = require('../../src/utils/attendanceCalc');

describe('attendanceCalc utility', () => {
  test('calculates weighted percentage with late attendance', () => {
    expect(calculatePercentage(12, 2, 20)).toBe(65);
  });

  test('returns classes needed to reach threshold', () => {
    expect(classesNeededFor75(18, 0, 30)).toBe(18);
  });

  test('returns classes a student can miss', () => {
    expect(classesCanAffordToMiss(24, 0, 30)).toBe(2);
  });

  test('maps percentage to status', () => {
    expect(getAttendanceStatus(80)).toBe('safe');
    expect(getAttendanceStatus(70)).toBe('warning');
    expect(getAttendanceStatus(50)).toBe('critical');
  });

  test('builds and sorts subject summaries', () => {
    const result = buildSubjectSummary([
      { subjectName: 'Math', present: 7, late: 0, total: 10 },
      { subjectName: 'Physics', present: 3, late: 0, total: 10 },
    ]);

    expect(result[0].subjectName).toBe('Physics');
    expect(result[0].status).toBe('critical');
  });

  test('calculates weighted overall percentage with credits', () => {
    const overall = calculateOverallPercentage([
      { percentage: 90, credits: 4 },
      { percentage: 60, credits: 2 },
    ]);

    expect(overall).toBe(80);
  });
});
