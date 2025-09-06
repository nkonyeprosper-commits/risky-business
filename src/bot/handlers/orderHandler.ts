import TelegramBot from "node-telegram-bot-api";
import { OrderService } from "../../services/orderService";
import { PriceService } from "../../services/priceService";
import { BlockchainService } from "../../services/blockchainService";
import { KeyboardService } from "../keyboards";
import {
  ServiceType,
  BlockchainNetwork,
  PaymentStatus,
  Order,
  TemplateStatus,
} from "../../types";
import moment from "moment-timezone";
import { v4 as uuidv4 } from "uuid";
import { PaymentVerificationService } from "../../services/PaymentVerificationService";
import { MediaHandlerService } from "../../services/MediaHandlerService";
import { TemplateService } from "../../services/TemplateService";
import { config } from "../../config";

export class OrderHandler {
  private mediaHandler: MediaHandlerService;
  private templateService: TemplateService;

  constructor(
    private bot: TelegramBot,
    private orderService: OrderService,
    private priceService: PriceService,
    private blockchainService: BlockchainService,
    private paymentVerificationService: PaymentVerificationService
  ) {
    this.mediaHandler = new MediaHandlerService(this.bot);
    this.templateService = new TemplateService(this.bot, this.priceService);
  }

  async handleStartOrder(chatId: number, userId: number): Promise<void> {
    await this.orderService.clearUserSession(userId);
    await this.orderService.saveUserSession({
      userId,
      step: "project_name",
      data: {},
      createdAt: new Date(),
    });

    await this.bot.sendMessage(
      chatId,
      "🚀 *Welcome to Risky Business Payment Portal*\n\n" +
        "You'll submit your project details, choose a promotion type, and make payment. Takes about 2 minutes.\n\n" +
        "📝 Let's start with your project name:",
      { parse_mode: "Markdown" }
    );
  }

  async handleTextMessage(msg: any): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id!;

    // Check if message contains media
    if (this.mediaHandler.hasMedia(msg)) {
      await this.handleMediaCallback(msg);
      return;
    }

    const text = msg.text!;
    const session = await this.orderService.getUserSession(userId);
    if (!session) return;

