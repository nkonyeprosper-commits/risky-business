import express from "express";
import { database } from "./database/connection";
import { OrderService } from "./services/orderService";
import { PriceService } from "./services/priceService";
import { BlockchainService } from "./services/blockchainService";
import { TelegramBotService } from "./bot";
import { config } from "./config";

async function main() {
  try {
    // Connect to database
    await database.connect();

    // Initialize services
    const orderService = new OrderService();
    const priceService = new PriceService();
    const blockchainService = new BlockchainService();

    // --- Minimal Express server ---
    const app = express();
    const PORT = process.env.PORT || 3000;
    app.use(express.json());

    // Start bot
    const bot = new TelegramBotService(
      orderService,
      priceService,
      blockchainService
    );

    // Webhook endpoint - using token in path for security
    const webhookPath = `/api/bot/${config.botToken}`;
    app.post(webhookPath, (req, res) => {
      bot.getBot().processUpdate(req.body);
      res.sendStatus(200);
    });

    // Health check route
    app.get("/health", (req, res) => {
      res.status(200).json({ status: "ok", uptime: process.uptime() });
    });

    // Start express server and set webhook
    app.listen(PORT, async () => {
      console.log(`✅ Healthcheck server listening on port ${PORT}`);
      if (config.webhookUrl) {
        const fullWebhookUrl = `${config.webhookUrl}${webhookPath}`;
        await bot.setWebhook(fullWebhookUrl);
      } else {
        console.warn(
          "WEBHOOK_URL not set in .env, skipping webhook setup. Bot will not receive updates via HTTP."
        );
      }
    });

    console.log("🚀 Risky Business Payment Portal Bot is running in Webhook mode...");

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down...");
      await bot.getBot().deleteWebhook();
      await database.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

main().catch(console.error);
