/**
 * Calculate attendance percentage with late marking as 0.5
 * @param {number} present - Number of classes attended
 * @param {number} late - Number of classes attended late (counted as 0.5)
 * @param {number} total - Total number of classes
 * @returns {number} Attendance percentage (0-100)
 */
function calculatePercentage(present, late, total) {
  if (total === 0) return 0;
  const weighted = present + (late * 0.5);
  return Number(((weighted / total) * 100).toFixed(2));
}

/**
 * Calculate how many consecutive classes student must attend to reach 75%
 * @param {number} present - Number of classes attended
 * @param {number} late - Number of classes attended late
 * @param {number} total - Total number of classes so far
 * @returns {number} Number of classes needed (minimum 0)
 */
function classesNeededFor75(present, late, total) {
  const weighted = present + (late * 0.5);
  const needed = Math.ceil((0.75 * total - weighted) / 0.25);
  return Math.max(0, needed);
}

/**
 * Calculate how many classes student can miss and still maintain 75%
 * @param {number} present - Number of classes attended
 * @param {number} late - Number of classes attended late
 * @param {number} total - Total number of classes so far
 * @returns {number} Number of classes that can be missed (minimum 0)
 */
function classesCanAffordToMiss(present, late, total) {
  const weighted = present + (late * 0.5);
  const canMiss = Math.floor((weighted - 0.75 * total) / 0.75);
  return Math.max(0, canMiss);
}

/**
 * Get attendance status based on percentage
 * @param {number} percentage - Attendance percentage
 * @returns {string} Status: 'safe' (>=75), 'warning' (>=65 and <75), 'critical' (<65)
 */
function getAttendanceStatus(percentage) {
  if (percentage >= 75) return 'safe';
  if (percentage >= 65) return 'warning';
  return 'critical';
}

/**
 * Build enriched subject summary with calculated attendance fields
 * @param {Array} rawAggregationResult - Array of subject data from aggregation pipeline
 * @param {string} rawAggregationResult[].subjectName - Name of the subject
 * @param {string} rawAggregationResult[].subjectCode - Code of the subject
 * @param {number} rawAggregationResult[].total - Total classes held
 * @param {number} rawAggregationResult[].present - Classes attended
 * @param {number} rawAggregationResult[].late - Classes attended late
 * @param {number} [rawAggregationResult[].absent] - Classes absent (optional)
 * @param {number} [rawAggregationResult[].medicalLeave] - Medical leaves (optional)
 * @returns {Array} Enhanced array with percentage, status, classesNeeded, canMiss fields, sorted by status (critical → warning → safe)
 */
function buildSubjectSummary(rawAggregationResult) {
  if (!Array.isArray(rawAggregationResult)) {
    return [];
  }

  const enriched = rawAggregationResult.map(item => {
    const percentage = calculatePercentage(item.present, item.late, item.total);
    const status = getAttendanceStatus(percentage);
    const classesNeeded = classesNeededFor75(item.present, item.late, item.total);
    const canMiss = classesCanAffordToMiss(item.present, item.late, item.total);

    return {
      ...item,
      percentage,
      status,
      classesNeeded,
      canMiss
    };
  });

  // Sort by status: critical first, then warning, then safe
  const statusOrder = { critical: 0, warning: 1, safe: 2 };
  return enriched.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
}

/**
 * Calculate overall attendance percentage across all subjects
 * @param {Array} subjectSummaries - Array of subject summaries from buildSubjectSummary
 * @param {number} subjectSummaries[].percentage - Subject attendance percentage
 * @param {number} [subjectSummaries[].credits] - Credit hours for weighted average (optional)
 * @returns {number} Overall attendance percentage (weighted average if credits available, else simple average)
 */
function calculateOverallPercentage(subjectSummaries) {
  if (!Array.isArray(subjectSummaries) || subjectSummaries.length === 0) {
    return 0;
  }

  // Check if credits are available for weighted average
  const hasCredits = subjectSummaries.some(item => typeof item.credits === 'number' && item.credits > 0);

  if (hasCredits) {
    // Weighted average using credits
    let totalWeighted = 0;
    let totalCredits = 0;

    subjectSummaries.forEach(item => {
      const credits = item.credits || 0;
      totalWeighted += item.percentage * credits;
      totalCredits += credits;
    });

    if (totalCredits === 0) return 0;
    return Number((totalWeighted / totalCredits).toFixed(2));
  } else {
    // Simple average of all percentages
    const sum = subjectSummaries.reduce((acc, item) => acc + item.percentage, 0);
    return Number((sum / subjectSummaries.length).toFixed(2));
  }
}

module.exports = {
  calculatePercentage,
  classesNeededFor75,
  classesCanAffordToMiss,
  getAttendanceStatus,
  buildSubjectSummary,
  calculateOverallPercentage
};
