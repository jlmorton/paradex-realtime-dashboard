import { useEffect, useRef, useState, useCallback } from 'react';
import type { Fill, Order, Position, DashboardState } from '../types/paradex';

const WS_URL = 'wss://ws.api.prod.paradex.trade/v1';
const REST_API_URL = 'https://api.prod.paradex.trade/v1';

interface UseWebSocketOptions {
  jwtToken: string | null;
  onStateUpdate?: (state: DashboardState) => void;
}

// Use the Position type from types/paradex.ts for WebSocket updates
// WebSocket sends partial updates, so we merge with existing data
interface WSPosition {
  market: string;
  side: string;
  status?: string;
  size: string;
  leverage?: string;
  unrealized_pnl: string;
  unrealized_funding_pnl?: string;
  realized_positional_pnl?: string;
  average_entry_price: string;
  average_entry_price_usd?: string;
  liquidation_price?: string;
  cost?: string;
  cost_usd?: string;
}

interface AccountData {
  equity?: string;
  account_value?: string;
  free_collateral?: string;
  unrealized_pnl?: string;
}

interface BalanceEvent {
  settlement_asset_balance_after: string;
  settlement_asset_balance_before: string;
  event_type: string;
}

// Generic WS message from Paradex
interface WSMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
  params?: {
    channel: string;
    data: unknown;
  };
}

