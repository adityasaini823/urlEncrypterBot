// const { v4: uuidv4 } = require('uuid');
const shortid = require('shortid');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User = require('../models/User.js');

// Function to create and return a secured link (moved outside message handler)
const secureLink = async (originalLink) => {
  const uuid = shortid.generate();
  const securedLink = await Link.create({
    uuid,
    originalLink,
  });

  // Generate the secure URL based on your bot settings
  const secureUrl = `https://t.me/${process.env.BOT_USERNAME}/${process.env.APP_NAME}?startapp=${uuid}`;
  return secureUrl;
};

const setupBot = (bot) => {
  // Add command list setup
  const commands = [
    { command: 'start', description: 'Start the bot' },
    { command: 'sendmessage', description: 'Broadcast message to all users (Admin only)' }
  ];

  // Set up commands for menu button
  bot.setMyCommands(commands).then(() => {
    logger.info('Bot commands menu updated successfully');
  }).catch((error) => {
    logger.error('Error setting bot commands:', error);
  });

  // Admin keyboard function
  const sendAdminKeyboard = async (chatId) => {
    const adminInlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Send Message', callback_data: 'send_message' }],
          [{ text: '🔒 Secure a Link', callback_data: 'secure_link' }]
        ]
      }
    };

    try {
      await bot.sendMessage(
        chatId, 
        'Admin Dashboard\n\nYou can:\n- Broadcast messages to users\n- Secure any link by pasting it here', 
        adminInlineKeyboard
      );
    } catch (error) {
      logger.error('Error sending admin keyboard:', error);
    }
  };

  // Track admin state
  let adminState = {};

  // Message handler
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text && text.startsWith('/')) return;

    if (adminState[chatId]) {
      if (adminState[chatId].step === 'waiting_message') {
        adminState[chatId].messageToSend = text;
        adminState[chatId].step = 'preview';
        
        await bot.sendMessage(
          chatId,
          `Preview of your message:\n\n${text}\n\nPlease confirm to send or go back to edit.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Confirm', callback_data: 'send_broadcast' },
                  { text: 'Back', callback_data: 'edit_broadcast' }
                ]
              ]
            }
          }
        );
      } else if (adminState[chatId].step === 'waiting_link') {
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          try {
            const securedLink = await secureLink(text);
            await bot.sendMessage(chatId, `Here's your secured link:\n${securedLink}`);
            delete adminState[chatId];
          } catch (error) {
            await bot.sendMessage(chatId, "Error securing link. Please try again.");
            logger.error('Error securing link:', error);
          }
        } else {
          await bot.sendMessage(chatId, "Please send a valid link starting with http:// or https://");
        }
      }
    } else {
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        try {
          const uuid = shortid.generate();
          const secureUrl = `https://t.me/${process.env.BOT_USERNAME}/${process.env.APP_NAME}?startapp=${uuid}`;
          await bot.sendMessage(chatId, `✅ Secured link:\n${secureUrl}`);
          
          await Link.create({
            uuid,
            originalLink: text
          });

          if (chatId.toString() === process.env.BOT_OWNER_ID) {
            await sendAdminKeyboard(chatId);
          }
        } catch (error) {
          logger.error('Error securing link:', error);
          await bot.sendMessage(chatId, 'Error securing link. Please try again.');
        }
      } else if (text) {
        await bot.sendMessage(chatId, "Please send a valid URL starting with http:// or https://");
      }
    }
  });

  // Start command handler
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name;
    
    if (chatId.toString() === process.env.BOT_OWNER_ID) {
      await sendAdminKeyboard(chatId);
    } else {
      await bot.sendMessage(
        chatId, 
        `Welcome ${name}! 🔒\nSend me any link to secure it.`
      );
    }
  });

  // Callback query handler
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;
    
    await bot.answerCallbackQuery(callbackQuery.id);

    switch (action) {
      case 'send_message':
        if (chatId.toString() === process.env.BOT_OWNER_ID) {
          adminState[chatId] = { step: 'waiting_message' };
          await bot.sendMessage(chatId, 'Enter broadcast message:');
        } else {
          await bot.sendMessage(chatId, '❌ Admin only command');
        }
        break;

      case 'secure_link':
        if (chatId.toString() === process.env.BOT_OWNER_ID) {
          adminState[chatId] = { step: 'waiting_link' };
          await bot.sendMessage(chatId, "Send link to secure:");
        } else {
          await bot.sendMessage(chatId, '❌ Admin only command');
        }
        break;

      case 'send_broadcast':
        await handleBroadcast(bot, chatId, adminState);
        break;

      case 'edit_broadcast':
        adminState[chatId].step = 'waiting_message';
        await bot.sendMessage(chatId, 'Send revised message:');
        break;
    }
  });

  // Polling error handler
  bot.on("polling_error", (error) => {
    logger.error('Polling error:', error);
    setTimeout(() => {
      bot.stopPolling()
        .then(() => bot.startPolling())
        .catch(err => logger.error('Error restarting polling:', err));
    }, 5000);
  });

  // Command setup
  const setupCommands = async () => {
    try {
      await bot.setMyCommands([
        { command: 'start', description: 'Start securing links' }
      ]);

      if (process.env.BOT_OWNER_ID) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await bot.setMyCommands(
          [
            { command: 'start', description: 'Admin panel' },
            { command: 'sendmessage', description: 'Broadcast messages' }
          ],
          { scope: { type: 'chat', chat_id: process.env.BOT_OWNER_ID } }
        );
      }
    } catch (error) {
      logger.error('Command setup error:', error);
    }
  };

  setTimeout(setupCommands, 2000);
};

