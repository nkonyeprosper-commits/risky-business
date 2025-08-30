import TelegramBot from "node-telegram-bot-api";
import { OrderService } from "../../services/orderService";
import { BlockchainService } from "../../services/blockchainService";
import { PaymentStatus, Order, TemplateStatus } from "../../types";
import { config } from "../../config";

export class AdminHandler {
  constructor(
    private bot: TelegramBot,
    private orderService: OrderService,
    private blockchainService: BlockchainService
  ) {}

  async handleAdminCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id!;
    const text = msg.text!;

    if (!config.adminUserIds.includes(userId)) {
      return;
    }

    if (text.startsWith("/verify")) {
      const orderId = text.split(" ")[1];
      if (orderId) {
        await this.verifyPayment(chatId, orderId);
      } else {
        await this.bot.sendMessage(chatId, "Usage: /verify <order_id>");
      }
    } else if (text === "/pending") {
      await this.showPendingOrders(chatId);
    } else if (text === "/stats") {
      await this.showStats(chatId);
    } else if (text === "/templates") {
      await this.showPendingTemplates(chatId);
    } else if (text.startsWith("/approve")) {
      const orderId = text.split(" ")[1];
      if (orderId) {
        await this.approveTemplate(chatId, orderId);
      } else {
        await this.bot.sendMessage(chatId, "Usage: /approve <order_id>");
      }
    } else if (text.startsWith("/reject")) {
      const orderId = text.split(" ")[1];
      if (orderId) {
        await this.rejectTemplate(chatId, orderId);
      } else {
        await this.bot.sendMessage(chatId, "Usage: /reject <order_id>");
      }
    }
  }

  // Handle callback queries from template inline buttons
  async handleTemplateCallback(query: TelegramBot.CallbackQuery): Promise<void> {
    const data = query.data!;
    const chatId = query.message?.chat.id!;
    const userId = query.from.id;

    if (!config.adminUserIds.includes(userId)) {
      await this.bot.answerCallbackQuery(query.id, {
        text: "Access denied",
        show_alert: true
      });
      return;
    }

    if (data.startsWith("template_approve_")) {
      const orderId = data.replace("template_approve_", "");
      await this.approveTemplate(chatId, orderId);
      await this.bot.answerCallbackQuery(query.id, { text: "Template approved!" });
    } else if (data.startsWith("template_reject_")) {
      const orderId = data.replace("template_reject_", "");
      await this.rejectTemplate(chatId, orderId);
      await this.bot.answerCallbackQuery(query.id, { text: "Template rejected!" });
    } else if (data.startsWith("template_note_")) {
      const orderId = data.replace("template_note_", "");
      await this.bot.answerCallbackQuery(query.id, { text: "Use /note <order_id> <message>" });
      await this.bot.sendMessage(chatId, `📝 To add a note, use: /note ${orderId} <your message>`);
    }
  }

  private async approveTemplate(chatId: number, orderId: string): Promise<void> {
    try {
      const order = await this.orderService.getOrder(orderId);
      if (!order) {
        await this.bot.sendMessage(chatId, "❌ Order not found.");
        return;
      }

      await this.orderService.updateOrder(orderId, {
        templateStatus: TemplateStatus.APPROVED,
        templateApprovedAt: new Date()
      });

      await this.bot.sendMessage(chatId, `✅ Template approved for order ${orderId}`);
      
      // Notify user
      await this.bot.sendMessage(
        order.userId,
        `✅ **Order Approved!**\n\n` +
        `Your order ${orderId} has been approved and will proceed as scheduled.\n\n` +
        `Project: ${order.projectDetails.name}\n` +
        `Service begins soon!`
      );
    } catch (error) {
      console.error("Error approving template:", error);
      await this.bot.sendMessage(chatId, "❌ Error approving template.");
    }
  }

  private async rejectTemplate(chatId: number, orderId: string): Promise<void> {
    try {
      const order = await this.orderService.getOrder(orderId);
      if (!order) {
        await this.bot.sendMessage(chatId, "❌ Order not found.");
        return;
      }

      await this.orderService.updateOrder(orderId, {
        templateStatus: TemplateStatus.REJECTED,
        templateRejectedAt: new Date()
      });

      await this.bot.sendMessage(chatId, `❌ Template rejected for order ${orderId}`);
      
      // Notify user
      await this.bot.sendMessage(
        order.userId,
        `❌ **Order Rejected**\n\n` +
        `Your order ${orderId} has been rejected.\n\n` +
        `Project: ${order.projectDetails.name}\n` +
        `Please contact support for more information or submit a new order.`
      );
    } catch (error) {
      console.error("Error rejecting template:", error);
      await this.bot.sendMessage(chatId, "❌ Error rejecting template.");
    }
  }

  private async showPendingTemplates(chatId: number): Promise<void> {
    try {
      // This would need a new method in OrderService to get orders by template status
      await this.bot.sendMessage(chatId, "📋 Fetching pending templates...");
      // TODO: Implement when OrderService methods are updated
    } catch (error) {
      console.error("Error showing pending templates:", error);
      await this.bot.sendMessage(chatId, "❌ Error fetching templates.");
    }
  }

  private async verifyPayment(chatId: number, orderId: string): Promise<void> {
    try {
      const order = await this.orderService.getOrder(orderId);
      if (!order) {
        await this.bot.sendMessage(chatId, "❌ Order not found.");
        return;
      }

      if (order.paymentInfo.status !== PaymentStatus.PENDING) {
        await this.bot.sendMessage(
          chatId,
          `ℹ️ Order already ${order.paymentInfo.status}.`
        );
        return;
      }

      const isValid = await this.blockchainService.validateTransaction(
        order.paymentInfo.txnHash!,
        order.paymentInfo.network,
        order.paymentInfo.amount,
        order.paymentInfo.walletAddress
      );

      const newStatus = isValid
        ? PaymentStatus.CONFIRMED
        : PaymentStatus.FAILED;

      await this.orderService.updateOrder(orderId, {
        paymentInfo: {
          ...order.paymentInfo,
          status: newStatus,
        },
      });

      const statusEmoji = isValid ? "✅" : "❌";
      const statusText = isValid ? "CONFIRMED" : "FAILED";

      await this.bot.sendMessage(
        chatId,
        `${statusEmoji} Order ${orderId} payment ${statusText}`
      );

      // Notify user
      await this.notifyUser(order, newStatus);
    } catch (error) {
      console.error("Payment verification error:", error);
      await this.bot.sendMessage(chatId, "❌ Error verifying payment.");
    }
  }

  private async notifyUser(order: Order, status: PaymentStatus): Promise<void> {
    const statusEmoji = status === PaymentStatus.CONFIRMED ? "✅" : "❌";
    const statusText =
      status === PaymentStatus.CONFIRMED ? "confirmed" : "failed";

    const message = `
${statusEmoji} *Payment ${statusText.toUpperCase()}*

🆔 **Order ID:** \`${order._id}\`
📱 **Project:** ${order.projectDetails.name}
💰 **Amount:** ${order.totalPrice}

${
  status === PaymentStatus.CONFIRMED
    ? "🚀 Your service will begin as scheduled!"
    : "❌ Please contact support or submit a new order with correct payment."
}
    `;

    try {
      await this.bot.sendMessage(order.userId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Failed to notify user:", error);
    }
  }

  private async showPendingOrders(chatId: number): Promise<void> {
    // Implementation would fetch pending orders from database
    await this.bot.sendMessage(chatId, "📋 Fetching pending orders...");
  }

  private async showStats(chatId: number): Promise<void> {
    // Implementation would show order statistics
    await this.bot.sendMessage(chatId, "📊 Fetching statistics...");
  }
}
