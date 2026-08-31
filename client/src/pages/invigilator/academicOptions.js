// UAM faculty → department structure. Keys are the internal enum values
// (stored on the report); labels are what the invigilator sees. Department
// dropdown reads from FACULTIES[faculty].departments — nothing else needs
// to change if this list is edited later.
export const FACULTIES = {
  AGRONOMY: {
    label: 'Agronomy',
    departments: ['Crop Production', 'Crop & Environmental Protection', 'Plant Breeding & Seed Science', 'Soil Science'],
  },
  ANIMAL_SCIENCE: {
    label: 'Animal Science',
    departments: ['Animal Production', 'Animal Nutrition', 'Animal Breeding & Physiology'],
  },
  AGRIC_ECONOMICS_EXTENSION: {
    label: 'Agricultural Economics & Extension',
    departments: ['Agricultural Economics', 'Agricultural Extension & Rural Development'],
  },
  AGRIC_SCIENCE_EDUCATION: {
    label: 'Agricultural Science Education',
    departments: [
      'Agricultural Education',
      'Biology/Chemistry/Physics/Integrated Science Education',
      'Mathematics/Computer Science Education',
      'Educational Foundations',
    ],
  },
  ENGINEERING: {
    label: 'Engineering',
    departments: ['Agricultural & Environmental Engineering', 'Civil Engineering', 'Electrical/Electronics Engineering', 'Mechanical Engineering'],
  },
  FORESTRY_FISHERIES: {
    label: 'Forestry & Fisheries',
    departments: ['Social & Environmental Forestry', 'Forestry Production', 'Wildlife & Range Management', 'Fisheries & Aquaculture'],
  },
  FOOD_TECH_HUMAN_ECOLOGY: {
    label: 'Food Technology & Human Ecology',
    departments: ['Food Science & Technology', 'Home Science Management', 'Nutrition & Dietetics'],
  },
  BIOLOGICAL_SCIENCES: {
    label: 'Biological Sciences',
    departments: ['Botany', 'Biochemistry', 'Zoology', 'Microbiology'],
  },
  PHYSICAL_SCIENCES: {
    label: 'Physical Sciences',
    departments: ['Chemistry', 'Mathematics', 'Statistics', 'Computer Science', 'Physics'],
  },
  VETERINARY_MEDICINE: {
    label: 'Veterinary Medicine',
    departments: ['DVM', 'Veterinary Anatomy', 'Veterinary Pathology/Microbiology', 'Veterinary Public Health', 'Veterinary Surgery'],
  },
  MANAGEMENT_SCIENCES: {
    label: 'Management Sciences',
    departments: [
      'Agribusiness',
      'Business Administration',
      'Accounting & Finance',
      'Banking & Finance',
      'Marketing',
      'Public Administration',
      'Entrepreneurship',
      'Procurement Management',
    ],
  },
};

export const FACULTY_OPTIONS = Object.values(FACULTIES).map(({ label }) => ({ value: label, label }));

// Report.examDetails.faculty stores the human-readable label directly
// (e.g. "Agronomy"), not the raw enum key (e.g. AGRONOMY) — keeps the
// case-file view readable without a decode step. Department lookup keys
// off that same label.
export function departmentsFor(facultyLabel) {
  const entry = Object.values(FACULTIES).find((f) => f.label === facultyLabel);
  return entry?.departments || [];
}

// Reverse lookup: department -> the faculty (== college) it belongs to.
// Built once from FACULTIES directly (not from a deduped Set) so it stays
// correct even if a future department name were ever repeated across two
// faculties — first faculty listed wins rather than silently disappearing.
// Used server-side too (server/config/academicMap.js is the canonical copy
// the backend requires, kept in sync with this file's FACULTIES data) to
// resolve "which college does this department report up to" when a case
// escalates from Department review to College review.
export function facultyForDepartment(departmentName) {
  if (!departmentName) return null;
  for (const faculty of Object.values(FACULTIES)) {
    if (faculty.departments.includes(departmentName)) return faculty.label;
  }
  return null;
}

export const SEMESTERS = ['First', 'Second'];

export const LEVELS = ['100', '200', '300', '400', '500', '600'];

export const DEGREES = ['B.Sc.', 'B.Eng.', 'B.Agric.', 'DVM', 'M.Sc.', 'PhD'];

// Session is derived, not entered — spec requirement: "internally
// calculated from the current year and previous year". Academic sessions
// conventionally run roughly August-July, so before August we're still in
// the session that started the previous calendar year.
export function currentSession(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed; 7 = August
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

// Dropdown options for the session field: the current session first, then
// the 9 before it (10 total), so invigilators can file for a recent past
// session without typing it by hand.
export function sessionOptions(count = 10, referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const startYear = month >= 7 ? year : year - 1;
  const options = [];
  for (let i = 0; i < count; i++) {
    const y = startYear - i;
    options.push(`${y}/${y + 1}`);
  }
  return options;
}
