/* eslint-disable no-unused-vars */

// Known Mongoose/driver error shapes that represent expected, user-fixable
// problems — not application bugs. Without this translation every one of
// these gets masked as a generic 500 by the isOperational check below,
// even though the real cause (duplicate email, missing required field,
// bad ObjectId) is exactly the kind of thing the user needs to see and fix.
function normalizeError(err) {
  if (err.name === 'ValidationError') {
    // Mongoose schema validation failure (required field, custom
    // pre('validate') hook, etc.) — collect all field messages, not just one.
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
    return { statusCode: 400, message, isOperational: true };
  }
  if (err.name === 'CastError') {
    // Malformed ObjectId, bad date, etc.
    return { statusCode: 400, message: `Invalid value for ${err.path}`, isOperational: true };
  }
  if (err.code === 11000) {
    // Duplicate key on a unique index (e.g. User.email).
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return { statusCode: 409, message: `A record with this ${field} already exists`, isOperational: true };
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { statusCode: 401, message: 'Invalid or expired session — please log in again', isOperational: true };
  }
  return { statusCode: err.statusCode || 500, message: err.message, isOperational: err.isOperational || false };
}

function errorHandler(err, req, res, next) {
  const { statusCode, message, isOperational } = normalizeError(err);

  if (!isOperational) {
    // Genuinely unexpected bug — log full detail server-side, don't leak internals to client.
    console.error('UNEXPECTED ERROR:', err);
  }

  res.status(statusCode).json({
    success: false,
    message: isOperational ? message : 'Internal server error',
  });
}

module.exports = errorHandler;
