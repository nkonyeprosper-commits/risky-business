import { database } from "../database/connection";
import { Order, PaymentStatus, UserSession } from "../types";
import { ObjectId } from "mongodb";

export class OrderService {
  private get ordersCollection() {
    return database.getDb().collection<Order>("orders");
  }

  private get sessionsCollection() {
    return database.getDb().collection<UserSession>("sessions");
  }

  async createOrder(order: Omit<Order, "_id">): Promise<string> {
    const result = await this.ordersCollection.insertOne({
      ...order,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return result.insertedId.toString();
  }

  async updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
    await this.ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return await this.ordersCollection.findOne({ _id: new ObjectId(orderId) });
  }

  async getUserOrders(userId: number): Promise<Order[]> {
    return await this.ordersCollection.find({ userId }).toArray();
  }

  async saveUserSession(session: UserSession): Promise<void> {
    await this.sessionsCollection.replaceOne(
      { userId: session.userId },
      { ...session, createdAt: new Date() },
      { upsert: true }
    );
  }

  async getUserSession(userId: number): Promise<UserSession | null> {
    return await this.sessionsCollection.findOne({ userId });
  }

  async clearUserSession(userId: number): Promise<void> {
    await this.sessionsCollection.deleteOne({ userId });
  }

  async getPendingOrders(): Promise<Order[]> {
    return await this.ordersCollection
      .find({
        "paymentInfo.status": PaymentStatus.PENDING,
      })
      .toArray();
  }

  // Also add this method for admin/monitoring purposes
  async getOrdersByStatus(status: PaymentStatus): Promise<Order[]> {
    return await this.ordersCollection
      .find({
        "paymentInfo.status": status,
      })
      .toArray();
  }

  // Get orders within a date range (useful for monitoring)
  async getOrdersByDateRange(startDate: Date, endDate: Date): Promise<Order[]> {
    return await this.ordersCollection
      .find({
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .toArray();
  }
}
