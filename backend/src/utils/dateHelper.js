const { AppError } = require('./AppError');

/**
 * Convert date input to midnight UTC
 * @param {string|Date} dateInput - Date string ('YYYY-MM-DD') or Date object
 * @returns {Date} New Date object set to midnight UTC of the given date
 * @throws {AppError} If date format is invalid
 */
function toMidnightUTC(dateInput) {
  let date;

  if (typeof dateInput === 'string') {
    // Parse string format 'YYYY-MM-DD'
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateInput)) {
      throw new AppError(400, 'Invalid date format');
    }
    date = new Date(dateInput + 'T00:00:00Z');
  } else if (dateInput instanceof Date) {
    date = new Date(dateInput);
  } else {
    throw new AppError(400, 'Invalid date format');
  }

  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw new AppError(400, 'Invalid date format');
  }

  // Create new date at midnight UTC
  const utcDate = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0
  ));

  return utcDate;
}

/**
 * Convert Date object to 'YYYY-MM-DD' string
 * @param {Date} date - Date object to convert
 * @returns {string} Date string in 'YYYY-MM-DD' format
 */
function toDateString(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate array of dates for a given range
 * @param {Date} fromDate - Start date (inclusive)
 * @param {Date} toDate - End date (inclusive)
 * @returns {Array<Date>} Array of Date objects at midnight UTC for each day in range
 * @throws {AppError} If date range is invalid or exceeds 180 days
 */
function getDateRange(fromDate, toDate) {
  if (!(fromDate instanceof Date) || !(toDate instanceof Date)) {
    throw new AppError(400, 'Invalid date format');
  }

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new AppError(400, 'Invalid date format');
  }

  if (fromDate > toDate) {
    throw new AppError(400, 'fromDate cannot be after toDate');
  }

  // Check max range of 180 days
  const diffTime = toDate.getTime() - fromDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 180) {
    throw new AppError(400, 'Date range cannot exceed 180 days');
  }

  const dates = [];
  const current = new Date(fromDate);

  while (current <= toDate) {
    dates.push(new Date(Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate(),
      0,
      0,
      0,
      0
    )));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Check if date falls on a weekend (Saturday or Sunday)
 * @param {Date} date - Date to check
 * @returns {boolean} True if Saturday (6) or Sunday (0)
 */
function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Get academic year string based on date
 * Academic year runs from June 1 to May 31
 * @param {Date} [date=new Date()] - Date to get academic year for
 * @returns {string} Academic year in format 'YYYY-YY' (e.g., '2024-25')
 */
function getAcademicYear(date = new Date()) {
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();

  // Academic year starts in June (month 5)
  if (month >= 5) {
    // June onwards: current year to next year
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    // January to May: previous year to current year
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

/**
 * Check if attendance marking is within edit window
 * @param {Date} markedAt - Timestamp when attendance was originally marked
 * @param {number} windowHours - Edit window duration in hours
 * @returns {boolean} True if current time is within windowHours of markedAt
 */
function isWithinEditWindow(markedAt, windowHours) {
  const windowMs = windowHours * 60 * 60 * 1000;
  const elapsedMs = Date.now() - markedAt.getTime();
  return elapsedMs < windowMs;
}

module.exports = {
  toMidnightUTC,
  toDateString,
  getDateRange,
  isWeekend,
  getAcademicYear,
  isWithinEditWindow
};
