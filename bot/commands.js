// Import required packages
const shortid = require('shortid');
const Link = require('../models/Link.js');
const logger = require('../utils/logger.js');
const User = require('../models/User.js');

const setupBot = (bot) => {
  const adminChatId = process.env.BOT_OWNER_ID;

  /*** Command Setup ***/
  const setAdminCommands = async () => {
    try {
      await bot.setMyCommands(
        [
          { command: 'start', description: 'Start bot' },
          { command: 'send_message', description: 'Broadcast (admin)' },
          { command: 'database_management', description: 'DB tools (admin)' }
        ],
        { scope: { type: 'chat', chat_id: Number(adminChatId) } }
      );
      logger.info('Admin commands set successfully');
    } catch (error) {
      logger.error('Failed to set admin commands:', error);
    }
  };

  const setDefaultCommands = async () => {
    try {
      await bot.setMyCommands(
        [{ command: 'start', description: 'Start bot' }],
        { scope: { type: 'default' } }
      );
      logger.info('Default commands set successfully');
    } catch (error) {
      logger.error('Failed to set default commands:', error);
    }
  };

  // Initialize commands
  setAdminCommands();
  setDefaultCommands();

  /*** Admin State ***/
  // This object tracks the current admin action by chatId.
  const adminStates = {};

  /*** Utility Functions ***/
  const isAdmin = (chatId) => chatId.toString() === adminChatId;

  // Delay helper to prevent hitting rate limits
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  /*** UI Helper Functions ***/
  const showAdminMenu = async (chatId) => {
    const menuButtons = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Send Message to All Users', callback_data: 'send_message' }],
          [{ text: '🔒 Create Secure Link', callback_data: 'secure_link' }],
          [{ text: '📊 Database Management', callback_data: 'db_management' }]
        ]
      }
    };

    try {
      await bot.sendMessage(
        chatId,
        '👋 Welcome to Admin Dashboard!\n\nWhat would you like to do?\n- Send a message to all users\n- Create a secure link',
        menuButtons
      );
    } catch (error) {
      logger.error('Failed to show admin menu:', error);
      await bot.sendMessage(chatId, '❌ Sorry, there was an error showing the admin menu. Please try again.');
    }
  };

  const showDatabaseMenu = async (chatId) => {
    const dbMenuButtons = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚫 View Blocked Users', callback_data: 'view_blocked' }],
          [{ text: '💤 View Inactive Users', callback_data: 'view_inactive' }],
          [{ text: '🗑️ Clean Database', callback_data: 'clean_db' }],
          [{ text: '⬅️ Back to Main Menu', callback_data: 'main_menu' }]
        ]
      }
    };

    try {
      await bot.sendMessage(chatId, '📊 Database Management\n\nSelect an action:', dbMenuButtons);
    } catch (error) {
      logger.error('Failed to show database menu:', error);
    }
  };

  /*** Core Functions ***/
  // Check a user's bot status
  const checkBotStatus = async (userId) => {
    try {
      await bot.sendChatAction(userId, 'typing');
      return 'active';
    } catch (error) {
      if (error.response) {
        if (error.response.statusCode === 403) return 'blocked';
        if (error.response.statusCode === 404) return 'deleted';
      }
      return 'error';
    }
  };

  // Create a secure link from an original link
  const createSecureLink = async (originalLink) => {
    try {
      const uniqueId = shortid.generate();
      await Link.create({ uuid: uniqueId, originalLink });
      return `https://t.me/${process.env.BOT_USERNAME}/${process.env.APP_NAME}?startapp=${uniqueId}`;
    } catch (error) {
      logger.error('Error creating secure link:', error);
      throw error;
    }
  };
// Message deletion delay in milliseconds (e.g., 60000 ms = 60 seconds)
// Function to schedule message deletion
function messageDeletion(userId, messageId) {
  const deletionDelay = 60 * 60 * 1000; // 1 hour in milliseconds
  setTimeout(async () => {
    try {
      await bot.deleteMessage(userId, messageId);
      console.log(`Deleted message ${messageId} for user ${userId}`);
    } catch (delError) {
      logger.error(
        `Failed to delete message ${messageId} for user ${userId}:`,
        delError.message
      );
    }
  }, deletionDelay);
}

