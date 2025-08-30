import TelegramBot from "node-telegram-bot-api";
import { MediaAttachment } from "../types";

export class MediaHandlerService {
  constructor(private bot: TelegramBot) {}

  // Handle media uploads during order process - now stores media data instead of forwarding
  async handleMediaUpload(
    msg: TelegramBot.Message,
    userId: number,
    orderId?: string,
    projectName?: string
  ): Promise<MediaAttachment | null> {
    const chatId = msg.chat.id;
    const mediaType = this.getMediaType(msg);

    if (!mediaType) {
      await this.bot.sendMessage(
        chatId,
        "❌ Please send a valid media file (photo, video, animation/GIF, or document)."
      );
      return null;
    }

    try {
      // Extract media information for storage
      const mediaAttachment = this.createMediaAttachment(msg, mediaType);

      // Confirm receipt to user (simplified message)
      await this.bot.sendMessage(
        chatId,
        `✅ Media Received!\n\n` +
          `📎 Type: ${mediaType}\n` +
          `📱 Project: ${projectName || "Unknown"}\n\n` +
          `Your media has been saved and will be included with your order.`
      );
      
      return mediaAttachment;
    } catch (error) {
      console.error("Error handling media upload:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Error uploading media\n\n" +
          "There was an issue processing your media. Please try again or contact support."
      );
      return null;
    }
  }

  // Create MediaAttachment object from Telegram message
  createMediaAttachment(msg: TelegramBot.Message, mediaType: string): MediaAttachment {
    const baseAttachment: MediaAttachment = {
      fileId: '',
      mediaType: 'photo', // Default, will be overridden
      uploadedAt: new Date()
    };

    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1]; // Get largest photo
      return {
        ...baseAttachment,
        fileId: photo.file_id,
        mediaType: 'photo',
        fileSize: photo.file_size,
        width: photo.width,
        height: photo.height
      };
    }

    if (msg.video) {
      return {
        ...baseAttachment,
        fileId: msg.video.file_id,
        mediaType: 'video',
        fileSize: msg.video.file_size,
        width: msg.video.width,
        height: msg.video.height,
        duration: msg.video.duration,
        mimeType: msg.video.mime_type
      };
    }

    if (msg.animation) {
      return {
        ...baseAttachment,
        fileId: msg.animation.file_id,
        mediaType: 'animation',
        fileSize: msg.animation.file_size,
        width: msg.animation.width,
        height: msg.animation.height,
        duration: msg.animation.duration,
        mimeType: msg.animation.mime_type
      };
    }

    if (msg.document) {
      return {
        ...baseAttachment,
        fileId: msg.document.file_id,
        mediaType: 'document',
        fileSize: msg.document.file_size,
        mimeType: msg.document.mime_type,
        fileName: msg.document.file_name || undefined
      };
    }

    if (msg.video_note) {
      return {
        ...baseAttachment,
        fileId: msg.video_note.file_id,
        mediaType: 'video_note',
        fileSize: msg.video_note.file_size,
        duration: msg.video_note.duration
      };
    }

    // Fallback (shouldn't reach here if getMediaType worked correctly)
    throw new Error('Unable to extract media information');
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

  // Check if message contains media AND is in a private chat (DM)
  hasMedia(msg: TelegramBot.Message): boolean {
    // Only process media in private chats (DMs), not in groups
    const isPrivateChat = msg.chat.type === 'private';
    
    const hasMediaContent = !!(
      msg.photo ||
      msg.video ||
      msg.animation ||
      msg.document ||
      msg.video_note
    );

    if (hasMediaContent && !isPrivateChat) {
      // Media sent in group - ignore silently
      console.log(`Media sent in ${msg.chat.type} chat (${msg.chat.id}) - ignoring`);
      return false;
    }

    if (hasMediaContent && isPrivateChat) {
      console.log("Media detected in private chat - processing");
    }
    
    return hasMediaContent && isPrivateChat;
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
