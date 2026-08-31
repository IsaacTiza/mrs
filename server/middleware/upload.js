const multer = require('multer');

// Memory storage (not disk, not direct-to-Cloudinary streaming) — this is
// deliberate: we need the raw buffer BEFORE upload to compute photoHash
// (SHA-256, spec §6 Exhibit entity) for evidence integrity verification.
// If we streamed straight to Cloudinary we'd have to re-download the file
// to hash it, which is slower and adds a second point of failure.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — evidence photos, not videos
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

module.exports = upload;
