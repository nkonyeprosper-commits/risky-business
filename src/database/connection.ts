import { MongoClient, Db } from "mongodb";
import { config } from "../config";

class Database {
  private client: MongoClient;
  private db: Db | null = null;

  constructor() {
    this.client = new MongoClient(config.mongoUri);
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db();
      console.log("Connected to MongoDB");
    } catch (error) {
      console.error("MongoDB connection error:", error);
      throw error;
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error("Database not connected");
    }
    return this.db;
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}

export const database = new Database();
