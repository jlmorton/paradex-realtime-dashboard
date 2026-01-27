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
  price: string;
  status: 'NEW' | 'OPEN' | 'CLOSED' | 'CANCELED' | 'REJECTED';
  created_at: number;
  client_id?: string;
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

export interface DashboardState {
  realizedPnL: number;
  unrealizedPnL: number;
  totalFees: number;
  totalVolume: number;
  ordersCreated: number;
  equity: number;
  pnlHistory: { time: number; value: number }[];
  volumeHistory: { time: number; value: number }[];
  ordersHistory: { time: number; value: number }[];
  equityHistory: { time: number; value: number }[];
  recentFills: Fill[];
}

export interface ParadexConfig {
  environment: 'prod' | 'testnet';
  applicationId?: string;
}
