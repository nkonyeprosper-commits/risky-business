import TelegramBot from "node-telegram-bot-api";
import { config } from "../config";
import { OrderService } from "../services/orderService";
import { PriceService } from "../services/priceService";
import { BlockchainService } from "../services/blockchainService";
import { OrderHandler } from "./handlers/orderHandler";
import { AdminHandler } from "./handlers/adminHandler";
import { KeyboardService } from "./keyboards";
import { PaymentStatus } from "../types";
import { PaymentVerificationService } from "../services/PaymentVerificationService";

export class TelegramBotService {
  private bot: TelegramBot;
  private orderHandler: OrderHandler;
  private adminHandler: AdminHandler;
  private paymentVerificationService: PaymentVerificationService;

  constructor(
    private orderService: OrderService,
    private priceService: PriceService,
    private blockchainService: BlockchainService
  ) {
    this.bot = new TelegramBot(config.botToken);

    // Initialize PaymentVerificationService
    this.paymentVerificationService = new PaymentVerificationService(
      this.orderService,
      this.blockchainService,
      this.bot
    );

    this.orderHandler = new OrderHandler(
      this.bot,
      this.orderService,
      this.priceService,
      this.blockchainService,
      this.paymentVerificationService // Pass it to OrderHandler
    );

    this.adminHandler = new AdminHandler(
      this.bot,
      this.orderService,
      this.blockchainService
    );

    this.setupBotCommands(); // Fire and forget - don't block initialization
    this.setupHandlers();
    this.startPeriodicVerification();
  }

  private async setupBotCommands() {
    try {
      await this.bot.setMyCommands([
        {
          command: "/start",
          description: "Start interacting with bot",
        },
        {
          command: "/cancel",
          description: "Stop a session order you are currently on",
        },
        { command: "/help", description: "Get information" },
        { command: "/orders", description: "Get current orders" },
        { command: "/getmyid", description: "Get your user ID" },
        // Add admin commands if needed
        { command: "/verify", description: "Verify payments (Admin)" },
        { command: "/pending", description: "View pending orders (Admin)" },
        { command: "/stats", description: "View statistics (Admin)" },
      ]);
      console.log("Bot commands set successfully");
    } catch (error) {
      console.error("Error setting bot commands:", error);
      // Don't throw error to prevent bot from failing to start
    }
  }

  private setupHandlers(): void {
    try {
      // Command handlers
      this.bot.onText(/\/start/, this.handleStart.bind(this));
      this.bot.onText(/\/help/, this.handleHelp.bind(this));
      this.bot.onText(/\/orders/, this.handleMyOrders.bind(this));
      this.bot.onText(/\/cancel/, this.handleCancel.bind(this)); 
      this.bot.onText(/\/getmyid/, this.handleGetMyId.bind(this));

      // Admin commands
      this.bot.onText(/\/(verify|pending|stats)/, (msg) => {
        try {
          this.adminHandler.handleAdminCommand(msg);
        } catch (error) {
          console.error("Error in admin command handler:", error);
        }
      });

      // Callback query handler
      this.bot.on("callback_query", (query) => {
        try {
          this.orderHandler.handleCallbackQuery(query);
        } catch (error) {
          console.error("Error in callback query handler:", error);
        }
      });

      // Text message handler for non-commands
      this.bot.on("message", (msg) => {
        try {
          // Ignore commands, which are handled by onText listeners
          if (msg.text && msg.text.startsWith("/")) {
            return;
          }
          this.orderHandler.handleTextMessage(msg);
        } catch (error) {
          console.error("Error in message handler:", error);
        }
      });

      // Error handling
      this.bot.on("error", (error) => {
        console.error("Bot error:", error);
      });

      // Polling error handling
      this.bot.on("polling_error", (error) => {
        console.error("Polling error:", error);
      });

      console.log("Telegram bot handlers set up successfully");
    } catch (error) {
      console.error("Error setting up bot handlers:", error);
      throw error; // This is critical, so we should throw
    }
  }

  // ✅ NEW: Handle /cancel command
  private async handleCancel(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id!;

    try {
      // Check if user has an active session
      const session = await this.orderService.getUserSession(userId);

      if (!session) {
        // No active session
        await this.bot.sendMessage(
          chatId,
          "ℹ️ *No Active Order*\n\n" +
            "You don't have any active order session to cancel.\n\n" +
            "Use /start to begin a new order!",
          {
            parse_mode: "Markdown",
            reply_markup: KeyboardService.getMainMenuKeyboard(),
          }
        );
        return;
      }

      // Clear the user session
      await this.orderService.clearUserSession(userId);

      // Send cancellation confirmation
      await this.bot.sendMessage(
        chatId,
        "❌ *Order Session Cancelled*\n\n" +
          "✅ Your current order session has been cancelled\n" +
          "✅ All session data has been cleared\n\n" +
          "💡 You can start a new order anytime using /start",
        {
          parse_mode: "Markdown",
          reply_markup: KeyboardService.getMainMenuKeyboard(),
        }
      );

      // Optional: Clear recent chat history (delete bot messages)
      await this.clearRecentChatHistory(chatId, msg.message_id);
    } catch (error) {
      console.error("Error handling cancel command:", error);

      // Fallback: Still clear session even if other operations fail
      try {
        await this.orderService.clearUserSession(userId);
      } catch (clearError) {
        console.error("Error clearing user session:", clearError);
      }

      await this.bot.sendMessage(
        chatId,
        "❌ *Cancellation Error*\n\n" +
          "There was an error cancelling your session, but your order data has been cleared.\n\n" +
          "Use /start to begin a new order.",
        {
          parse_mode: "Markdown",
          reply_markup: KeyboardService.getMainMenuKeyboard(),
        }
      );
    }
  }

