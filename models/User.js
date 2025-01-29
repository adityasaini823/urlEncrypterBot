const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  links: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Link' }] // Reference to links
});

const User = mongoose.model('User', userSchema);

module.exports = User;