// Broadcast handler function
async function handleBroadcast(bot, chatId, adminState) {
  try {
    await bot.sendMessage(chatId, 'Starting broadcast...');
    const users = await User.find({ telegramUserId: { $exists: true } });
    
    let successCount = 0;
    let blockedCount = 0;
    let deletedCount = 0;
    let invalidIdCount = 0;
    let otherErrors = 0;
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < users.length; i++) {
      try {
        await bot.sendMessage(
          users[i].telegramUserId,
          adminState[chatId].messageToSend,
          { disable_web_page_preview: true, disable_notification: true }
        );
        successCount++;

        // Progress updates
        if ((i + 1) % 50 === 0) {
          await bot.sendMessage(
            chatId,
            `Progress: ${i + 1}/${users.length}\n` +
            `✅ Success: ${successCount}\n` +
            `🚫 Blocked: ${blockedCount}\n` +
            `❌ Deleted: ${deletedCount}`
          );
          await delay(1000);
        }
        await delay(i % 30 === 0 ? 2000 : 100);

      } catch (error) {
        if (error.response?.statusCode === 403) {
          blockedCount++;
        } else if (error.response?.statusCode === 400) {
          error.response.body?.description?.includes('user not found') 
            ? deletedCount++ 
            : invalidIdCount++;
        } else {
          otherErrors++;
        }
        await delay(1000);
      }
    }

    await bot.sendMessage(
      chatId,
      `📊 Broadcast Complete!\n` +
      `✅ Success: ${successCount}\n` +
      `🚫 Blocked: ${blockedCount}\n` +
      `❌ Deleted: ${deletedCount}\n` +
      `📛 Invalid IDs: ${invalidIdCount}\n` +
      `⚠️ Other errors: ${otherErrors}\n` +
      `Total users: ${users.length}`
    );

    await sendAdminKeyboard(chatId);
    delete adminState[chatId];

  } catch (error) {
    logger.error('Broadcast error:', error);
    await bot.sendMessage(chatId, 'Critical broadcast error! Check logs.');
    delete adminState[chatId];
  }
}

module.exports = { setupBot };