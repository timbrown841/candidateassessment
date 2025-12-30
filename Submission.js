const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  name: String,
  email: String,
  responses: Array,
  submittedAt: Date
});

module.exports = mongoose.model('Submission', submissionSchema);
