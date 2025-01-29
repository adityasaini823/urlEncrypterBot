const mongoose = require('mongoose');
const linkSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  message: { type: String, required: true },
  originalLink: { type: String, required: true },
  clicks: { type: Number, default: 0 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to the User
}, { timestamps: true });


const Link = mongoose.model('Link', linkSchema);

module.exports=Link;