  // ✅ NEW: Clear recent chat history (optional enhancement)
  private async clearRecentChatHistory(
    chatId: number,
    currentMessageId: number
  ): Promise<void> {
    try {
      // Delete the last 10 bot messages (adjust as needed)
      const messagesToDelete = 10;

      for (let i = 1; i <= messagesToDelete; i++) {
        try {
          const messageIdToDelete = currentMessageId - i;
          if (messageIdToDelete > 0) {
            await this.bot.deleteMessage(chatId, messageIdToDelete);
          }
        } catch (deleteError) {
          // Ignore individual delete errors (message might not exist or be deletable)
          console.log(`Could not delete message ${currentMessageId - i}`);
        }
      }
    } catch (error) {
      console.error("Error clearing chat history:", error);
      // Don't throw error - this is optional cleanup
    }
  }

  // private async getGroupId(msg: TelegramBot.Message): Promise<void> {
  //   const chatId = msg.chat.id;
  //   console.log(chatId, "Call me ooooo here");
  // }

  // Start periodic verification of all pending orders
  private startPeriodicVerification(): void {
    // Run batch verification every 5 minutes
    setInterval(async () => {
      try {
        await this.paymentVerificationService.verifyAllPendingOrders();
      } catch (error) {
        console.error("Error in periodic verification:", error);
      }
    }, 300000); // 5 minutes

    console.log("Periodic payment verification started");
  }

  // Graceful shutdown
  private async shutdown(): Promise<void> {
    console.log("Shutting down bot...");

    // Stop payment verifications
    this.paymentVerificationService.cleanup();

    // Stop bot polling
    await this.bot.stopPolling();

    console.log("Bot shutdown complete");
    process.exit(0);
  }

  private async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const welcomeMessage = `
    🚀 *Welcome to Risky Business Payment Portal*

    Your one-stop solution for crypto project promotion!

    🔥 **Available Services:**
    • 📌 Pin Service - Pin your posts for maximum visibility
    • 🤖 BuyBot Service - Automated buying assistance  
    • 🔥 Combo - Best value with both services

    💰 **Competitive Pricing:**
    • Pin: $50 per post (48h)
    • BuyBot: $50 (48h)
    • Combo: $50 total (48h)

    Ready to get started?
    `;

    await this.bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getMainMenuKeyboard(),
    });
  }

  private async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const helpMessage = `
    ❓ *Help & Support*

    **How to place an order:**
    1. Click "Start New Order"
    2. Enter project details
    3. Choose your service type
    4. Set dates and preferences
    5. Make payment
    6. Submit transaction hash

    **Supported Networks:**
    • 🟡 BSC (Binance Smart Chain)
    • 🔵 Ethereum
    • 🔵 Base

    **Payment Methods:**
    • Direct wallet transfers
    • CEX transfers supported

    **Need help?** Contact our support team!
    `;

    await this.bot.sendMessage(chatId, helpMessage, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getMainMenuKeyboard(),
    });
  }

  private async handleGetMyId(msg: TelegramBot.Message): Promise<void> {
    try {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      
      if (!userId) {
        await this.bot.sendMessage(chatId, "❌ Unable to retrieve your user ID.");
        return;
      }

      const username = msg.from?.username;
      const firstName = msg.from?.first_name || 'Unknown';

      // Build username display safely
      const usernameDisplay = username ? `@${username}` : 'No username set';

      // Send response to user (no markdown to avoid parsing errors)
      await this.bot.sendMessage(
        chatId,
        `👤 Your User Information:\n\n` +
          `🆔 User ID: ${userId}\n` +
          `👤 Name: ${firstName}\n` +
          `📱 Username: ${usernameDisplay}\n\n` +
          `📧 Send this User ID to the admin to request admin privileges.`
      );
      
      console.log(`GetMyId command used by user ${userId} (${username})`);
    } catch (error) {
      console.error("Error in handleGetMyId:", error);
      await this.bot.sendMessage(
        msg.chat.id,
        "❌ An error occurred while retrieving your information. Please try again."
      );
    }
  }

  private async handleMyOrders(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id!;

    const orders = await this.orderService.getUserOrders(userId);

    if (orders.length === 0) {
      await this.bot.sendMessage(
        chatId,
        "📝 You haven't placed any orders yet."
      );
      return;
    }

    let message = "📋 *Your Orders:*\n\n";

    orders.slice(0, 5).forEach((order, index) => {
      const statusEmoji = this.getStatusEmoji(order.paymentInfo.status);
      message += `${statusEmoji} **Order ${index + 1}**\n`;
      message += `📱 ${order.projectDetails.name}\n`;
      message += `💰 ${order.totalPrice} - ${order.paymentInfo.status}\n`;
      message += `🆔 \`${order._id}\`\n\n`;
    });

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  private getStatusEmoji(status: PaymentStatus): string {
    switch (status) {
      case PaymentStatus.PENDING:
        return "⏳";
      case PaymentStatus.CONFIRMED:
        return "✅";
      case PaymentStatus.FAILED:
        return "❌";
      default:
        return "❓";
    }
  }

  // Public method to get verification service (for external use)
  getPaymentVerificationService(): PaymentVerificationService {
    return this.paymentVerificationService;
  }

  // Public method to get bot instance (for external use)
  getBot(): TelegramBot {
    return this.bot;
  }

  // Set the webhook
  async setWebhook(url: string): Promise<void> {
    try {
      await this.bot.setWebHook(url);
      console.log(`Webhook set to ${url}`);
    } catch (error) {
      console.error("Failed to set webhook:", error);
      throw error; // Propagate error to startup
    }
  }
}
