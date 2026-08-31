/**
 * Canonical faculty(=college) -> department structure, server-side copy.
 *
 * This MUST stay in sync with client/src/pages/invigilator/academicOptions.js
 * (same 11 faculties/colleges, same department lists, same labels) because
 * examDetails.faculty / examDetails.department on a Report are free-text
 * values chosen from that client-side dropdown — the server needs the same
 * map to resolve "which college does this department belong to" without
 * trusting a client-supplied college value.
 *
 * Used by services/collegeResolver.js when a case escalates from
 * Department review to College review (spec addition: "push to college"
 * must route to the college the acting Exam Officer's department actually
 * sits under, not a manually picked one).
 */
const FACULTIES = {
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

const FACULTY_LABELS = Object.values(FACULTIES).map((f) => f.label);

/**
 * @param {string} departmentName
 * @returns {string|null} the faculty/college label this department belongs
 *   to, or null if the department string doesn't match anything in the map
 *   (e.g. a legacy/free-typed value from before this list existed).
 */
function facultyForDepartment(departmentName) {
  if (!departmentName) return null;
  for (const faculty of Object.values(FACULTIES)) {
    if (faculty.departments.includes(departmentName)) return faculty.label;
  }
  return null;
}

module.exports = { FACULTIES, FACULTY_LABELS, facultyForDepartment };
