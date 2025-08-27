import TelegramBot from "node-telegram-bot-api";
import { OrderService } from "../../services/orderService";
import { BlockchainService } from "../../services/blockchainService";
import { PaymentStatus, Order } from "../../types";
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
