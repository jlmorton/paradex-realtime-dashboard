import { useEffect, useRef, useState, useCallback } from 'react';
import type { Fill, Order, DashboardState } from '../types/paradex';

const WS_URL = 'wss://ws.api.prod.paradex.trade/v1';

interface UseWebSocketOptions {
  jwtToken: string | null;
  onStateUpdate?: (state: DashboardState) => void;
}

interface Position {
  market: string;
  side: string;
  size: string;
  unrealized_pnl: string;
  realized_positional_pnl: string;
  average_entry_price: string;
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
  });

  // Track positions for aggregating P&L
  const positionsRef = useRef<Map<string, Position>>(new Map());

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
    if (order.status === 'NEW' || order.status === 'OPEN') {
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
        };
      });
    }
  }, []);

  const handlePosition = useCallback((position: Position) => {
    console.log('Processing position:', position);
    positionsRef.current.set(position.market, position);
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

  useEffect(() => {
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
  }, [jwtToken, subscribe, processSubscriptionData]);

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
