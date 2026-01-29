import type { DashboardState, Fill, Position, Order, MarketStats } from '../types/paradex';

// Generate sample time series data
function generateTimeSeriesData(points: number, baseValue: number, variance: number) {
  const now = Date.now();
  const data: { time: number; value: number }[] = [];
  let value = baseValue;

  for (let i = points; i >= 0; i--) {
    value += (Math.random() - 0.48) * variance; // Slight upward bias
    data.push({
      time: now - i * 60000, // 1 minute intervals
      value: Math.max(0, value),
    });
  }
  return data;
}

// Sample fills
const sampleFills: Fill[] = [
  {
    id: 'fill-1',
    market: 'BTC-USD-PERP',
    side: 'BUY',
    size: '0.0150',
    price: '97234.50',
    realized_pnl: '0',
    fee: '2.91',
    created_at: Date.now() - 120000,
    order_id: 'order-1',
    trade_type: 'FILL',
  },
  {
    id: 'fill-2',
    market: 'ETH-USD-PERP',
    side: 'SELL',
    size: '0.2500',
    price: '3456.78',
    realized_pnl: '12.45',
    fee: '1.72',
    created_at: Date.now() - 300000,
    order_id: 'order-2',
    trade_type: 'FILL',
  },
  {
    id: 'fill-3',
    market: 'SOL-USD-PERP',
    side: 'BUY',
    size: '5.0000',
    price: '198.45',
    realized_pnl: '0',
    fee: '1.98',
    created_at: Date.now() - 480000,
    order_id: 'order-3',
    trade_type: 'FILL',
  },
  {
    id: 'fill-4',
    market: 'BTC-USD-PERP',
    side: 'SELL',
    size: '0.0100',
    price: '97456.00',
    realized_pnl: '22.15',
    fee: '1.94',
    created_at: Date.now() - 600000,
    order_id: 'order-4',
    trade_type: 'FILL',
  },
  {
    id: 'fill-5',
    market: 'ARB-USD-PERP',
    side: 'BUY',
    size: '150.0000',
    price: '0.8234',
    realized_pnl: '0',
    fee: '0.24',
    created_at: Date.now() - 900000,
    order_id: 'order-5',
    trade_type: 'FILL',
  },
];

// Sample positions
const samplePositions: Position[] = [
  {
    id: 'pos-1',
    market: 'BTC-USD-PERP',
    side: 'LONG',
    status: 'OPEN',
    size: '0.0250',
    leverage: '5',
    average_entry_price: '96850.00',
    unrealized_pnl: '45.23',
    realized_positional_pnl: '22.15',
    liquidation_price: '82000.00',
    cost: '484.25',
  },
  {
    id: 'pos-2',
    market: 'ETH-USD-PERP',
    side: 'SHORT',
    status: 'OPEN',
    size: '0.5000',
    leverage: '3',
    average_entry_price: '3478.90',
    unrealized_pnl: '-12.34',
    realized_positional_pnl: '8.50',
    liquidation_price: '4200.00',
    cost: '579.82',
  },
  {
    id: 'pos-3',
    market: 'SOL-USD-PERP',
    side: 'LONG',
    status: 'OPEN',
    size: '10.0000',
    leverage: '2',
    average_entry_price: '195.50',
    unrealized_pnl: '28.75',
    liquidation_price: '98.00',
    cost: '977.50',
  },
];

// Sample open orders
const sampleOpenOrders: Map<string, Order> = new Map([
  ['BTC-USD-PERP', {
    id: 'order-open-1',
    market: 'BTC-USD-PERP',
    side: 'SELL',
    type: 'LIMIT',
    size: '0.0250',
    price: '98500.00',
    status: 'OPEN',
    created_at: Date.now() - 60000,
  }],
  ['ETH-USD-PERP', {
    id: 'order-open-2',
    market: 'ETH-USD-PERP',
    side: 'BUY',
    type: 'LIMIT',
    size: '0.5000',
    price: '3400.00',
    status: 'OPEN',
    created_at: Date.now() - 120000,
  }],
]);

