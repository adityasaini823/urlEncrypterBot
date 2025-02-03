const express = require('express');
const router = express.Router();
const Link = require('../models/Link');
const User = require('../models/User');
const logger = require('../utils/logger');

router.post('/resolve', async (req, res) => {
  try {
    // Destructure and rename fields as needed.
    const { 
      uuid, 
      id: telegramUserId, 
      first_name: firstName, 
      last_name: lastName, 
      username 
    } = req.body;

    if (!uuid) {
      return res.status(400).json({ error: 'UUID parameter required' });
    }

    // Find the user by telegramUserId or create a new one.
    let user = await User.findOne({ telegramUserId });
    if (!user) {
      user = new User({
        telegramUserId,
        firstName,
        lastName,
        username,
        links: []
      });
      await user.save();
      logger.info(`Created new user: ${user._id}`);
    }

    // Find the link by uuid and update: increment clicks and set the user reference.
    // Use { new: true } to return the updated document.
    const link = await Link.findOneAndUpdate(
      { uuid },
      { 
        $inc: { clicks: 1 },
        user: user._id  // Associates the link with the user
      },
      { new: true }
    ).populate('user');  // Populate the user field if you need to access user info later

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    // Optionally: add this link to the user's links array if not already present.
    if (!user.links.some(linkId => linkId.equals(link._id))) {
      user.links.push(link._id);
      await user.save();
    }

    // logger.info(`Link updated: ${link.uuid} clicked ${link.clicks} times`);
    logger.info(`Link clicked By : ${firstName} ${lastName } Having Id ${telegramUserId} `);

    res.json({
      originalLink: link.originalLink,
      createdAt: link.createdAt,
      user: link.user  // This returns the populated user document
    });
  } catch (error) {
    logger.error(`API Error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
