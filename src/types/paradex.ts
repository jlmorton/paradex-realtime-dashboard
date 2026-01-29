export interface Fill {
  id: string;
  market: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  realized_pnl: string;
  fee: string;
  created_at: number;
  order_id: string;
  trade_type: string;
}

export interface Order {
  id: string;
  market: string;
  side: 'BUY' | 'SELL';
  type: string;
  size: string;
  remaining_size?: string;
  price: string;
  status: 'NEW' | 'OPEN' | 'CLOSED' | 'CANCELED' | 'REJECTED';
  created_at: number;
  updated_at?: number;
  client_id?: string;
}

export interface Position {
  id: string;
  market: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  size: string;
  leverage?: string;
  average_entry_price: string;
  average_entry_price_usd?: string;
  liquidation_price?: string;
  unrealized_pnl: string;
  unrealized_funding_pnl?: string;
  realized_positional_pnl?: string;
  cost?: string;
  cost_usd?: string;
  cached_funding_index?: string;
  created_at?: number;
  last_updated_at?: number;
}

export interface Account {
  equity: string;
  free_collateral: string;
  initial_margin: string;
  maintenance_margin: string;
  unrealized_pnl: string;
  account_value: string;
}

export interface WebSocketMessage {
  channel: string;
  type: string;
  params?: Record<string, string>;
  data?: unknown;
  id?: number;
  error?: { code: number; message: string };
}

export interface VolumeDataPoint {
  time: number;
  value: number;
  market: string;
}

export interface MarketStats {
  market: string;
  realizedPnL: number;
  unrealizedPnL: number;
  fees: number;
  volume: number;
  orderCount: number;
  fillCount: number;
}

export interface DashboardState {
  realizedPnL: number;
  unrealizedPnL: number;
  totalFees: number;
  totalVolume: number;
  ordersCreated: number;
  equity: number;
  pnlHistory: { time: number; value: number }[];
  volumeHistory: VolumeDataPoint[];
  ordersHistory: { time: number; value: number }[];
  equityHistory: { time: number; value: number }[];
  recentFills: Fill[];
  positions: Position[];
  openOrders: Map<string, Order>; // market -> most recent open order on opposite side
  allOpenOrders: Map<string, Order[]>; // market -> all open orders
  lastOrderTimeByMarket: Map<string, number>; // market -> timestamp of last order
  lastFillTimeByMarket: Map<string, number>; // market -> timestamp of last fill (position size change)
  marketStats: Map<string, MarketStats>; // market -> aggregated stats
}

export interface ParadexConfig {
  environment: 'prod' | 'testnet';
  applicationId?: string;
}

export interface MarketConfig {
  symbol: string;
  priceTickSize: number;
  orderSizeIncrement: number;
  priceDecimals: number;
  sizeDecimals: number;
}
