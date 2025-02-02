const { v4: uuidv4 } = require('uuid');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User = require('../models/User.js');

const setupBot = (bot) => {
  // Add command list setup
  const commands = [
    { command: 'start', description: 'Start the bot' },
    { command: 'sendmessage', description: 'Broadcast message to all users (Admin only)' }
    // Add other commands here
  ];

  // Set up commands for menu button
  bot.setMyCommands(commands).then(() => {
    logger.info('Bot commands menu updated successfully');
  }).catch((error) => {
    logger.error('Error setting bot commands:', error);
  });

  // Add admin keyboard helper function
  const sendAdminKeyboard = async (chatId) => {
    const adminKeyboard = {
      reply_markup: {
        keyboard: [
          [{text: '/sendmessage'}],
          [{text: 'Secure a Link'}]  // Changed from 'Shorten a Link' to 'Secure a Link'
        ],
        resize_keyboard: true,
        persistent: true
      }
    };

    try {
      await bot.sendMessage(
        chatId, 
        'Admin Dashboard\n\nYou can:\n- Broadcast messages to users\n- Secure any link by pasting it here', 
        adminKeyboard
      );
    } catch (error) {
      logger.error('Error sending admin keyboard:', error);
    }
  };

  // Handle keyboard button clicks
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    // Only process for admin
    if (chatId.toString() !== process.env.BOT_OWNER_ID) return;

    switch (msg.text) {
      case '🔄 Start':
        // Trigger start command
        bot.emit('message', { ...msg, text: '/start' });
        break;
      case '📢 Send Message':
        // Trigger sendmessage command
        bot.emit('message', { ...msg, text: '/sendmessage' });
        break;
    }
  });

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Check if user is admin
    if (chatId.toString() === process.env.BOT_OWNER_ID) {
      await sendAdminKeyboard(chatId);
    } else {
      // Regular user start flow
      bot.sendMessage(
        chatId, 
        "Welcome! 🔒\nI can help you secure your links.\nSimply send me any link to make it secure."
      );
    }
  });

  // Handle message input for links and broadcast
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Skip processing commands
    if (text && text.startsWith('/')) return;

    // Handle "Secure a Link" button click
    if (text === 'Secure a Link') {
      bot.sendMessage(chatId, "Please send me the link you want to secure.");
      return;
    }

    // Handle broadcast state if active
    if (adminState[chatId]) {
      // If user sends any command, terminate the broadcast process
      if (msg.text && msg.text.startsWith('/')) {
        delete adminState[chatId];
        bot.sendMessage(chatId, 'Broadcast message process terminated.');
        return;
      }

      switch (adminState[chatId].step) {
        case 'waiting_message':
          adminState[chatId].messageToSend = msg.text;
          adminState[chatId].step = 'preview';
          
          const keyboard = {
            inline_keyboard: [
              [
                { text: 'Confirm', callback_data: 'send_broadcast' },
                { text: 'Back', callback_data: 'edit_broadcast' }
              ]
            ]
          };

          bot.sendMessage(
            chatId,
            `Preview of your message:\n\n${msg.text}\n\nPlease confirm to send or go back to edit.`,
            { reply_markup: keyboard }
          );
          break;
      }
    } else {
      const uuid = uuidv4();
      // Handle link securing for both admin and regular users
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        try {
          const shortLink = await Link.create({
            uuid,  // Generate unique uuid
            originalLink: text,
            clicks: 0,  // Optional as it defaults to 0 in schema
            // user field will be added if you want to track who created the link
          });
          const secureUrl = `https://t.me/${process.env.BOT_USERNAME}/${process.env.APP_NAME}?startapp=${uuid}&mode=compact`;
          await bot.sendMessage(chatId, `✅ Here's your secured link:\n${secureUrl}`);

          // If it's admin, keep the admin keyboard visible
          if (chatId.toString() === process.env.BOT_OWNER_ID) {
            await sendAdminKeyboard(chatId);
          }
        } catch (error) {
          logger.error('Error securing link:', error);
          await bot.sendMessage(chatId, 'Sorry, there was an error securing your link. Please try again.');
        }
      } else if (text && !text.startsWith('/')) {
        // Handle invalid links
        bot.sendMessage(chatId, "Please send a valid link starting with http:// or https://");
      }
    }
  });

  // Track admin state for message broadcast
  let adminState = {};

  // Handle /sendmessage command
  bot.onText(/\/sendmessage/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Check if the user is admin by comparing with BOT_OWNER_ID from environment variables
    if (chatId.toString() !== process.env.BOT_OWNER_ID) {
      bot.sendMessage(chatId, 'Sorry, this command is only available to the bot owner.'+chatId);
      return;
    }
    
    adminState[chatId] = { step: 'waiting_message' };
    bot.sendMessage(chatId, 'Please send the message you want to broadcast to all users.');
  });

  // Handle broadcast actions
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const action = callbackQuery.data;

    if (!adminState[chatId]) return;

    switch (action) {
      case 'send_broadcast':
        await bot.sendMessage(chatId, 'Starting broadcast...');
        
        try {
          // Get all users from database
          const users = await User.find({ telegramUserId: { $exists: true } });
          let successCount = 0;
          let failCount = 0;

          // Process one message at a time with delay
          const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

          for (let i = 0; i < users.length; i++) {
            try {
              await bot.sendMessage(
                users[i].telegramUserId, 
                adminState[chatId].messageToSend,
                {
                  disable_web_page_preview: true,
                  disable_notification: true
                }
              );
              successCount++;

              // Add delay after each message
              await delay(100); // 100ms delay between each message

              // Send progress update every 50 messages
              if ((i + 1) % 50 === 0 || i + 1 === users.length) {
                await bot.sendMessage(
                  chatId,
                  `Progress: ${i + 1}/${users.length}\nSuccessful: ${successCount}\nFailed: ${failCount}`
                );
                // Add a longer delay after progress update
                await delay(1000);
              }

              // Add a longer delay every 30 messages to prevent rate limiting
              if ((i + 1) % 30 === 0) {
                await delay(2000);
              }

            } catch (error) {
              logger.error(`Failed to send message to user ${users[i].telegramUserId}: ${error.message}`);
              failCount++;
              // Add extra delay after error
              await delay(1000);
            }
          }

          await bot.sendMessage(
            chatId,
            `Broadcast completed!\nTotal messages sent: ${users.length}\nSuccessful: ${successCount}\nFailed: ${failCount}`
          );
          
          // Show admin keyboard again after broadcast
          await sendAdminKeyboard(chatId);
        } catch (error) {
          logger.error('Broadcast error:', error);
          await bot.sendMessage(chatId, 'Error occurred while broadcasting messages. Please check logs.');
          // Show admin keyboard even after error
          await sendAdminKeyboard(chatId);
        }
        
        delete adminState[chatId];
        break;

      case 'edit_broadcast':
        adminState[chatId].step = 'waiting_message';
        bot.sendMessage(chatId, 'Please send the new message.');
        break;
    }
  });

  // Add error handler for polling errors
  bot.on("polling_error", (error) => {
    logger.error('Polling error:', error);
    // Restart polling after a delay if needed
    setTimeout(() => {
      bot.stopPolling()
        .then(() => bot.startPolling())
        .catch(err => logger.error('Error restarting polling:', err));
    }, 5000);
  });

  // Set up command menu with proper error handling
  const setupCommands = async () => {
    try {
      // Basic commands for regular users
      const basicCommands = [
        { command: 'start', description: 'Start securing your links' }
      ];

      // Try setting basic commands
      await bot.setMyCommands(basicCommands)
        .catch(error => {
          logger.error('Error setting basic commands:', error);
        });

      // Set admin-specific commands
      if (process.env.BOT_OWNER_ID) {
        const adminCommands = [
          { command: 'start', description: 'Start the bot' },
          { command: 'sendmessage', description: 'Broadcast message to all users' }
        ];

        await new Promise(resolve => setTimeout(resolve, 1000));

        await bot.setMyCommands(adminCommands, {
          scope: {
            type: 'chat',
            chat_id: process.env.BOT_OWNER_ID
          }
        }).catch(error => {
          logger.error('Error setting admin commands:', error);
        });
      }
    } catch (error) {
      logger.error('Error in setupCommands:', error);
    }
  };

  // Call setupCommands with delay after bot starts
  setTimeout(() => {
    setupCommands();
  }, 2000);
}

module.exports={setupBot};