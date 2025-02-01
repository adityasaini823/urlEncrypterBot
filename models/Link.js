const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  uuid:         { type: String, required: true, unique: true },
  originalLink: { type: String, required: true },
  clicks:       { type: Number, default: 0 },
  // The userId field stores the Telegram user's id who created the link.
  // This is a foreign key referencing the User model's telegramUserId.
  userId: {
    type: Number,
    ref: 'User',
  }
}, { timestamps: true });

const Link = mongoose.model('Link', linkSchema);

module.exports = Link;
