const mongoose = require('mongoose');

const witnessSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true, index: true },
  fullName: { type: String, required: true },
  designation: { type: String, required: true },
  staffOrRegNo: { type: String, required: true },
});

module.exports = mongoose.model('Witness', witnessSchema);