    switch (session.step) {
      case "project_name":
        await this.handleProjectName(chatId, userId, text, session);
        break;
      case "social_link":
        await this.handleSocialLink(chatId, userId, text, session);
        break;
      case "contract_address":
        await this.handleContractAddress(chatId, userId, text, session);
        break;
      case "project_description":
        await this.handleProjectDescription(chatId, userId, text, session);
        break;
      case "pinned_posts":
        await this.handlePinnedPosts(chatId, userId, text, session);
        break;
      case "start_date":
        await this.handleStartDate(chatId, userId, text, session);
        break;
      case "end_date":
        await this.handleEndDate(chatId, userId, text, session);
        break;
      case "txn_hash":
        await this.handleTransactionHash(chatId, userId, text, session);
        break;
      case "media_upload":
        await this.showMediaUploadInstructions(chatId, session);
        break;
    }
  }

  private async handleMediaCallback(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id!;

    // Double-check this is a private chat (safety check)
    if (msg.chat.type !== 'private') {
      console.log(`Media callback ignored for ${msg.chat.type} chat ${chatId}`);
      return;
    }

    const session = await this.orderService.getUserSession(userId);
    if (!session) {
      // No active session, just acknowledge
      await this.bot.sendMessage(
        chatId,
        "📎 I received your media, but you don't have an active order session.\n\n" +
          "Please start a new order first with /start"
      );
      return;
    }

    // If we're in media_upload step, process it
    if (session.step === "media_upload") {
      await this.handleMediaUploadStep(msg, session);
      return;
    }

    // For other steps, inform user and collect media
    const mediaAttachment = await this.mediaHandler.handleMediaUpload(
      msg,
      userId,
      session.data.orderId,
      session.data.projectName
    );

    if (mediaAttachment) {
      // Store media in session for later use
      if (!session.data.mediaAttachments) {
        session.data.mediaAttachments = [];
      }
      session.data.mediaAttachments.push(mediaAttachment);
      await this.orderService.saveUserSession(session);

      await this.bot.sendMessage(
        chatId,
        "📎 Media saved for your order!\n\n" +
          "Continue with the current step to proceed."
      );
    }
  }

  private async showMediaUploadInstructions(
    chatId: number,
    session: any
  ): Promise<void> {
    await this.bot.sendMessage(
      chatId,
      "🎬 *Upload Media for Your Service*\n\n" +
        "📎 **Please upload:**\n" +
        "• 📸 Photo/Image for posts\n" +
        "• 🎥 Video content\n" +
        "• 🎞️ GIF/Animation\n\n" +
        "💡 **Tips:**\n" +
        "• High quality works best\n" +
        "• Max file size: 50MB\n" +
        "• Multiple files? Send them one by one\n\n" +
        "Or click continue to skip media:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Continue Without Media",
                callback_data: "media_done",
              },
            ],
            [{ text: "❌ Cancel Order", callback_data: "cancel_order" }],
          ],
        },
      }
    );
  }

  // New: Handle media upload step
  private async handleMediaUploadStep(
    msgOrChatId: TelegramBot.Message | number,
    sessionOrUserId?: any,
    session?: any
  ): Promise<void> {
    let chatId: number;
    let userId: number;
    let actualSession: any;
    let msg: TelegramBot.Message | undefined;

    console.log("msgOrChatId type:", typeof msgOrChatId);
    console.log("msgOrChatId value:", msgOrChatId);

    // ✅ FIXED: Check if first parameter is a Message object
    if (
      msgOrChatId &&
      typeof msgOrChatId === "object" &&
      "chat" in msgOrChatId
    ) {
      // Called with (msg, session) from handleMediaCallback
      msg = msgOrChatId as TelegramBot.Message;
      chatId = msg.chat.id;
      userId = msg.from?.id!;
      actualSession = sessionOrUserId; // This is the session
      console.log("✅ Message branch - media upload");
    } else if (typeof msgOrChatId === "number") {
      // Called with (chatId, userId, session) from switch statement
      chatId = msgOrChatId;
      userId = sessionOrUserId as number;
      actualSession = session;
      console.log("✅ Number branch - text instruction");
    } else {
      console.error("❌ Invalid parameters passed to handleMediaUploadStep");
      return;
    }

    // If it's just a text message in media step, show instructions
    if (!msg || !this.mediaHandler.hasMedia(msg)) {
      await this.bot.sendMessage(
        chatId,
        "🎬 *Upload Media for Your Service*\n\n" +
          "📎 **Please upload:**\n" +
          "• 📸 Photo/Image for posts\n" +
          "• 🎥 Video content\n" +
          "• 🎞️ GIF/Animation\n\n" +
          "💡 **Tips:**\n" +
          "• High quality works best\n" +
          "• Max file size: 50MB\n" +
          "• Multiple files? Send them one by one\n\n" +
          "Or type 'skip' to continue without media:",
        { parse_mode: "Markdown" }
      );
      return;
    }

    console.log("What happened next");

    // Process the media
    const mediaAttachment = await this.mediaHandler.handleMediaUpload(
      msg,
      userId,
      actualSession.data.orderId,
      actualSession.data.projectName
    );

    if (mediaAttachment) {
      // Store media in session
      if (!actualSession.data.mediaAttachments) {
        actualSession.data.mediaAttachments = [];
      }
      actualSession.data.mediaAttachments.push(mediaAttachment);
      await this.orderService.saveUserSession(actualSession);
    }

    console.log("We are still waiting");
    // Ask if they want to upload more
    await this.bot.sendMessage(
      chatId,
      "✅ *Media uploaded successfully!*\n\n" +
        "Would you like to upload more media or continue?",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📎 Upload More", callback_data: "media_more" },
              { text: "✅ Continue", callback_data: "media_done" },
            ],
            [{ text: "❌ Cancel Order", callback_data: "cancel_order" }],
          ],
        },
      }
    );
  }

  private getStepDescription(step: string): string {
    const stepDescriptions: { [key: string]: string } = {
      project_name: "Project Name",
      social_links: "Social Links",
      social_link: "Adding Social Link",
      contract_address: "Contract Address",
      blockchain_selection: "Blockchain Selection",
      project_description: "Project Description",
      service_selection: "Service Selection",
      pinned_posts: "Pinned Posts Count",
      media_upload: "Media Upload",
      start_date: "Start Date Selection",
      end_date: "End Date Selection",
      payment_network: "Payment Network",
      payment_confirmation: "Payment Instructions",
      txn_hash: "Transaction Hash Entry",
    };

    return stepDescriptions[step] || "Unknown Step";
  }

  // ✅ NEW: Public cancel method that can be called from TelegramBotService
  async handleCancelCommand(chatId: number, userId: number): Promise<void> {
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

      // Send cancellation confirmation with more details
      const projectName = session.data.projectName || "Unknown";
      const step = session.step || "unknown";

      let stepDescription = this.getStepDescription(step);

      await this.bot.sendMessage(
        chatId,
        "❌ *Order Session Cancelled*\n\n" +
          `📱 **Project:** ${projectName}\n` +
          `📝 **Was at step:** ${stepDescription}\n\n` +
          "✅ Session data cleared successfully\n" +
          "✅ You can start fresh anytime\n\n" +
          "💡 Use /start to begin a new order",
        {
          parse_mode: "Markdown",
          reply_markup: KeyboardService.getMainMenuKeyboard(),
        }
      );

      console.log(
        `Order session cancelled for user ${userId} at step: ${step}`
      );
    } catch (error) {
      console.error("Error in handleCancelCommand:", error);

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

  private async handleCancel(chatId: number, userId: number): Promise<void> {
    // await this.orderService.clearUserSession(userId);
    // await this.bot.sendMessage(
    //   chatId,
    //   "❌ *Order Cancelled*\n\nYour current order has been cancelled. You can start a new order anytime!",
    //   {
    //     parse_mode: "Markdown",
    //     reply_markup: KeyboardService.getMainMenuKeyboard(),
    //   }
    // );
    await this.handleCancelCommand(chatId, userId);
  }

  private async handleProjectName(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    session.data.projectName = text;
    session.step = "social_links";

    // Initialize socialLinks if not exists
    if (!session.data.socialLinks) {
      session.data.socialLinks = {};
    }

    await this.orderService.saveUserSession(session);

    const messageText = this.getSocialLinksMessage(session.data.socialLinks);
    const sentMessage = await this.bot.sendMessage(chatId, messageText, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getSocialPlatformsKeyboard(
        session.data.socialLinks
      ),
    });

    // ✅ Store the message ID for later editing
    session.data.lastMessageId = sentMessage.message_id;
    await this.orderService.saveUserSession(session);
  }

  async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id!;
    const userId = query.from.id;
    const data = query.data!;

    // Handle media callbacks
    if (data === "media_more") {
      await this.bot.answerCallbackQuery(query.id, {
        text: "Upload more media files",
      });

      const session = await this.orderService.getUserSession(userId);
      if (session) {
        await this.handleMediaUploadStep(chatId, userId, session);
      }
      return;
    }

    if (data === "media_done") {
      await this.bot.answerCallbackQuery(query.id, {
        text: "Proceeding to next step",
      });
      const session = await this.orderService.getUserSession(userId);
      if (session) {
        await this.proceedToDateSelection(chatId, userId, session);
      }
      return;
    }

    if (data === "start_order") {
      await this.handleStartOrder(chatId, userId);
      return;
    }

    if (data === "cancel_order") {
      await this.handleCancel(chatId, userId);
      return;
    }

    const session = await this.orderService.getUserSession(userId);
    if (!session) return;

    if (data.startsWith("social_")) {
      await this.handleSocialCallback(chatId, userId, data, session);
    } else if (data.startsWith("blockchain_")) {
      await this.handleBlockchainCallback(chatId, userId, data, session);
    } else if (data.startsWith("service_")) {
      await this.handleServiceCallback(chatId, userId, data, session);
    } else if (data.startsWith("payment_") && data !== "payment_confirm") {
      // 🔧 FIX: Only handle network selection, not confirmation
      await this.handlePaymentCallback(chatId, userId, data, session);
    } else if (data === "payment_confirm") {
      // 🔧 FIX: Separate handler for payment confirmation
      await this.handlePaymentConfirm(chatId, userId, session);
    } else if (data.startsWith("date_")) {
      await this.handleDateCallback(chatId, userId, data, session);
    }
  }

  private async handleSocialCallback(
    chatId: number,
    userId: number,
    data: string,
    session: any
  ): Promise<void> {
    if (!session.data.socialLinks) {
      session.data.socialLinks = {};
    }

    const platform = data.replace("social_", "");

    if (platform === "done") {
      session.step = "contract_address";
      await this.orderService.saveUserSession(session);

      await this.bot.sendMessage(
        chatId,
        "📄 *Contract Address & Blockchain*\n\nPlease enter your contract address:",
        {
          parse_mode: "Markdown",
        }
      );
      return;
    }

    session.data.currentSocial = platform;
    session.step = "social_link";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(
      chatId,
      `🔗 Enter your ${
        platform.charAt(0).toUpperCase() + platform.slice(1)
      } link:`,
      { parse_mode: "Markdown" }
    );
  }

  private getSocialLinksMessage(socialLinks: any = {}): string {
    const added = Object.keys(socialLinks).filter((key) => socialLinks[key]);

    if (added.length === 0) {
      return "🔗 *Social Links*\n\nAdd your social media links by clicking the buttons below:";
    }

    const addedText = added
      .map((platform) => platform.charAt(0).toUpperCase() + platform.slice(1))
      .join(", ");

    const remaining = ["Twitter", "Telegram", "Discord", "Website"].filter(
      (platform) => !socialLinks[platform.toLowerCase()]
    );

    if (remaining.length === 0) {
      return `🔗 *Social Links*\n\n✅ Added: ${addedText}\n\nGreat! You can add more or continue:`;
    }

    const remainingText = remaining.slice(0, 2).join(" or ");
    return `🔗 *Social Links*\n\n✅ Added: ${addedText}\n\nNow add ${remainingText} or continue:`;
  }

  private async handleSocialLink(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    const platform = session.data.currentSocial;
    session.data.socialLinks[platform] = text;
    session.step = "social_links";
    await this.orderService.saveUserSession(session);

    // Edit the existing message with updated info
    const messageText = this.getSocialLinksMessage(session.data.socialLinks);

    try {
      await this.bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: session.data.lastMessageId,
        parse_mode: "Markdown",
        reply_markup: KeyboardService.getSocialPlatformsKeyboard(
          session.data.socialLinks
        ),
      });
    } catch (error) {
      // Fallback if editing fails
      const sentMessage = await this.bot.sendMessage(chatId, messageText, {
        parse_mode: "Markdown",
        reply_markup: KeyboardService.getSocialPlatformsKeyboard(
          session.data.socialLinks
        ),
      });
      session.data.lastMessageId = sentMessage.message_id;
      await this.orderService.saveUserSession(session);
    }
  }

  private async handleContractAddress(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    session.data.contractAddress = text;
    session.step = "blockchain_selection";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(chatId, "⛓️ *Select Blockchain Network:*", {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getBlockchainKeyboard(),
    });
  }

  private async handleBlockchainCallback(
    chatId: number,
    userId: number,
    data: string,
    session: any
  ): Promise<void> {
    const blockchain = data.replace("blockchain_", "") as BlockchainNetwork;
    session.data.blockchain = blockchain;
    session.step = "project_description";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(
      chatId,
      '📝 *Project Description (Optional)*\n\nProvide a short description of your project or type "skip":',
      {
        parse_mode: "Markdown",
      }
    );
  }

  private async handleProjectDescription(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    if (text.toLowerCase() !== "skip") {
      session.data.projectDescription = text;
    }
    session.step = "service_selection";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(chatId, "🛍️ *Choose Your Service:*", {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getServiceTypeKeyboard(),
    });
  }

  private async handleServiceCallback(
    chatId: number,
    userId: number,
    data: string,
    session: any
  ): Promise<void> {
    const serviceType = data.replace("service_", "") as ServiceType;
    session.data.serviceType = serviceType;

    if (serviceType === ServiceType.PIN || serviceType === ServiceType.COMBO) {
      session.step = "pinned_posts";
      await this.orderService.saveUserSession(session);

      await this.bot.sendMessage(
        chatId,
        "📌 *Number of Pinned Posts*\n\nHow many posts would you like to pin? (Enter a number):",
        {
          parse_mode: "Markdown",
        }
      );
    } else {
      // await this.proceedToDateSelection(chatId, userId, session);
      // Go to media upload step
      session.step = "media_upload";
      await this.orderService.saveUserSession(session);
      await this.handleMediaUploadStep(chatId, userId, session);
    }
  }

  private async handlePinnedPosts(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    const posts = parseInt(text);
    if (isNaN(posts) || posts < 1) {
      await this.bot.sendMessage(
        chatId,
        "❌ Please enter a valid number of posts (minimum 1)."
      );
      return;
    }

    // session.data.pinnedPosts = posts;
    // await this.orderService.saveUserSession(session);
    // await this.proceedToDateSelection(chatId, userId, session);
    session.data.pinnedPosts = posts;
    session.step = "media_upload";
    await this.orderService.saveUserSession(session);
    await this.handleMediaUploadStep(chatId, userId, session);
  }

  private async proceedToDateSelection(
    chatId: number,
    userId: number,
    session: any
  ): Promise<void> {
    session.step = "start_date";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(
      chatId,
      "📅 *Start Date & Time*\n\n" +
        "Choose an option or enter manually:\n" +
        "• Use ASAP for immediate start\n" +
        "• Use format: YYYY-MM-DD HH:MM\n" +
        "• Example: 2025-08-16 14:30\n\n" +
        "_All times in UTC timezone_",
      {
        parse_mode: "Markdown",
        reply_markup: KeyboardService.getDateSelectionKeyboard(),
      }
    );
  }

  private async handleDateCallback(
    chatId: number,
    userId: number,
    data: string,
    session: any
  ): Promise<void> {
    const action = data.replace("date_", "");

    if (action === "asap") {
      // Set start date to now + 30 minutes
      const startDate = moment.utc().add(30, "minutes");
      session.data.startDate = startDate.toDate();
      session.step = "end_date";
      await this.orderService.saveUserSession(session);

      await this.bot.sendMessage(
        chatId,
        `✅ *Start Date Set*\n📅 ${startDate.format(
          "YYYY-MM-DD HH:mm UTC"
        )}\n\n` +
          "📅 *End Date & Time*\n\n" +
          "Choose an option or enter manually:\n" +
          "• Use format: YYYY-MM-DD HH:MM\n" +
          "• Example: 2025-08-18 14:30\n\n" +
          "_All times in UTC timezone_",
        {
          parse_mode: "Markdown",
          reply_markup: KeyboardService.getEndDateKeyboard(startDate.toDate()),
        }
      );
    } else if (action === "manual") {
      await this.bot.sendMessage(
        chatId,
        "📅 *Enter Start Date*\n\n" +
          "Please enter start date and time:\n" +
          "Format: YYYY-MM-DD HH:MM\n" +
          "Example: 2025-08-16 14:30\n\n" +
          "_Time in UTC timezone_",
        { parse_mode: "Markdown" }
      );
    } else if (action.startsWith("hours_")) {
      // Handle end date selection (48h, 96h, 168h options)
      const hours = parseInt(action.replace("hours_", ""));
      const startDate = moment(session.data.startDate);
      const endDate = startDate.clone().add(hours, "hours");

      // Validate the duration
      if (!this.priceService.isValidDuration(hours)) {
        await this.bot.sendMessage(
          chatId,
          "❌ Invalid duration selected. Please use the manual option for custom durations.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      session.data.endDate = endDate.toDate();
      await this.orderService.saveUserSession(session);
      await this.showOrderSummary(chatId, userId, session);
    }
  }

  private async handleStartDate(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    const startDate = moment.utc(text, "YYYY-MM-DD HH:mm");
    if (!startDate.isValid()) {
      await this.bot.sendMessage(
        chatId,
        "❌ Invalid date format. Please use YYYY-MM-DD HH:MM\n" +
          "Example: 2025-08-16 14:30\n\n" +
          "Or use /cancel to start over"
      );
      return;
    }

    // Check if date is in the future
    if (startDate.isBefore(moment.utc())) {
      await this.bot.sendMessage(
        chatId,
        "❌ Start date must be in the future.\n" +
          "Please enter a future date and time.\n\n" +
          "Or use /cancel to start over"
      );
      return;
    }

    session.data.startDate = startDate.toDate();
    session.step = "end_date";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(
      chatId,
      `✅ *Start Date Set*\n📅 ${startDate.format(
        "YYYY-MM-DD HH:mm UTC"
      )}\n\n` +
        "📅 *End Date & Time*\n\n" +
        "Choose duration or enter manually:",
      {
        parse_mode: "Markdown",
        reply_markup: KeyboardService.getEndDateKeyboard(startDate.toDate()),
      }
    );
  }

  private async handleEndDate(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    const endDate = moment.utc(text, "YYYY-MM-DD HH:mm");
    if (!endDate.isValid()) {
      await this.bot.sendMessage(
        chatId,
        "❌ Invalid date format. Please use YYYY-MM-DD HH:MM\n" +
          "Example: 2025-08-18 14:30\n\n" +
          "Or use /cancel to start over"
      );
      return;
    }

    const startDate = moment(session.data.startDate);
    if (endDate.isBefore(startDate)) {
      await this.bot.sendMessage(
        chatId,
        "❌ End date must be after start date.\n" +
          "Please enter a valid end date.\n\n" +
          "Or use /cancel to start over"
      );
      return;
    }

    // Calculate duration in hours
    const durationHours = endDate.diff(startDate, "hours");

    // NEW: Validate duration according to pricing rules
    if (!this.priceService.isValidDuration(durationHours)) {
      await this.bot.sendMessage(
        chatId,
        "❌ *Invalid Duration*\n\n" +
          "Duration must be:\n" +
          "• **Minimum:** 48 hours (2 days)\n" +
          "• **Valid options:** Multiples of 48 hours OR exactly 1 week (168h)\n\n" +
          "**Examples:**\n" +
          "✅ 48h, 96h, 144h, 168h (1 week), 192h, etc.\n" +
          "❌ 24h, 72h, 120h, 200h\n\n" +
          "**Pricing:** $50 per 48h period | $150 per week\n\n" +
          "Or use /cancel to start over",
        { parse_mode: "Markdown" }
      );
      return;
    }

    session.data.endDate = endDate.toDate();
    await this.orderService.saveUserSession(session);
    await this.showOrderSummary(chatId, userId, session);
  }

  private async showOrderSummary(
    chatId: number,
    userId: number,
    session: any
  ): Promise<void> {
    // Calculate duration in hours
    const startDate = moment(session.data.startDate);
    const endDate = moment(session.data.endDate);
    const durationHours = endDate.diff(startDate, 'hours');
    
    const price = this.priceService.calculatePriceByDuration(durationHours);
    const serviceDesc = this.priceService.getServiceDescription(
      session.data.serviceType,
      durationHours
    );
    const pricingBreakdown = this.priceService.getPricingBreakdown(durationHours);

    // 🚀 NEW: Send preliminary template to admin immediately
    const primaryAdminId = config.primaryAdminId || config.adminUserIds[0];
    if (primaryAdminId) {
      try {
        // Get username from Telegram if available
        let username = session.data.username;
        if (!username) {
          try {
            const chatMember = await this.bot.getChatMember(chatId, userId);
            username = chatMember.user.username;
          } catch (error) {
            console.log("Could not fetch username:", error);
          }
        }

        await this.templateService.sendPreliminaryTemplateToAdmin(
          userId,
          username,
          session.data,
          primaryAdminId
        );
        
        console.log(`Preliminary template sent to admin ${primaryAdminId} for user ${userId}`);
      } catch (templateError) {
        console.error("Error sending preliminary template to admin:", templateError);
        // Don't fail the order process because of template sending error
      }
    } else {
      console.warn("No primary admin configured - preliminary template not sent");
    }

    const summary = `
🧾 *Order Summary*

📱 **Project:** ${session.data.projectName}
⛓️ **Blockchain:** ${session.data.blockchain.toUpperCase()}
📄 **Contract:** \`${session.data.contractAddress}\`
🛍️ **Service:** ${serviceDesc}
${
  session.data.pinnedPosts
    ? `📌 **Pinned Posts:** ${session.data.pinnedPosts}\n`
    : ""
}
📅 **Start:** ${moment(session.data.startDate)
      .utc()
      .format("YYYY-MM-DD HH:mm UTC")}
📅 **End:** ${moment(session.data.endDate).utc().format("YYYY-MM-DD HH:mm UTC")}
⏱️ **Duration:** ${Math.round(durationHours / 24)} days (${durationHours}h)

💵 **Pricing:** ${pricingBreakdown}
💰 **Total Price:** $${price}

Select payment network:
    `;

    session.step = "payment_network";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(chatId, summary, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getPaymentNetworkKeyboard(),
    });
  }

  private async handlePaymentCallback(
    chatId: number,
    userId: number,
    data: string,
    session: any
  ): Promise<void> {
    const paymentNetwork = data.replace("payment_", "") as BlockchainNetwork;

    // Store the selected network in session
    session.data.paymentNetwork = paymentNetwork;
    session.step = "payment_confirmation";
    await this.orderService.saveUserSession(session);

    // Calculate duration-based price
    const startDate = moment(session.data.startDate);
    const endDate = moment(session.data.endDate);
    const durationHours = endDate.diff(startDate, 'hours');
    const price = this.priceService.calculatePriceByDuration(durationHours);
    const walletAddress =
      this.blockchainService.getWalletAddress(paymentNetwork);

    const paymentMessage = `
💳 *Payment Instructions*

🔗 **Network:** ${paymentNetwork.toUpperCase()}
💰 **Amount:** $${price} (equivalent in native token)
📍 **Wallet Address:**
\`${walletAddress}\`

⚠️ **Important:**
• Send the equivalent amount in native token (BNB/ETH)
• CEX transfers are supported
• Include sufficient gas fees
• Double-check the wallet address

After sending, click "I've Paid" and enter your transaction hash.

💡 _Use /cancel to start over if needed_
    `;

    await this.bot.sendMessage(chatId, paymentMessage, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getConfirmationKeyboard(),
    });
  }

  private async handlePaymentConfirm(
    chatId: number,
    userId: number,
    session: any
  ): Promise<void> {
    session.step = "txn_hash";
    await this.orderService.saveUserSession(session);

    await this.bot.sendMessage(
      chatId,
      "🧾 *Transaction Hash*\n\n" +
        "Please enter your transaction hash (0x...):\n\n" +
        "💡 _Use /cancel to start over if needed_",
      { parse_mode: "Markdown" }
    );
  }

  private async handleTransactionHash(
    chatId: number,
    userId: number,
    text: string,
    session: any
  ): Promise<void> {
    if (!this.blockchainService.isValidTxHash(text)) {
      await this.bot.sendMessage(
        chatId,
        "❌ Invalid transaction hash format. Please enter a valid hash starting with 0x...\n\n" +
          "💡 _Use /cancel to start over if needed_"
      );
      return;
    }

    await this.bot.sendMessage(
      chatId,
      "⏳ *Processing Payment...*\n\n" +
        "Please wait while we verify your transaction.\n" +
        "This may take a few moments."
    );

    try {
      // Create order and start automatic verification
      const orderId = await this.createOrderFromSession(userId, session, text);

      // Get the created order for template sending
      const order = await this.orderService.getOrder(orderId);
      if (!order) {
        throw new Error("Failed to retrieve created order");
      }

      // Send template to admin's private chat IMMEDIATELY (regardless of payment status)
      const primaryAdminId = config.primaryAdminId || config.adminUserIds[0];
      if (primaryAdminId) {
        try {
          await this.templateService.sendTemplateToAdmin(order, primaryAdminId);
          
          // Update order to mark template as sent
          await this.orderService.updateOrder(orderId, {
            templateSentAt: new Date()
          });
          
          console.log(`Template sent to admin ${primaryAdminId} for order ${orderId}`);
        } catch (templateError) {
          console.error("Error sending template to admin:", templateError);
          // Don't fail the order creation because of template sending error
        }
      } else {
        console.warn("No primary admin configured - template not sent");
      }

      // Clear session
      await this.orderService.clearUserSession(userId);

      // Send initial confirmation
      await this.sendOrderConfirmation(chatId, userId, orderId);
      // Start automatic verification using the dedicated service
      await this.paymentVerificationService.startOrderVerification(
        orderId,
        chatId
      );
    } catch (error) {
      console.error("Order creation error:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ *Error Processing Order*\n\n" +
          "There was an error processing your order. Please try again.\n\n" +
          "💡 _Use /start to begin a new order_"
      );
    }
  }

  // 🚀 NEW: Automatic payment verification
  private async startAutomaticVerification(
    orderId: string,
    chatId: number
  ): Promise<void> {
    const order = await this.orderService.getOrder(orderId);
    if (!order) return;

    // Send initial confirmation
    await this.sendOrderConfirmation(chatId, order.userId, orderId);

    // Start verification process (check every 30 seconds for 10 minutes)
    let attempts = 0;
    const maxAttempts = 20; // 10 minutes total

    const verificationInterval = setInterval(async () => {
      attempts++;

      try {
        const currentOrder = await this.orderService.getOrder(orderId);
        if (
          !currentOrder ||
          currentOrder.paymentInfo.status !== PaymentStatus.PENDING
        ) {
          clearInterval(verificationInterval);
          return;
        }

        // Verify payment
        const isValid = await this.blockchainService.validateTransaction(
          currentOrder.paymentInfo.txnHash!,
          currentOrder.paymentInfo.network,
          currentOrder.paymentInfo.amount,
          currentOrder.paymentInfo.walletAddress
        );

        if (isValid) {
          // Payment confirmed!
          await this.orderService.updateOrder(orderId, {
            paymentInfo: {
              ...currentOrder.paymentInfo,
              status: PaymentStatus.CONFIRMED,
            },
          });

          await this.sendPaymentConfirmation(chatId, currentOrder);
          clearInterval(verificationInterval);
          return;
        }

        // If max attempts reached, mark as failed
        if (attempts >= maxAttempts) {
          await this.orderService.updateOrder(orderId, {
            paymentInfo: {
              ...currentOrder.paymentInfo,
              status: PaymentStatus.FAILED,
            },
          });

          await this.sendPaymentFailure(chatId, currentOrder);
          clearInterval(verificationInterval);
        }
      } catch (error) {
        console.error("Verification error:", error);

        if (attempts >= maxAttempts) {
          clearInterval(verificationInterval);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private async sendPaymentConfirmation(
    chatId: number,
    order: Order
  ): Promise<void> {
    const serviceDesc = this.priceService.getServiceDescription(
      order.serviceConfig.type
    );
    const startDate = moment(order.serviceConfig.startDate)
      .utc()
      .format("YYYY-MM-DD HH:mm UTC");
    const endDate = moment(order.serviceConfig.endDate)
      .utc()
      .format("YYYY-MM-DD HH:mm UTC");

    const confirmationMessage = `
🎉 *Payment Confirmed!*

✅ Your payment has been verified on the blockchain!

🆔 **Order ID:** \`${order._id}\`
📱 **Project:** ${order.projectDetails.name}
🛍️ **Service:** ${serviceDesc}
📅 **Duration:** ${startDate} - ${endDate}
💰 **Amount:** $${order.totalPrice}
🧾 **Transaction:** \`${order.paymentInfo.txnHash}\`

🚀 **Your service will begin as scheduled!**

Thank you for using Risky Business! 🎊
  `;

    await this.bot.sendMessage(chatId, confirmationMessage, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getMainMenuKeyboard(),
    });
  }

  private async sendPaymentFailure(
    chatId: number,
    order: Order
  ): Promise<void> {
    const failureMessage = `
❌ *Payment Verification Failed*

🆔 **Order ID:** \`${order._id}\`
🧾 **Transaction:** \`${order.paymentInfo.txnHash}\`

**Possible Issues:**
• Transaction not confirmed yet (wait longer)
• Wrong network used
• Insufficient amount sent
• Wrong wallet address

**Next Steps:**
• Double-check your transaction on blockchain explorer
• Contact support if you believe this is an error
• You can place a new order with correct details

💡 _Use /start to begin a new order_
  `;

    await this.bot.sendMessage(chatId, failureMessage, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getMainMenuKeyboard(),
    });
  }

  private async createOrderFromSession(
    userId: number,
    session: any,
    txnHash: string
  ): Promise<string> {
    // Calculate duration-based price
    const startDate = moment(session.data.startDate);
    const endDate = moment(session.data.endDate);
    const durationHours = endDate.diff(startDate, 'hours');
    const price = this.priceService.calculatePriceByDuration(durationHours);
    const walletAddress = this.blockchainService.getWalletAddress(
      session.data.paymentNetwork
    );

    const order: Omit<Order, "_id"> = {
      userId,
      username: session.data.username,
      projectDetails: {
        name: session.data.projectName,
        socialLinks: session.data.socialLinks || {},
        contractAddress: session.data.contractAddress,
        blockchain: session.data.blockchain,
        description: session.data.projectDescription,
      },
      serviceConfig: {
        type: session.data.serviceType,
        startDate: session.data.startDate,
        endDate: session.data.endDate,
        pinnedPosts: session.data.pinnedPosts,
      },
      paymentInfo: {
        network: session.data.paymentNetwork,
        amount: price,
        walletAddress,
        txnHash,
        status: PaymentStatus.PENDING,
      },
      totalPrice: price,
      mediaAttachments: session.data.mediaAttachments || [],
      templateStatus: TemplateStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return await this.orderService.createOrder(order);
  }

  private async sendOrderConfirmation(
    chatId: number,
    userId: number,
    orderId: string
  ): Promise<void> {
    const order = await this.orderService.getOrder(orderId);
    if (!order) return;

    const serviceDesc = this.priceService.getServiceDescription(
      order.serviceConfig.type
    );
    const startDate = moment(order.serviceConfig.startDate)
      .utc()
      .format("YYYY-MM-DD HH:mm UTC");
    const endDate = moment(order.serviceConfig.endDate)
      .utc()
      .format("YYYY-MM-DD HH:mm UTC");

    const confirmationMessage = `
✅ *Order Confirmed*

🆔 **Order ID:** \`${orderId}\`
📱 **Project:** ${order.projectDetails.name}
⛓️ **Blockchain:** ${order.projectDetails.blockchain.toUpperCase()}
📄 **Contract:** \`${order.projectDetails.contractAddress}\`
🛍️ **Service:** ${serviceDesc}
${
  order.serviceConfig.pinnedPosts
    ? `📌 **Pinned Posts:** ${order.serviceConfig.pinnedPosts}\n`
    : ""
}
📅 **Duration:** ${startDate} - ${endDate}
💰 **Amount Paid:** ${order.totalPrice}
🔗 **Payment Network:** ${order.paymentInfo.network.toUpperCase()}
🧾 **Transaction:** \`${order.paymentInfo.txnHash}\`

⏳ **Status:** Payment verification in progress
📧 We'll notify you once payment is confirmed and service begins.

Thank you for using Risky Business! 🚀
    `;

    await this.bot.sendMessage(chatId, confirmationMessage, {
      parse_mode: "Markdown",
      reply_markup: KeyboardService.getMainMenuKeyboard(),
    });
  }
}
