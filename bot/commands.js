const { v4: uuidv4 } = require('uuid');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User=require('../models/User.js');

 const setupBot = (bot)=> {
  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const deepLink = msg.text.split(' ')[1];

    if (deepLink) {
      try {
        const link = await Link.findOne({ uuid: deepLink }).populate('user');
        if (link) {
          bot.sendMessage(chatId, 'Opening secure link...', {
            reply_markup: {
              inline_keyboard: [[{
                text: 'Launch',
                web_app: { url: `${process.env.MINI_APP_URL}?uuid=${deepLink}` }
              }]]
            }
          });
          logger.info(`Deep link accessed: ${deepLink}`);
        }else{
          return bot.sendMessage(chatId, '❌ Link not found or invalid.');
        }
      } catch (error) {
        logger.error(`Deep link error: ${error.message}`);
      }
    } else {
      const welcomeMsg = `Welcome! Use /securelink followed by your Telegram URL to create a secure link.\nExample:\n/securelink https://t.me/your_channel`;
      bot.sendMessage(chatId, welcomeMsg);
    }
  });

  // Handle /securelink command
  bot.onText(/\/securelink (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const rawLink = match[1].trim();
    const uuid = uuidv4();

    if (!rawLink.startsWith('https://t.me/')) {
      return bot.sendMessage(chatId, '❌ Invalid Telegram link format. Must start with https://t.me/');
    }

    try {
      let user = await User.findOne({ chatId });
      if (!user) {
        user = new User({ chatId });
        await user.save();
      }
      const newLink = new Link({
        uuid,
        message: msg.text,
        originalLink: rawLink,
        user: user._id,
      });
      await newLink.save();

      // Add the new link to the user's links array
      user.links.push(newLink._id);
      await user.save();
      
      const maskedLink = `https://t.me/${process.env.BOT_USERNAME}?start=${uuid}`;
      
      bot.sendMessage(chatId, `🔒 Secure link created:\n${maskedLink}`);
      logger.info(`New link created for chat ${chatId}: ${maskedLink}`);

    } catch (error) {
      logger.error(`Link creation error: ${error.message}`);
      bot.sendMessage(chatId, '❌ Error creating secure link. Please try again.');
    }
  });
}
module.exports={setupBot};