const express = require('express');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User=require('../models/User.js');
const router = express.Router();

router.get('/resolve', async (req, res) => {
  try {
    const { uuid, id: telegramUserId, first_name: firstName, last_name: lastName, username, language_code: languageCode } = req.body;
    if (!uuid) return res.status(400).json({ error: 'UUID parameter required' });
  // Find or create user
  let user = await User.findOne({ telegramUserId });
  if (!user) {
    user = new User({
      telegramUserId,
      firstName,
      lastName,
      username,
      languageCode,
      links: [uuid] // Initially associate this uuid if it's the user's first interaction
    });
    await user.save();
  } else if (!user.links.includes(uuid)) {
    // If the uuid is not already associated with the user, add it
    user.links.push(uuid);
    await user.save();
  }
 // Populate the user field to get the associated user
 const link = await Link.findOneAndUpdate(
  { uuid },
  {
    $inc: { clicks: 1 },
    userId: telegramUserId // Ensure link knows which user clicked it
  },
  { new: true }
);
    logger.info(link);
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    res.json({
      originalLink: link.originalLink,
      createdAt: link.createdAt,
      userChatId: link.user.chatId // Access and send the user's chatId if needed
    });
    

  } catch (error) {
    logger.error(`API Error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports= router;