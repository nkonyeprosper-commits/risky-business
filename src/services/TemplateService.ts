import TelegramBot from "node-telegram-bot-api";
import { Order, MediaAttachment, TemplateStatus } from "../types";
import { PriceService } from "./priceService";
import moment from "moment-timezone";

export class TemplateService {
  constructor(
    private bot: TelegramBot,
    private priceService: PriceService
  ) {}

  // Create formatted template for admin review
  createOrderTemplate(order: Order): string {
    const duration = this.calculateDuration(order.serviceConfig.startDate, order.serviceConfig.endDate);
    const serviceDesc = this.priceService.getServiceDescription(
      order.serviceConfig.type,
      duration
    );
    const pricingBreakdown = this.priceService.getPricingBreakdown(duration);

    const socialLinksText = this.formatSocialLinks(order.projectDetails.socialLinks);
    const mediaText = order.mediaAttachments.length > 0 
      ? `📎 Media Files: ${order.mediaAttachments.length} attachment(s)`
      : '📎 Media Files: None';

    // Payment status with clear visual indicators
    const paymentStatusIcon = this.getPaymentStatusIcon(order.paymentInfo.status);
    const paymentStatusText = this.getPaymentStatusText(order.paymentInfo.status);

    const template = `
🔥 ═══════════════════════════════════════
🎯 **NEW SUBMISSION: ${order.projectDetails.name.toUpperCase()}**
🔥 ═══════════════════════════════════════

📋 **Order ID:** \`${order._id}\`
${paymentStatusIcon} **PAYMENT STATUS: ${paymentStatusText}**

👤 **CLIENT INFO:**
• User ID: ${order.userId}
• Username: ${order.username || 'Not set'}

📱 **PROJECT DETAILS:**
• Name: ${order.projectDetails.name}
• Contract: \`${order.projectDetails.contractAddress}\`
• Blockchain: ${order.projectDetails.blockchain.toUpperCase()}
• Description: ${order.projectDetails.description || 'Not provided'}

🔗 **SOCIAL LINKS:**
${socialLinksText}

🛍️ **SERVICE CONFIG:**
• Type: ${serviceDesc}
• Duration: ${duration} hours (${Math.round(duration / 24)} days)
• Start: ${moment(order.serviceConfig.startDate).utc().format("YYYY-MM-DD HH:mm UTC")}
• End: ${moment(order.serviceConfig.endDate).utc().format("YYYY-MM-DD HH:mm UTC")}
${order.serviceConfig.pinnedPosts ? `• Pinned Posts: ${order.serviceConfig.pinnedPosts}` : ''}

💰 **PAYMENT DETAILS:**
• Pricing: ${pricingBreakdown}
• Total: $${order.totalPrice}
• Network: ${order.paymentInfo.network.toUpperCase()}
• Transaction: \`${order.paymentInfo.txnHash || 'Not provided'}\`
${paymentStatusIcon} **Status: ${paymentStatusText}**

${mediaText}

📅 **TIMESTAMPS:**
• Order Created: ${moment(order.createdAt).utc().format("YYYY-MM-DD HH:mm UTC")}
• Template Generated: ${moment().utc().format("YYYY-MM-DD HH:mm UTC")}

⚡ **ORDER STATUS: ${order.templateStatus.toUpperCase()}**
═══════════════════════════════════════
    `.trim();

    return template;
  }

