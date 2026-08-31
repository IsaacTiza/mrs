const mongoose = require('mongoose');

const exhibitSchema = new mongoose.Schema(
  {
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
    description: { type: String, required: true },
    tagNumber: { type: String, required: true },
    photoUrl: { type: String, required: true },
    photoHash: { type: String, required: true }, // SHA-256, computed server-side on upload
    custodyLocation: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Spec §4 + §10: no update/delete endpoint exists for this collection at
// all — not "hidden in UI", genuinely absent from the router. As a second
// line of defense, block writes to immutable fields at the schema layer.
exhibitSchema.pre('findOneAndUpdate', function blockMutation(next) {
  next(new Error('Exhibit records are immutable — no update path exists.'));
});

module.exports = mongoose.model('Exhibit', exhibitSchema);
