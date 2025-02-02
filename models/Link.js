const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  uuid: {
    type: String,
    required: true,
    unique: true
  },
  originalLink: {
    type: String,
    required: true
  },
  clicks: {
    type: Number,
    default: 0
  },
  // Store the user reference as an ObjectId.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

const Link = mongoose.model('Link', linkSchema);

module.exports = Link;
