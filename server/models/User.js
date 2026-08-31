const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../config/roles');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    status: {
      type: String,
      enum: ['pending_approval', 'active', 'disabled'],
      default: 'pending_approval',
    },
    // Populated only for role === 'student'. Kept optional/sparse so it
    // doesn't collide across invigilators/officers who have none.
    matricNumber: { type: String, trim: true, index: true, sparse: true },
    // Populated only for role === 'exam_officer'. When set, that officer's
    // stage queue is filtered to reports from this department only — an
    // officer with no department set still sees everything (unscoped),
    // so existing accounts aren't silently locked out by this field
    // showing up.
    department: { type: String, trim: true },
    // Populated only for role === 'college_officer'. Mirrors `department`
    // above: when set, that officer's queue is filtered to cases assigned
    // to this college only (see Report.assignedCollege + services/
    // collegeResolver.js). Left unset, a College Officer sees every case
    // at the College Review stage regardless of which college it's from —
    // same unscoped-by-default fallback as Exam Officer/department.
    college: { type: String, trim: true },
  },
  { timestamps: true } // gives createdAt/updatedAt per spec
);

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

// Never leak the hash in API responses.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
