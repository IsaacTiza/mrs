// These option lists are reconstructed placeholders (spec §7 references
// "the form's list" without enumerating it here). Swap these arrays for
// JOSTUM's actual paper-form checklist wording before this goes to real
// use — nothing else in the wizard needs to change, they're consumed as
// plain string enums end to end.

export const OFFENCE_TYPES = [
  'Possession of unauthorized material',
  'Copying from another candidate',
  'Giving/receiving assistance',
  'Impersonation',
  'Use of electronic device',
  'Disorderly conduct',
  'Leaving with exam script',
  'Other',
];

export const IMMEDIATE_ACTIONS = [
  'Warning issued',
  'Item confiscated',
  'Script flagged',
  'Removed from venue',
  'Exam terminated',
  'Referred to Exam Officer',
];