  // Send template to admin's private chat
  async sendTemplateToAdmin(order: Order, adminUserId: number): Promise<void> {
    const template = this.createOrderTemplate(order);

    try {
      // Send the text template
      await this.bot.sendMessage(adminUserId, template);

      // Send each media attachment
      if (order.mediaAttachments.length > 0) {
        await this.bot.sendMessage(
          adminUserId, 
          `📎 **Media Files for Order ${order._id}:**`
        );

        for (let i = 0; i < order.mediaAttachments.length; i++) {
          const media = order.mediaAttachments[i];
          const caption = `${i + 1}/${order.mediaAttachments.length} - ${media.mediaType} (${this.formatFileSize(media.fileSize)})`;

          // Send media based on type
          switch (media.mediaType) {
            case 'photo':
              await this.bot.sendPhoto(adminUserId, media.fileId, { caption });
              break;
            case 'video':
              await this.bot.sendVideo(adminUserId, media.fileId, { caption });
              break;
            case 'animation':
              await this.bot.sendAnimation(adminUserId, media.fileId, { caption });
              break;
            case 'document':
              await this.bot.sendDocument(adminUserId, media.fileId, { caption });
              break;
            case 'video_note':
              await this.bot.sendVideoNote(adminUserId, media.fileId);
              break;
          }
        }
      }

      // Send action buttons
      await this.bot.sendMessage(
        adminUserId,
        `🔧 **Actions for Order ${order._id}:**`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Approve", callback_data: `template_approve_${order._id}` },
                { text: "❌ Reject", callback_data: `template_reject_${order._id}` }
              ],
              [
                { text: "📝 Add Note", callback_data: `template_note_${order._id}` }
              ]
            ]
          }
        }
      );

      console.log(`Template sent to admin ${adminUserId} for order ${order._id}`);
    } catch (error) {
      console.error("Error sending template to admin:", error);
      throw error;
    }
  }

  // Create preliminary submission template (before payment)
  createPreliminaryTemplate(userId: number, username: string | undefined, sessionData: any): string {
    const duration = this.calculateDuration(sessionData.startDate, sessionData.endDate);
    const serviceDesc = this.priceService.getServiceDescription(
      sessionData.serviceType,
      duration
    );
    const pricingBreakdown = this.priceService.getPricingBreakdown(duration);
    const price = this.priceService.calculatePriceByDuration(duration);

    const socialLinksText = this.formatSocialLinks(sessionData.socialLinks || {});
    const mediaText = sessionData.mediaAttachments?.length > 0 
      ? `📎 Media Files: ${sessionData.mediaAttachments.length} attachment(s)`
      : '📎 Media Files: None';

    const template = `
🔥 ═══════════════════════════════════════
🎯 **PRELIMINARY SUBMISSION: ${sessionData.projectName.toUpperCase()}**
🔥 ═══════════════════════════════════════

⏳ **STATUS: AWAITING PAYMENT DETAILS**

👤 **CLIENT INFO:**
• User ID: ${userId}
• Username: ${username || 'Not set'}

📱 **PROJECT DETAILS:**
• Name: ${sessionData.projectName}
• Contract: \`${sessionData.contractAddress || 'Not provided'}\`
• Blockchain: ${sessionData.blockchain ? sessionData.blockchain.toUpperCase() : 'Not selected'}
• Description: ${sessionData.projectDescription || 'Not provided'}

🔗 **SOCIAL LINKS:**
${socialLinksText}

🛍️ **SERVICE CONFIG:**
• Type: ${serviceDesc}
• Duration: ${duration} hours (${Math.round(duration / 24)} days)
• Start: ${moment(sessionData.startDate).utc().format("YYYY-MM-DD HH:mm UTC")}
• End: ${moment(sessionData.endDate).utc().format("YYYY-MM-DD HH:mm UTC")}
${sessionData.pinnedPosts ? `• Pinned Posts: ${sessionData.pinnedPosts}` : ''}

💰 **ESTIMATED PAYMENT:**
• Pricing: ${pricingBreakdown}
• Total: $${price}

${mediaText}

📅 **TIMESTAMPS:**
• Submission Time: ${moment().utc().format("YYYY-MM-DD HH:mm UTC")}

⚠️ **NOTE: Customer is now selecting payment network and will proceed to payment**
═══════════════════════════════════════
    `.trim();

    return template;
  }

  // Send preliminary template to admin's private chat
  async sendPreliminaryTemplateToAdmin(userId: number, username: string | undefined, sessionData: any, adminUserId: number): Promise<void> {
    const template = this.createPreliminaryTemplate(userId, username, sessionData);

    try {
      // Send the text template
      await this.bot.sendMessage(adminUserId, template);

      // Send each media attachment if they exist
      if (sessionData.mediaAttachments && sessionData.mediaAttachments.length > 0) {
        await this.bot.sendMessage(
          adminUserId, 
          `📎 **Media Files for ${sessionData.projectName}:**`
        );

        for (let i = 0; i < sessionData.mediaAttachments.length; i++) {
          const media = sessionData.mediaAttachments[i];
          const caption = `${i + 1}/${sessionData.mediaAttachments.length} - ${media.mediaType} (${this.formatFileSize(media.fileSize)})`;

          // Send media based on type
          switch (media.mediaType) {
            case 'photo':
              await this.bot.sendPhoto(adminUserId, media.fileId, { caption });
              break;
            case 'video':
              await this.bot.sendVideo(adminUserId, media.fileId, { caption });
              break;
            case 'animation':
              await this.bot.sendAnimation(adminUserId, media.fileId, { caption });
              break;
            case 'document':
              await this.bot.sendDocument(adminUserId, media.fileId, { caption });
              break;
            case 'video_note':
              await this.bot.sendVideoNote(adminUserId, media.fileId);
              break;
          }
        }
      }

      console.log(`Preliminary template sent to admin ${adminUserId} for user ${userId}`);
    } catch (error) {
      console.error("Error sending preliminary template to admin:", error);
      throw error;
    }
  }

  // Helper methods
  private calculateDuration(startDate: Date, endDate: Date): number {
    return moment(endDate).diff(moment(startDate), 'hours');
  }

  private getPaymentStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
        return '⏳';
      case 'confirmed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  }

  private getPaymentStatusText(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'AWAITING PAYMENT';
      case 'confirmed':
        return 'PAYMENT VERIFIED';
      case 'failed':
        return 'PAYMENT FAILED';
      default:
        return 'UNKNOWN STATUS';
    }
  }

  private formatSocialLinks(socialLinks: any): string {
    const links = [];
    if (socialLinks.twitter) links.push(`• Twitter: ${socialLinks.twitter}`);
    if (socialLinks.telegram) links.push(`• Telegram: ${socialLinks.telegram}`);
    if (socialLinks.discord) links.push(`• Discord: ${socialLinks.discord}`);
    if (socialLinks.website) links.push(`• Website: ${socialLinks.website}`);
    
    return links.length > 0 ? links.join('\n') : '• No social links provided';
  }

  private formatFileSize(bytes?: number): string {
    if (!bytes) return 'Unknown size';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  }
}