/*** Broadcast Functionality ***/
const handleBroadcast = async (chatId) => {
  if (!adminStates[chatId] || !adminStates[chatId].messageText) {
    await bot.sendMessage(chatId, '❌ Sorry, no message found to broadcast.');
    return;
  }
  await bot.sendMessage(chatId, '📣 Starting broadcast...');
  try {
    const users = await User.find({ telegramUserId: { $exists: true } });
    const stats = {
      total: users.length,
      sent: 0,
      failed: 0,
      blocked: 0,
      deleted: 0,
      notFound: 0
    };

    for (let i = 0; i < users.length; i++) {
      try {
        // Send the broadcast message and capture the sent message's details
        const sentMessage = await bot.sendMessage(
          users[i].telegramUserId,
          adminStates[chatId].messageText,
          { disable_web_page_preview: true }
        );
        stats.sent++;

        // Schedule deletion of the sent message after the specified delay
        messageDeletion(users[i].telegramUserId, sentMessage.message_id);

        // Delay to avoid rate limits
        if ((i + 1) % 30 === 0) {
          await delay(2000);
        } else {
          await delay(100);
        }

        // Show progress every 50 messages
        if ((i + 1) % 50 === 0) {
          await bot.sendMessage(
            chatId,
            `📊 Progress: ${i + 1}/${stats.total}\n✅ Sent: ${stats.sent}\n❌ Failed: ${stats.failed}`
          );
        }
      } catch (error) {
        if (error.response) {
          if (error.response.statusCode === 403) stats.blocked++;
          else if (error.response.statusCode === 404) stats.deleted++;
          else if (error.response.statusCode === 400) stats.notFound++;
        }
        stats.failed++;
        logger.error(`Failed to send to user ${users[i].telegramUserId}:`, error.message);
      }
    }

    // Final broadcast result
    await bot.sendMessage(
      chatId,
      `📊 Broadcast Results:\n\n` +
        `📧 Total Users: ${stats.total}\n` +
        `✅ Successfully Sent: ${stats.sent}\n` +
        `❌ Failed: ${stats.failed}\n` +
        `🚫 Bot Blocked: ${stats.blocked}\n` +
        `🗑️ Deleted Accounts: ${stats.deleted}\n` +
        `❓ Not Found: ${stats.notFound}`
    );
  } catch (error) {
    logger.error('Broadcast error:', error);
    await bot.sendMessage(chatId, '❌ Error occurred while broadcasting. Please check logs.');
  }
  delete adminStates[chatId];
  await showAdminMenu(chatId);
};


  /*** Database Cleanup Handlers ***/
  const handleViewBlocked = async (chatId) => {
    try {
      await bot.sendMessage(chatId, '🔍 Checking blocked users...');
      const users = await User.find({});
      let blockedCount = 0;

      for (const user of users) {
        const status = await checkBotStatus(user.telegramUserId);
        if (status === 'blocked') {
          blockedCount++;
        }
      }

      await bot.sendMessage(
        chatId,
        `📊 Block Status:\n\n` +
          `Total Users: ${users.length}\n` +
          `Blocked Bot: ${blockedCount}\n` +
          `Active Users: ${users.length - blockedCount}`
      );
    } catch (error) {
      logger.error('Error checking blocked users:', error);
      await bot.sendMessage(chatId, '❌ Error checking blocked users');
    }
  };

  const handleViewInactive = async (chatId) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const inactiveUsers = await User.find({
        lastInteraction: { $lt: thirtyDaysAgo }
      });

      if (inactiveUsers.length > 0) {
        let message = '💤 Users inactive for 30+ days:\n\n';
        inactiveUsers.forEach(user => {
          message += `ID: ${user.telegramUserId}\n`;
          message += `Name: ${user.firstName || 'N/A'} ${user.lastName || ''}\n`;
          message += `Last Active: ${new Date(user.lastInteraction).toLocaleDateString()}\n\n`;
        });
        await bot.sendMessage(chatId, message);
      } else {
        await bot.sendMessage(chatId, '✅ No inactive users found!');
      }
    } catch (error) {
      logger.error('Error checking inactive users:', error);
      await bot.sendMessage(chatId, '❌ Error checking inactive users');
    }
  };

  const clearDeletedUsers=async(chatId) => {
    try {
      // const users = await User.find({});
      // for (const user of users) {
      //   const status = await checkBotStatus(user.telegramUserId);
      //   if (status === 'blocked') {
      //     blockedCount++;
      //   }
      // }
      bot.sendMessage(chatId,"working on it");
    }catch{
      logger.error('Error clearing deleted users:', error);
    }
  }
  const showCleanupOptions = async (chatId) => {
    const cleanupOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🗑️ Remove Deleted Accounts', callback_data: 'remove_deleted' },
          ],
          [{ text: '⬅️ Back', callback_data: 'db_management' }]
        ]
      }
    };

    await bot.sendMessage(
      chatId,
      '⚠️ Database Cleanup Options\n\nChoose what to clean:',
      cleanupOptions
    );
  };


  /*** Bot Event Handlers ***/
  // Handle incoming messages
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;

    // Ignore commands and empty messages
    if (!messageText || messageText.startsWith('/')) return;

    // If the admin is in the middle of an action
    if (adminStates[chatId]) {
      const currentState = adminStates[chatId];

      switch (currentState.action) {
        case 'typing_broadcast':
          // Save message and show preview for broadcast
          adminStates[chatId] = { action: 'previewing_broadcast', messageText };
          await bot.sendMessage(
            chatId,
            `📝 Here's how your message will look:\n\n${messageText}\n\nWould you like to send it?`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Send', callback_data: 'send_broadcast' },
                    { text: '✏️ Edit', callback_data: 'edit_broadcast' }
                  ]
                ]
              }
            }
          );
          break;
        case 'creating_secure_link':
          if (messageText.startsWith('http://') || messageText.startsWith('https://')) {
            try {
              const secureLink = await createSecureLink(messageText);
              await bot.sendMessage(chatId, '✅ Here\'s your secure link:\n' + secureLink);
              delete adminStates[chatId];
              await showAdminMenu(chatId);
            } catch (error) {
              await bot.sendMessage(chatId, '❌ Sorry, couldn\'t create secure link. Please try again.');
            }
          } else {
            await bot.sendMessage(chatId, '⚠️ Please send a valid link starting with http:// or https://');
          }
          break;
        default:
          break;
      }
    }
    // Regular user sending a link
    else if (messageText.startsWith('http://') || messageText.startsWith('https://')) {
      try {
        const secureLink = await createSecureLink(messageText);
        await bot.sendMessage(chatId, '✅ Here\'s your secure link:\n' + secureLink);
        // If the sender is admin, display the admin menu again
        if (isAdmin(chatId)) await showAdminMenu(chatId);
      } catch (error) {
        await bot.sendMessage(chatId, '❌ Sorry, couldn\'t create secure link. Please try again.');
      }
    } else {
      await bot.sendMessage(chatId, '⚠️ Please send a valid link starting with http:// or https://');
    }
  });

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name;

    if (isAdmin(chatId)) {
      await showAdminMenu(chatId);
    } else {
      await bot.sendMessage(
        chatId,
        `Welcome ${userName}! 👋\n\nI can help you create secure links.\nJust send me any link and I'll secure it for you!`
      );
    }
  });

  // Handle /sendmessage command (admin only)
  bot.onText(/\/sendmessage/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, '⚠️ Sorry, this command is only for admins.');
      return;
    }
    adminStates[chatId] = { action: 'typing_broadcast' };
    await bot.sendMessage(chatId, '📝 Please type the message you want to send to all users:');
  });

  // Handle /database_management command (admin only)
  bot.onText(/\/database_management/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, '⚠️ Sorry, this command is only for admins.');
      return;
    }
    adminStates[chatId] = { action: 'db_management' };
    await showDatabaseMenu(chatId);
  });

  // Handle callback queries from inline buttons
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    // Always answer callback queries immediately
    await bot.answerCallbackQuery(query.id);

    if (!isAdmin(chatId)) {
      await bot.sendMessage(chatId, '⚠️ Sorry, this feature is only for admins.');
      return;
    }

    switch (action) {
      case 'send_message':
        adminStates[chatId] = { action: 'typing_broadcast' };
        await bot.sendMessage(chatId, '📝 Please type the message you want to send to all users:');
        break;
      case 'secure_link':
        adminStates[chatId] = { action: 'creating_secure_link' };
        await bot.sendMessage(chatId, '🔒 Please send the link you want to secure:');
        break;
      case 'send_broadcast':
        await handleBroadcast(chatId);
        break;
      case 'edit_broadcast':
        adminStates[chatId] = { action: 'typing_broadcast' };
        await bot.sendMessage(chatId, '📝 Please type your new message:');
        break;
      case 'db_management':
        await showDatabaseMenu(chatId);
        break;
      case 'main_menu':
        await showAdminMenu(chatId);
        break;
      case 'view_blocked':
        await handleViewBlocked(chatId);
        break;
      case 'view_inactive':
        await handleViewInactive(chatId);
        break;
      case 'clean_db':
        await showCleanupOptions(chatId);
        break;
      case 'remove_deleted':
        await clearDeletedUsers(chatId);
        break;
      default:
        break;
    }
  });

  // Handle polling errors
  bot.on('polling_error', (error) => {
    logger.error('Bot polling error:', error);
  });
};

module.exports = { setupBot };
