const express = require('express');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User=require('../models/User.js');
const cors=require("cors");
const router = express.Router();

router.get('/resolve', async (req, res) => {
  try {
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ error: 'UUID parameter required' });

    const link = await Link.findOneAndUpdate(
      { uuid },
      { $inc: { clicks: 1 } },
      { new: true }
    ).populate('user');  // Populate the user field to get the associated user
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