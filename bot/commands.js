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
  
    if (validated(text)) {
        const url = text;
        const username = text.split('https://t.me/')[1];
        const checkResult = await checkTelegramUsername(username);
        if (!checkResult.exists) {
           bot.sendMessage(msg.chat.id, "❌ This username may not exist on Telegram");
        }
        let user = await User.findOne({ chatId });
        if (!user) {
            user = new User({
                chatId: chatId,
                links: [],
            });
            await user.save();
            console.log("User created:", user);
        }
        const newLink = new Link({
            uuid: uuid,
            message: text, 
            originalLink: url,
            user: user._id, 
        });
  
        await newLink.save();
  
        user.links.push(newLink._id);
        await user.save(); 
  
        const link = `https://t.me/Test_Encryptions_bot/hacked?startapp=${uuid}&mode=compact`;
  
        bot.sendMessage(chatId, `Here is your link: ${link}`);
    } else {
        // If the URL is invalid
        bot.sendMessage(chatId, "Invalid link.");
    }
  });
  
  function validated(text) {
    const regex = /^https?:\/\/t\.me\/[a-zA-Z0-9_]{5,32}$/;
    return regex.test(text);
  }
}
module.exports={setupBot};