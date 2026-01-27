# Paradex Realtime Dashboard

A real-time trading dashboard for [Paradex](https://paradex.trade), displaying live P&L, volume, and order data.

## Features

- Real-time WebSocket connection to Paradex
- Wallet connection via Ethereum provider
- Live P&L tracking (realized and unrealized)
- Volume tracking with historical charts
- Recent fills table
- Dark theme UI

## Tech Stack

- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Paradex Integration:** @paradex/sdk

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Deployment

This project is configured for deployment on Vercel. Simply connect your repository to Vercel and it will automatically detect the Vite configuration.

### Manual Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project directory
3. Follow the prompts

## License

MIT