export function useWebSocket({ jwtToken, onStateUpdate }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const jwtTokenRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [state, setState] = useState<DashboardState>({
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalFees: 0,
    totalVolume: 0,
    ordersCreated: 0,
    equity: 0,
    pnlHistory: [],
    volumeHistory: [],
    ordersHistory: [],
    equityHistory: [],
    recentFills: [],
    positions: [],
    openOrders: new Map(),
  });

  // Track positions for aggregating P&L (internal ref for quick lookup)
  const positionsRef = useRef<Map<string, WSPosition>>(new Map());
  // Track open orders by market for showing exit prices
  const openOrdersRef = useRef<Map<string, Order>>(new Map());

  const updatePnLFromPositions = useCallback(() => {
    let totalUnrealized = 0;

    positionsRef.current.forEach(pos => {
      totalUnrealized += parseFloat(pos.unrealized_pnl) || 0;
    });

    const now = Date.now();
    setState(prev => {
      // Total P&L = realized P&L - fees + unrealized P&L
      const newTotalPnL = prev.realizedPnL - prev.totalFees + totalUnrealized;
      return {
        ...prev,
        unrealizedPnL: totalUnrealized,
        pnlHistory: [...prev.pnlHistory, { time: now, value: newTotalPnL }],
      };
    });
  }, []);

  const handleFill = useCallback((fill: Fill) => {
    console.log('Processing fill:', fill);
    setState(prev => {
      const fillVolume = parseFloat(fill.price) * parseFloat(fill.size);
      const fillRealizedPnL = parseFloat(fill.realized_pnl) || 0;
      const fillFee = parseFloat(fill.fee) || 0;
      const now = Date.now();

      const newRealizedPnL = prev.realizedPnL + fillRealizedPnL;
      const newTotalFees = prev.totalFees + fillFee;
      // Total P&L = realized P&L - fees + unrealized P&L
      const newTotalPnL = newRealizedPnL - newTotalFees + prev.unrealizedPnL;

      return {
        ...prev,
        realizedPnL: newRealizedPnL,
        totalFees: newTotalFees,
        totalVolume: prev.totalVolume + fillVolume,
        recentFills: [fill, ...prev.recentFills],
        // Store per-fill volume (not cumulative) - chart computes cumulative
        volumeHistory: [...prev.volumeHistory, { time: now, value: fillVolume }],
        pnlHistory: [...prev.pnlHistory, { time: now, value: newTotalPnL }],
      };
    });
  }, []);

  const handleOrder = useCallback((order: Order) => {
    console.log('Processing order:', order.status, order);

    // Track open orders for showing exit prices
    if (order.status === 'NEW' || order.status === 'OPEN') {
      // Store the most recent open order for this market
      openOrdersRef.current.set(order.market, order);

      // Use the order's actual creation timestamp
      const orderTime = order.created_at;
      setState(prev => {
        const newCount = prev.ordersCreated + 1;
        // Add to history and sort by time to handle out-of-order arrivals
        const newHistory = [...prev.ordersHistory, { time: orderTime, value: newCount }]
          .sort((a, b) => a.time - b.time);

        // Recalculate cumulative values after sorting
        const recalculatedHistory = newHistory.map((point, index) => ({
          time: point.time,
          value: index + 1,
        }));

        return {
          ...prev,
          ordersCreated: newCount,
          ordersHistory: recalculatedHistory,
          openOrders: new Map(openOrdersRef.current),
        };
      });
    } else if (order.status === 'CLOSED' || order.status === 'CANCELED' || order.status === 'REJECTED') {
      // Remove closed/canceled orders
      const existingOrder = openOrdersRef.current.get(order.market);
      if (existingOrder?.id === order.id) {
        openOrdersRef.current.delete(order.market);
        setState(prev => ({
          ...prev,
          openOrders: new Map(openOrdersRef.current),
        }));
      }
    }
  }, []);

  const handlePosition = useCallback((wsPosition: WSPosition) => {
    console.log('Processing position:', wsPosition);

    // Update ref for quick P&L calculation
    if (wsPosition.status === 'CLOSED' || parseFloat(wsPosition.size) === 0) {
      positionsRef.current.delete(wsPosition.market);
    } else {
      positionsRef.current.set(wsPosition.market, wsPosition);
    }

    // Update state with positions array
    setState(prev => {
      const positionsArray: Position[] = [];
      positionsRef.current.forEach((pos, market) => {
        positionsArray.push({
          id: market, // Use market as ID for WS updates
          market,
          side: pos.side as 'LONG' | 'SHORT',
          status: 'OPEN',
          size: pos.size,
          leverage: pos.leverage,
          average_entry_price: pos.average_entry_price,
          average_entry_price_usd: pos.average_entry_price_usd,
          liquidation_price: pos.liquidation_price,
          unrealized_pnl: pos.unrealized_pnl,
          unrealized_funding_pnl: pos.unrealized_funding_pnl,
          realized_positional_pnl: pos.realized_positional_pnl,
          cost: pos.cost,
          cost_usd: pos.cost_usd,
        });
      });
      return { ...prev, positions: positionsArray };
    });

    updatePnLFromPositions();
  }, [updatePnLFromPositions]);

  const handleAccount = useCallback((account: AccountData) => {
    console.log('Processing account (raw):', JSON.stringify(account));
    const now = Date.now();
    // Try equity first, then account_value as fallback
    const newEquity = parseFloat(account.equity ?? '') || parseFloat(account.account_value ?? '') || 0;
    const newUnrealizedPnL = parseFloat(account.unrealized_pnl ?? '') || 0;

    console.log('Parsed account values - equity:', newEquity, 'unrealizedPnL:', newUnrealizedPnL);

    if (newEquity > 0) {
      setState(prev => {
        // Total P&L = realized P&L - fees + unrealized P&L
        const newTotalPnL = prev.realizedPnL - prev.totalFees + newUnrealizedPnL;
        return {
          ...prev,
          unrealizedPnL: newUnrealizedPnL,
          equity: newEquity,
          equityHistory: [...prev.equityHistory, { time: now, value: newEquity }],
          pnlHistory: [...prev.pnlHistory, { time: now, value: newTotalPnL }],
        };
      });
    }
  }, []);

  const handleBalanceEvent = useCallback((balance: BalanceEvent) => {
    console.log('Processing balance event:', balance);
    // Balance events are informational - realized P&L is tracked from fills
    // This handler is kept for logging/debugging purposes
  }, []);

  const processSubscriptionData = useCallback((channel: string, data: unknown) => {
    console.log('Subscription data received:', channel, data);

    if (channel === 'account') {
      handleAccount(data as AccountData);
    } else if (channel === 'positions') {
      const positions = Array.isArray(data) ? data : [data];
      positions.forEach((pos: Position) => handlePosition(pos));
    } else if (channel === 'balance_events') {
      handleBalanceEvent(data as BalanceEvent);
    } else if (channel.startsWith('fills.') || channel === 'fills') {
      const fills = Array.isArray(data) ? data : [data];
      fills.forEach((fill: Fill) => handleFill(fill));
    } else if (channel.startsWith('orders.') || channel === 'orders') {
      const orders = Array.isArray(data) ? data : [data];
      orders.forEach((order: Order) => handleOrder(order));
    }
  }, [handleFill, handleOrder, handlePosition, handleAccount, handleBalanceEvent]);

  const sendMessage = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback(() => {
    console.log('Subscribing to channels...');

    // Subscribe to account-level channels
    sendMessage({
      jsonrpc: '2.0',
      method: 'subscribe',
      params: { channel: 'account' },
      id: 1,
    });

    sendMessage({
      jsonrpc: '2.0',
      method: 'subscribe',
      params: { channel: 'positions' },
      id: 2,
    });

    sendMessage({
      jsonrpc: '2.0',
      method: 'subscribe',
      params: { channel: 'balance_events' },
      id: 3,
    });

    // Subscribe to ALL markets for fills and orders
    sendMessage({
      jsonrpc: '2.0',
      method: 'subscribe',
      params: { channel: 'fills.ALL' },
      id: 4,
    });

    sendMessage({
      jsonrpc: '2.0',
      method: 'subscribe',
      params: { channel: 'orders.ALL' },
      id: 5,
    });
  }, [sendMessage]);

  // Fetch initial positions via REST API
  const fetchInitialPositions = useCallback(async (token: string) => {
    try {
      console.log('Fetching initial positions...');
      const response = await fetch(`${REST_API_URL}/positions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch positions: ${response.status}`);
      }

      const data = await response.json();
      const positions: Position[] = (data.results || []).filter(
        (p: Position) => p.status === 'OPEN'
      );

      console.log('Fetched positions:', positions);

      // Update state with fetched positions
      positions.forEach(pos => {
        const wsPos: WSPosition = {
          market: pos.market,
          side: pos.side,
          status: pos.status,
          size: pos.size,
          leverage: pos.leverage,
          unrealized_pnl: pos.unrealized_pnl,
          unrealized_funding_pnl: pos.unrealized_funding_pnl,
          realized_positional_pnl: pos.realized_positional_pnl,
          average_entry_price: pos.average_entry_price,
          average_entry_price_usd: pos.average_entry_price_usd,
          liquidation_price: pos.liquidation_price,
          cost: pos.cost,
          cost_usd: pos.cost_usd,
        };
        positionsRef.current.set(pos.market, wsPos);
      });

      setState(prev => ({ ...prev, positions }));
      updatePnLFromPositions();
    } catch (err) {
      console.error('Failed to fetch initial positions:', err);
    }
  }, [updatePnLFromPositions]);

  // Fetch initial open orders via REST API
  const fetchInitialOrders = useCallback(async (token: string) => {
    try {
      console.log('Fetching initial open orders...');
      const response = await fetch(`${REST_API_URL}/orders?status=OPEN`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }

      const data = await response.json();
      const orders: Order[] = data.results || [];

      console.log('Fetched open orders:', orders);

      // Store orders by market (most recent per market)
      orders.forEach(order => {
        const existing = openOrdersRef.current.get(order.market);
        if (!existing || order.created_at > existing.created_at) {
          openOrdersRef.current.set(order.market, order);
        }
      });

      setState(prev => ({
        ...prev,
        openOrders: new Map(openOrdersRef.current),
      }));
    } catch (err) {
      console.error('Failed to fetch initial orders:', err);
    }
  }, []);

  // Re-authenticate when token refreshes (without reconnecting)
  useEffect(() => {
    // If already connected and we have a new token, just re-authenticate
    if (jwtToken && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('Re-authenticating WebSocket with refreshed token...');
      wsRef.current.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'auth',
        params: { bearer: jwtToken },
        id: 0,
      }));
    }
    jwtTokenRef.current = jwtToken;
  }, [jwtToken]);

  useEffect(() => {
    // Skip if we already have an active connection (token refresh is handled above)
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (!jwtToken) {
      return;
    }
    console.log('Connecting to WebSocket...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected, authenticating...');
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'auth',
        params: { bearer: jwtToken },
        id: 0,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        // Log all messages
        console.log('WS message:', message);

        // Handle subscription data (method: "subscription")
        if (message.method === 'subscription' && message.params) {
          const { channel, data } = message.params;
          processSubscriptionData(channel, data);
          return;
        }

        // Handle auth response (id: 0)
        if (message.id === 0) {
          if (message.error) {
            console.error('Auth failed:', message.error);
          } else {
            console.log('WebSocket authenticated');
            setIsConnected(true);
            subscribe();
            // Fetch initial data via REST API
            if (jwtToken) {
              fetchInitialPositions(jwtToken);
              fetchInitialOrders(jwtToken);
            }
          }
          return;
        }

        // Handle subscription confirmations (id: 1-5)
        if (message.id && message.result) {
          console.log('Subscription confirmed:', message.id, message.result);
          // id: 1 is the account subscription - result contains initial account data
          if (message.id === 1 && typeof message.result === 'object') {
            processSubscriptionData('account', message.result);
          }
          return;
        }

        // Handle errors
        if (message.error) {
          console.error('WebSocket error:', message.error);
        }
      } catch (err) {
        console.error('Failed to parse message:', err, event.data);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);
    };

    // Heartbeat to keep connection alive and verify it's working
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('WebSocket heartbeat - connection open, readyState:', ws.readyState);
      } else {
        console.log('WebSocket heartbeat - NOT open, readyState:', ws.readyState);
      }
    }, 10000);

    return () => {
      console.log('Closing WebSocket...');
      clearInterval(heartbeat);
      ws.close();
      wsRef.current = null;
    };
  }, [jwtToken, subscribe, processSubscriptionData, fetchInitialPositions, fetchInitialOrders]);

  useEffect(() => {
    if (onStateUpdate) {
      onStateUpdate(state);
    }
  }, [state, onStateUpdate]);

  return {
    isConnected,
    state,
  };
}
