import { OrderService } from "./orderService";
import { BlockchainService } from "./blockchainService";
import { PaymentStatus, Order, ServiceType } from "../types";
import TelegramBot from "node-telegram-bot-api";
import moment from "moment-timezone";

export class PaymentVerificationService {
  private verificationIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private orderService: OrderService,
    private blockchainService: BlockchainService,
    private bot: TelegramBot
  ) {}

  // Start verification for a specific order
  async startOrderVerification(orderId: string, chatId: number): Promise<void> {
    console.log(`🔄 Starting verification for order: ${orderId}`);

    let attempts = 0;
    const maxAttempts = 20; // 10 minutes total (30 seconds * 20)

    const verificationInterval = setInterval(async () => {
      attempts++;

      try {
        const order = await this.orderService.getOrder(orderId);
        if (!order || order.paymentInfo.status !== PaymentStatus.PENDING) {
          this.clearVerification(orderId);
          return;
        }

        console.log(
          `🔍 Verification attempt ${attempts}/${maxAttempts} for order: ${orderId}`
        );

        // Verify payment on blockchain
        const isValid = await this.blockchainService.validateTransaction(
          order.paymentInfo.txnHash!,
          order.paymentInfo.network,
          order.paymentInfo.amount,
          order.paymentInfo.walletAddress
        );

        if (isValid) {
          // Payment confirmed!
          await this.confirmPayment(order, chatId);
          this.clearVerification(orderId);
          return;
        }

        // If max attempts reached, mark as failed
        if (attempts >= maxAttempts) {
          await this.failPayment(order, chatId);
          this.clearVerification(orderId);
        }
      } catch (error) {
        console.error(`❌ Verification error for order ${orderId}:`, error);

        if (attempts >= maxAttempts) {
          this.clearVerification(orderId);
        }
      }
    }, 30000); // Check every 30 seconds

    // Store the interval
    this.verificationIntervals.set(orderId, verificationInterval);

    // Set a maximum timeout of 15 minutes
    setTimeout(() => {
      if (this.verificationIntervals.has(orderId)) {
        console.log(`⏰ Verification timeout for order: ${orderId}`);
        this.clearVerification(orderId);
      }
    }, 900000); // 15 minutes
  }

  // Manual verification method (for admin use)
  async manualVerifyPayment(
    orderId: string,
    chatId?: number
  ): Promise<boolean> {
    try {
      const order = await this.orderService.getOrder(orderId);
      if (!order) {
        console.log(`❌ Order not found: ${orderId}`);
        return false;
      }

      if (order.paymentInfo.status !== PaymentStatus.PENDING) {
        console.log(
          `❌ Order ${orderId} is not in PENDING status: ${order.paymentInfo.status}`
        );
        return false;
      }

      const isValid = await this.blockchainService.validateTransaction(
        order.paymentInfo.txnHash!,
        order.paymentInfo.network,
        order.paymentInfo.amount,
        order.paymentInfo.walletAddress
      );

      if (isValid) {
        await this.confirmPayment(order, chatId || 0);
        this.clearVerification(orderId);
        return true;
      } else {
        console.log(`❌ Manual verification failed for order: ${orderId}`);
        return false;
      }
    } catch (error) {
      console.error(
        `❌ Manual verification error for order ${orderId}:`,
        error
      );
      return false;
    }
  }

  // Get all pending orders for batch verification
  async getAllPendingOrders(): Promise<Order[]> {
    // This would require adding a method to OrderService
    // For now, we'll assume it exists or implement a simple version
    try {
      // You'll need to add this method to OrderService:
      // async getPendingOrders(): Promise<Order[]>
      return []; // Placeholder - implement in OrderService
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      return [];
    }
  }

  // Batch verification for all pending orders
  async verifyAllPendingOrders(): Promise<void> {
    console.log("🔄 Starting batch verification of all pending orders...");

    try {
      const pendingOrders = await this.getAllPendingOrders();

      for (const order of pendingOrders) {
        if (order._id) {
          // Convert ObjectId to string if needed
          const orderId = order._id.toString();

          // Don't start verification if already running
          if (!this.verificationIntervals.has(orderId)) {
            // We don't have chatId for batch, so pass 0 (admin will handle notifications)
            await this.startOrderVerification(orderId, 0);
          }
        }
      }

      console.log(
        `✅ Batch verification started for ${pendingOrders.length} orders`
      );
    } catch (error) {
      console.error("❌ Error in batch verification:", error);
    }
  }

  // Stop verification for a specific order
  stopOrderVerification(orderId: string): void {
    this.clearVerification(orderId);
  }

  // Stop all verifications
  stopAllVerifications(): void {
    console.log("🛑 Stopping all payment verifications...");
    this.verificationIntervals.forEach((interval, orderId) => {
      clearInterval(interval);
      console.log(`⏹️ Stopped verification for order: ${orderId}`);
    });
    this.verificationIntervals.clear();
  }

  // Get verification status
  getVerificationStatus(): { activeVerifications: number; orderIds: string[] } {
    const orderIds = Array.from(this.verificationIntervals.keys());
    return {
      activeVerifications: orderIds.length,
      orderIds,
    };
  }

  // Confirm payment success
  private async confirmPayment(order: Order, chatId: number): Promise<void> {
    console.log(`✅ Payment confirmed for order: ${order._id}`);

    // Update order status
    await this.orderService.updateOrder(order._id!.toString(), {
      paymentInfo: {
        ...order.paymentInfo,
        status: PaymentStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    // Only send notification if chatId is provided and valid
    if (chatId > 0) {
      await this.sendConfirmationNotification(order, chatId);
    }
  }

  // Mark payment as failed
  private async failPayment(order: Order, chatId: number): Promise<void> {
    console.log(`❌ Payment verification failed for order: ${order._id}`);

    // Update order status
    await this.orderService.updateOrder(order._id!.toString(), {
      paymentInfo: {
        ...order.paymentInfo,
        status: PaymentStatus.FAILED,
        failedAt: new Date(),
      },
    });

    // Only send notification if chatId is provided and valid
    if (chatId > 0) {
      await this.sendFailureNotification(order, chatId);
    }
  }

  // Send payment confirmation notification
  private async sendConfirmationNotification(
    order: Order,
    chatId: number
  ): Promise<void> {
    const serviceDesc = this.getServiceDescription(order);
    const duration = this.getServiceDuration(order);

    const confirmationMessage = `
🎉 *Payment Confirmed!*

✅ Your payment has been verified on the blockchain!

🆔 **Order ID:** \`${order._id}\`
📱 **Project:** ${order.projectDetails.name}
🛍️ **Service:** ${serviceDesc}
📅 **Duration:** ${duration}
💰 **Amount:** $${order.totalPrice}
🔗 **Network:** ${order.paymentInfo.network.toUpperCase()}
🧾 **Transaction:** \`${order.paymentInfo.txnHash}\`

🚀 **Your service will begin as scheduled!**

Thank you for choosing Risky Business! 🎊
    `;

    try {
      await this.bot.sendMessage(chatId, confirmationMessage, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(`Failed to send confirmation to chat ${chatId}:`, error);
    }
  }

  // Send payment failure notification
  private async sendFailureNotification(
    order: Order,
    chatId: number
  ): Promise<void> {
    const failureMessage = `
❌ *Payment Verification Failed*

🆔 **Order ID:** \`${order._id}\`
📱 **Project:** ${order.projectDetails.name}
💰 **Expected Amount:** $${order.totalPrice}
🔗 **Network:** ${order.paymentInfo.network.toUpperCase()}
🧾 **Transaction:** \`${order.paymentInfo.txnHash}\`

**Possible Issues:**
• Transaction not confirmed yet (network congestion)
• Wrong amount sent (check for exact USD equivalent)
• Wrong network used (ensure correct blockchain)
• Wrong wallet address
• Insufficient gas fees

**Next Steps:**
• Wait longer if transaction is still pending
• Double-check your transaction on blockchain explorer
• Contact support if you believe this is an error
• Place a new order with correct details

💡 _Contact our support team for assistance_
    `;

    try {
      await this.bot.sendMessage(chatId, failureMessage, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(
        `Failed to send failure notification to chat ${chatId}:`,
        error
      );
    }
  }

  // Clear verification interval
  private clearVerification(orderId: string): void {
    const interval = this.verificationIntervals.get(orderId);
    if (interval) {
      clearInterval(interval);
      this.verificationIntervals.delete(orderId);
      console.log(`🗑️ Cleared verification for order: ${orderId}`);
    }
  }

  // Helper method to get service description
  private getServiceDescription(order: Order): string {
    switch (order.serviceConfig.type) {
      case ServiceType.PIN:
        return `Pin Service (${order.serviceConfig.pinnedPosts || 1} posts)`;
      case ServiceType.BUYBOT:
        return "BuyBot Service";
      case ServiceType.COMBO:
        return `Combo Service (${
          order.serviceConfig.pinnedPosts || 1
        } pins + BuyBot)`;
      default:
        return "Unknown Service";
    }
  }

  // Helper method to get service duration
  private getServiceDuration(order: Order): string {
    const startDate = moment(order.serviceConfig.startDate)
      .utc()
      .format("YYYY-MM-DD HH:mm UTC");
    const endDate = moment(order.serviceConfig.endDate)
      .utc()
      .format("YYYY-MM-DD HH:mm UTC");
    return `${startDate} - ${endDate}`;
  }

  // Cleanup method to be called on service shutdown
  cleanup(): void {
    this.stopAllVerifications();
  }
}
