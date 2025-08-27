import TelegramBot from "node-telegram-bot-api";
import { BlockchainNetwork, ServiceType } from "../types";
import moment from "moment-timezone";

export class KeyboardService {
  static getMainMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: "🚀 Start New Order", callback_data: "start_order" }],
        [{ text: "📋 My Orders", callback_data: "my_orders" }],
        [{ text: "❓ Help", callback_data: "help" }],
      ],
    };
  }

  static getSocialPlatformsKeyboard(
    socialLinks: any = {}
  ): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: socialLinks.twitter ? "🐦 Twitter ✅" : "🐦 Twitter",
            callback_data: "social_twitter",
          },
          {
            text: socialLinks.telegram ? "📱 Telegram ✅" : "📱 Telegram",
            callback_data: "social_telegram",
          },
        ],
        [
          {
            text: socialLinks.discord ? "💬 Discord ✅" : "💬 Discord",
            callback_data: "social_discord",
          },
          {
            text: socialLinks.website ? "🌐 Website ✅" : "🌐 Website",
            callback_data: "social_website",
          },
        ],
        [{ text: "✅ Continue", callback_data: "social_done" }],
      ],
    };
  }

  static getBlockchainKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "🟡 BSC",
            callback_data: `blockchain_${BlockchainNetwork.BSC}`,
          },
        ],
        [
          {
            text: "🔵 Ethereum",
            callback_data: `blockchain_${BlockchainNetwork.ETH}`,
          },
        ],
        [
          {
            text: "🔵 Base",
            callback_data: `blockchain_${BlockchainNetwork.BASE}`,
          },
        ],
      ],
    };
  }

  static getServiceTypeKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "📌 Pin (48h) - $50/post",
            callback_data: `service_${ServiceType.PIN}`,
          },
        ],
        [
          {
            text: "🤖 BuyBot (48h) - $50",
            callback_data: `service_${ServiceType.BUYBOT}`,
          },
        ],
        [
          {
            text: "🔥 Combo (48h) - $50",
            callback_data: `service_${ServiceType.COMBO}`,
          },
        ],
      ],
    };
  }

  // 🆕 NEW: Date selection keyboard
  static getDateSelectionKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: "⚡ ASAP (in 30 min)", callback_data: "date_asap" }],
        [{ text: "📝 Enter Manually", callback_data: "date_manual" }],
        [{ text: "❌ Cancel", callback_data: "cancel_order" }],
      ],
    };
  }

  // 🆕 NEW: End date selection keyboard
  static getEndDateKeyboard(startDate: Date): TelegramBot.InlineKeyboardMarkup {
    const start = moment(startDate);

    return {
      inline_keyboard: [
        [
          { text: "⏰ 24 Hours", callback_data: "date_hours_24" },
          { text: "⏰ 48 Hours", callback_data: "date_hours_48" },
        ],
        [
          { text: "⏰ 72 Hours", callback_data: "date_hours_72" },
          { text: "⏰ 1 Week", callback_data: "date_hours_168" },
        ],
        [{ text: "📝 Enter Manually", callback_data: "date_manual" }],
        [{ text: "❌ Cancel", callback_data: "cancel_order" }],
      ],
    };
  }

  static getPaymentNetworkKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: "🟡 Pay with BSC",
            callback_data: `payment_${BlockchainNetwork.BSC}`,
          },
        ],
        [
          {
            text: "🔵 Pay with Ethereum",
            callback_data: `payment_${BlockchainNetwork.ETH}`,
          },
        ],
        [
          {
            text: "🔵 Pay with Base",
            callback_data: `payment_${BlockchainNetwork.BASE}`,
          },
        ],
      ],
    };
  }

  static getConfirmationKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: "✅ I've Paid", callback_data: "payment_confirm" }],
        [{ text: "❌ Cancel Order", callback_data: "order_cancel" }],
      ],
    };
  }
}
