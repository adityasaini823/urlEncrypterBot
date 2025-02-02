const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramUserId: {
    type: Number,
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String
  },
  username: {
    type: String
  },
  // Array of references to Link documents.
  links: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Link'
  }]
});

const User = mongoose.model('User', userSchema);

module.exports = User;
