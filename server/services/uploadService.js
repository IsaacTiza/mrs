const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Uploads an in-memory file buffer (from multer memoryStorage) to
 * Cloudinary and returns both the resulting URL and the SHA-256 hash of
 * the ORIGINAL bytes received — hashing before upload, not after, so the
 * hash proves what the invigilator's device actually sent, independent of
 * anything Cloudinary does to the asset afterward.
 */
function uploadBuffer(buffer, folder) {
  const hash = sha256(buffer);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, hash });
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer, sha256 };
