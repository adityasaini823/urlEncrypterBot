const { v4: uuidv4 } = require('uuid');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User = require('../models/User.js');

const setupBot = (bot) => {
  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const startParam = msg.text.split(' ')[1]; // Get startapp parameter

    if (startParam) {
      try {
        const link = await Link.findOne({ uuid: startParam }).populate('user');
        if (!link) {
          return bot.sendMessage(chatId, '❌ Invalid or expired link');
        }

        // Send message with direct mini-app launcher
        bot.sendMessage(chatId, '🔒 Secure Content Unlocked', {
          reply_markup: {
            inline_keyboard: [[{
              text: 'Launch Secure Content',
              web_app: { 
                url: `${process.env.MINI_APP_URL}?startapp=${startParam}`
              }
            }]]
          }
        });
        
      } catch (error) {
        logger.error(`Start param handling error: ${error.message}`);
        bot.sendMessage(chatId, '❌ Error processing your request');
      }
    } else {
      const welcomeMsg = `Welcome! Use /securelink followed by a Telegram URL to create a secure link.\nExample:\n/securelink https://t.me/your_channel`;
      bot.sendMessage(chatId, welcomeMsg);
    }
  });

  // Handle /securelink command
  bot.onText(/\/securelink (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const rawLink = match[1].trim();
    const uuid = uuidv4();

    // Validate URL format
    if (!isValidTelegramLink(rawLink)) {
      return bot.sendMessage(chatId, 
        '❌ Invalid link format. Must be a valid Telegram URL (channel, group, or user).\n' +
        'Examples:\n' +
        '• https://t.me/channel\n' +
        '• https://t.me/username\n' +
        '• https://t.me/c/1234567890/123'
      );
    }

    try {
      // User management
      let user = await User.findOne({ chatId });
      if (!user) {
        user = new User({ chatId });
        await user.save();
      }

      // Create secure link
      const newLink = new Link({
        uuid,
        originalLink: rawLink,
        user: user._id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days expiration
      });

      await newLink.save();
      user.links.push(newLink._id);
      await user.save();

      // Generate masked URL
      const maskedLink = `https://t.me/${process.env.BOT_USERNAME}?startapp=${uuid}`;
      
      // Send response with interactive buttons
      bot.sendMessage(chatId, `🔐 *Secure Link Created* 🔐\n\n` +
        `Here's your protected link:\n` +
        `\`${maskedLink}\`\n\n` +
        `Share this link securely:`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '📱 Test Link Now',
              web_app: { url: `${process.env.MINI_APP_URL}?startapp=${uuid}` }
            }],
            [{
              text: '📋 Copy Link',
              callback_data: 'copy_link'
            }]
          ]
        }
      });

      logger.info(`New secure link created: ${uuid} for ${chatId}`);
      
    } catch (error) {
      logger.error(`Link creation error: ${error.message}`);
      bot.sendMessage(chatId, '❌ Server error creating secure link');
    }
  });

  // Handle copy link button
  bot.on('callback_query', async (query) => {
    if (query.data === 'copy_link') {
      try {
        await bot.answerCallbackQuery(query.id, {
          text: 'Link copied to clipboard!',
          show_alert: false
        });
      } catch (error) {
        logger.error(`Copy link error: ${error.message}`);
      }
    }
  });

  // Telegram URL validation helper
  function isValidTelegramLink(url) {
    const patterns = [
      /^https:\/\/t\.me\/[a-zA-Z0-9_]{5,32}$/, // Usernames
      /^https:\/\/t\.me\/c\/\d+\/\d+$/, // Channel posts
      /^https:\/\/t\.me\/\w+\/\d+$/ // Public posts
    ];
    return patterns.some(pattern => pattern.test(url));
  }
};

module.exports = { setupBot };