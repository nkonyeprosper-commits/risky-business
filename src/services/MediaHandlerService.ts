import TelegramBot from "node-telegram-bot-api";
import { config } from "../config";

export class MediaHandlerService {
  private adminChannelId: string;

  constructor(private bot: TelegramBot, adminChannelId?: string) {
    // Admin channel ID should be in your config
    this.adminChannelId = adminChannelId || config.adminChannelId || "";
  }

  // Handle media uploads during order process
  async handleMediaUpload(
    msg: TelegramBot.Message,
    userId: number,
    orderId?: string,
    projectName?: string
  ): Promise<void> {
    const chatId = msg.chat.id;
    const mediaType = this.getMediaType(msg);

    console.log("We don reach here ooo");
    if (!mediaType) {
      await this.bot.sendMessage(
        chatId,
        "❌ Please send a valid media file (photo, video, animation/GIF, or document)."
      );
      return;
    }

    try {
      // Forward the media to admin channel with context
      await this.forwardMediaToAdmin(
        msg,
        userId,
        orderId,
        projectName,
        mediaType
      );

      // Confirm receipt to user
      await this.bot.sendMessage(
        chatId,
        `✅ *Media Received!*\n\n` +
          `📎 **Type:** ${mediaType}\n` +
          `📱 **Project:** ${projectName || "Unknown"}\n` +
          `🆔 **Order:** ${orderId || "Pending"}\n\n` +
          `Your media has been forwarded to our team for processing.`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error handling media upload:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ *Error uploading media*\n\n" +
          "There was an issue processing your media. Please try again or contact support.",
        { parse_mode: "Markdown" }
      );
    }
  }

  // Forward media to admin channel with context
  private async forwardMediaToAdmin(
    msg: TelegramBot.Message,
    userId: number,
    orderId?: string,
    projectName?: string,
    mediaType?: string
  ): Promise<void> {
    if (!this.adminChannelId) {
      console.error("Admin channel ID not configured!");
      return;
    }

    // Create context message
    const contextMessage = `
🎬 *NEW MEDIA UPLOAD*

👤 **User ID:** ${userId}
📱 **Project:** ${projectName || "Unknown"}
🆔 **Order ID:** ${orderId || "Pending"}
📎 **Media Type:** ${mediaType || "Unknown"}
📅 **Time:** ${new Date().toISOString()}

---
    `;

    try {
      // Send context first
      await this.bot.sendMessage(this.adminChannelId, contextMessage, {
        parse_mode: "Markdown",
      });

      // Forward the actual media
      await this.bot.forwardMessage(
        this.adminChannelId,
        msg.chat.id,
        msg.message_id
      );
    } catch (error) {
      console.error("Error forwarding to admin channel:", error);
      throw error;
    }
  }

  // Determine media type from message
  private getMediaType(msg: TelegramBot.Message): string | null {
    if (msg.photo) return "Photo";
    if (msg.video) return "Video";
    if (msg.animation) return "GIF/Animation";
    if (msg.document) {
      // Check if document is a video/gif
      const mimeType = msg.document.mime_type;
      if (mimeType?.includes("video")) return "Video Document";
      if (mimeType?.includes("image")) return "Image Document";
      return "Document";
    }
    if (msg.video_note) return "Video Note";
    return null;
  }

  // Check if message contains media
  hasMedia(msg: TelegramBot.Message): boolean {
    console.log("We reached here too ooooo");
    return !!(
      msg.photo ||
      msg.video ||
      msg.animation ||
      msg.document ||
      msg.video_note
    );
  }

  // Get media file info for logging
  getMediaInfo(msg: TelegramBot.Message): any {
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1]; // Get largest photo
      return {
        type: "photo",
        file_id: photo.file_id,
        file_size: photo.file_size,
        width: photo.width,
        height: photo.height,
      };
    }

    if (msg.video) {
      return {
        type: "video",
        file_id: msg.video.file_id,
        file_size: msg.video.file_size,
        duration: msg.video.duration,
        width: msg.video.width,
        height: msg.video.height,
        mime_type: msg.video.mime_type,
      };
    }

    if (msg.animation) {
      return {
        type: "animation",
        file_id: msg.animation.file_id,
        file_size: msg.animation.file_size,
        duration: msg.animation.duration,
        width: msg.animation.width,
        height: msg.animation.height,
        mime_type: msg.animation.mime_type,
      };
    }

    if (msg.document) {
      return {
        type: "document",
        file_id: msg.document.file_id,
        file_size: msg.document.file_size,
        file_name: msg.document.file_name,
        mime_type: msg.document.mime_type,
      };
    }

    return null;
  }
}
