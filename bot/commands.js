const { v4: uuidv4 } = require('uuid');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User=require('../models/User.js');

 const setupBot = (bot)=> {
  // Handle /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello Sir, please send link here to secure it .\n Link pattern " https://t.me/exampleUsername "');
  });

  // Handle /securelink command
  bot.onText(/^(https?:\/\/[^\s]+)/, async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text; 
    const uuid = uuidv4(); 
    const link = `https://t.me/${process.env.BOT_USERNAME}/${process.env.APP_NAME}?startapp=${uuid}&mode=compact`;
    if (validated(text)) {
        const url = text;
        
        const newLink = new Link({
            uuid: uuid,
            originalLink: url,
            clicks:0,
        });
        await newLink.save();
        bot.sendMessage(chatId, `Here is your link: ${link}`);
    } else {
        bot.sendMessage(chatId, "Invalid link.");
    }
  });
  
  function validated(text) {
    const regex = /^https?:\/\/t\.me\/[a-zA-Z0-9_+-]{5,32}$/;
     return regex.test(text);
  }
}
module.exports={setupBot};