// Sample all open orders (for tiers display)
const sampleAllOpenOrders: Map<string, Order[]> = new Map([
  ['BTC-USD-PERP', [
    { id: 'o1', market: 'BTC-USD-PERP', side: 'SELL', type: 'LIMIT', size: '0.0100', price: '98500.00', status: 'OPEN', created_at: Date.now() - 60000 },
    { id: 'o2', market: 'BTC-USD-PERP', side: 'SELL', type: 'LIMIT', size: '0.0100', price: '99000.00', status: 'OPEN', created_at: Date.now() - 60000 },
    { id: 'o3', market: 'BTC-USD-PERP', side: 'SELL', type: 'LIMIT', size: '0.0050', price: '99500.00', status: 'OPEN', created_at: Date.now() - 60000 },
    { id: 'o4', market: 'BTC-USD-PERP', side: 'BUY', type: 'LIMIT', size: '0.0150', price: '96000.00', status: 'OPEN', created_at: Date.now() - 60000 },
    { id: 'o5', market: 'BTC-USD-PERP', side: 'BUY', type: 'LIMIT', size: '0.0100', price: '95500.00', status: 'OPEN', created_at: Date.now() - 60000 },
  ]],
  ['ETH-USD-PERP', [
    { id: 'o6', market: 'ETH-USD-PERP', side: 'BUY', type: 'LIMIT', size: '0.2500', price: '3400.00', status: 'OPEN', created_at: Date.now() - 120000 },
    { id: 'o7', market: 'ETH-USD-PERP', side: 'BUY', type: 'LIMIT', size: '0.2500', price: '3350.00', status: 'OPEN', created_at: Date.now() - 120000 },
    { id: 'o8', market: 'ETH-USD-PERP', side: 'SELL', type: 'LIMIT', size: '0.5000', price: '3550.00', status: 'OPEN', created_at: Date.now() - 120000 },
  ]],
  ['SOL-USD-PERP', [
    { id: 'o9', market: 'SOL-USD-PERP', side: 'SELL', type: 'LIMIT', size: '5.0000', price: '205.00', status: 'OPEN', created_at: Date.now() - 180000 },
    { id: 'o10', market: 'SOL-USD-PERP', side: 'SELL', type: 'LIMIT', size: '5.0000', price: '210.00', status: 'OPEN', created_at: Date.now() - 180000 },
  ]],
]);

// Sample market stats
const sampleMarketStats: Map<string, MarketStats> = new Map([
  ['BTC-USD-PERP', {
    market: 'BTC-USD-PERP',
    realizedPnL: 156.78,
    unrealizedPnL: 45.23,
    fees: 24.56,
    volume: 48523.45,
    orderCount: 42,
    fillCount: 28,
  }],
  ['ETH-USD-PERP', {
    market: 'ETH-USD-PERP',
    realizedPnL: 89.34,
    unrealizedPnL: -12.34,
    fees: 12.45,
    volume: 15678.90,
    orderCount: 31,
    fillCount: 19,
  }],
  ['SOL-USD-PERP', {
    market: 'SOL-USD-PERP',
    realizedPnL: 34.56,
    unrealizedPnL: 28.75,
    fees: 8.23,
    volume: 8934.50,
    orderCount: 18,
    fillCount: 12,
  }],
  ['ARB-USD-PERP', {
    market: 'ARB-USD-PERP',
    realizedPnL: 12.34,
    unrealizedPnL: 0,
    fees: 2.15,
    volume: 1234.56,
    orderCount: 8,
    fillCount: 5,
  }],
]);

// Generate volume data with market info
function generateVolumeData() {
  const now = Date.now();
  const markets = ['BTC-USD-PERP', 'ETH-USD-PERP', 'SOL-USD-PERP'];
  const data: { time: number; value: number; market: string }[] = [];

  for (let i = 60; i >= 0; i--) {
    const time = now - i * 60000;
    markets.forEach(market => {
      if (Math.random() > 0.3) { // Not every minute has a trade
        const baseVolume = market === 'BTC-USD-PERP' ? 500 : market === 'ETH-USD-PERP' ? 200 : 100;
        data.push({
          time,
          value: baseVolume + Math.random() * baseVolume,
          market,
        });
      }
    });
  }
  return data;
}

export const sampleDashboardState: DashboardState = {
  realizedPnL: 292.02,
  unrealizedPnL: 61.64,
  totalFees: 47.39,
  totalVolume: 74371.41,
  ordersCreated: 99,
  equity: 12456.78,
  pnlHistory: generateTimeSeriesData(60, 250, 15),
  volumeHistory: generateVolumeData(),
  ordersHistory: generateTimeSeriesData(60, 0, 0).map((p, i) => ({ time: p.time, value: Math.floor(i * 1.5) })),
  equityHistory: generateTimeSeriesData(60, 12400, 50),
  recentFills: sampleFills,
  positions: samplePositions,
  openOrders: sampleOpenOrders,
  allOpenOrders: sampleAllOpenOrders,
  lastOrderTimeByMarket: new Map([
    ['BTC-USD-PERP', Date.now() - 45000],
    ['ETH-USD-PERP', Date.now() - 180000],
    ['SOL-USD-PERP', Date.now() - 300000],
  ]),
  lastPositionChangeByMarket: new Map([
    ['BTC-USD-PERP', Date.now() - 120000],
    ['ETH-USD-PERP', Date.now() - 300000],
    ['SOL-USD-PERP', Date.now() - 480000],
  ]),
  marketStats: sampleMarketStats,
};
