const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramUserId: { type: Number, required: true, unique: true },
  firstName:      { type: String, required: true },
  lastName:       { type: String },
  username:       { type: String },
  // Array of references to Link documents using their uuid.
  links: [{
    type: String,    // This will store the uuid from the Link collection
    ref: 'Link'
  }]
});

const User = mongoose.model('User', userSchema);

module.exports = User;
