process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32-chars-minimum-here';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-32-chars-minimum!!';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
process.env.MAX_EDIT_WINDOW_HOURS = process.env.MAX_EDIT_WINDOW_HOURS || '48';
process.env.ATTENDANCE_THRESHOLD = process.env.ATTENDANCE_THRESHOLD || '75';

jest.setTimeout(30000);
