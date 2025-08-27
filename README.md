# Risky Business Payment Portal Bot

A comprehensive Telegram bot for handling cryptocurrency payments and service bookings.

## Features

- 🚀 Complete order flow management
- 💳 Multi-blockchain payment support (BSC, Ethereum, Base)
- 🔄 CEX transfer compatibility
- 📊 Admin panel for payment verification
- 🗄️ MongoDB data persistence
- ⚡ TypeScript for type safety

## Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Environment configuration:**
   Copy `.env.example` to `.env` and fill in your values:

```env
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb://localhost:27017/risky_business
BSC_RPC_URL=https://bsc-dataseed.binance.org/
ETH_RPC_URL=https://mainnet.infura.io/v3/your_project_id
BASE_RPC_URL=https://mainnet.base.org
ADMIN_USER_IDS=123456789,987654321
```

3. **Build and run:**

```bash
npm run build
npm start
```

For development:

```bash
npm run dev
```

## Architecture

- **Database**: MongoDB with proper indexing
- **Blockchain**: Web3.js for transaction validation
- **Bot Framework**: node-telegram-bot-api
- **Type Safety**: Full TypeScript implementation
- **Session Management**: User flow state tracking

## Admin Commands

- `/verify <order_id>` - Verify payment manually
- `/pending` - Show pending orders
- `/stats` - Display statistics

## Payment Flow

1. User submits project details
2. Selects service and dates
3. Gets payment address for chosen network
4. Makes payment (direct wallet or CEX)
5. Submits transaction hash
6. Admin verification (automatic + manual)
7. Service activation confirmation

## Security Features

- Transaction hash validation
- Payment amount verification
- Admin-only verification commands
- CEX transfer detection
- Proper error handling
