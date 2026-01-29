import { useEffect, useRef, useState, useCallback } from 'react';
import type { Fill, Order, Position, DashboardState, VolumeDataPoint, MarketStats } from '../types/paradex';

const WS_URL = 'wss://ws.api.prod.paradex.trade/v1';
const REST_API_URL = 'https://api.prod.paradex.trade/v1';

// Performance tuning
const STATE_UPDATE_INTERVAL_MS = 100; // Batch state updates every 100ms
const MAX_HISTORY_POINTS = 1000; // Limit chart data points
const DEBUG = false; // Set to true to enable console logging

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

// Pending state updates to batch
interface PendingUpdates {
  fills: Fill[];
  pnlPoints: { time: number; value: number }[];
  volumePoints: VolumeDataPoint[];
  equityPoints: { time: number; value: number }[];
  orderPoints: { time: number; value: number }[];
  realizedPnLDelta: number;
  feesDelta: number;
  volumeDelta: number;
  newOrdersCount: number;
  equity: number | null;
  unrealizedPnL: number | null;
  positionsChanged: boolean;
  ordersChanged: boolean;
  allOrdersChanged: boolean;
  lastOrderTimes: Map<string, number>; // market -> timestamp
  lastFillTimes: Map<string, number>; // market -> timestamp of last fill
  marketStatsChanged: boolean;
}

function createEmptyPendingUpdates(): PendingUpdates {
  return {
    fills: [],
    pnlPoints: [],
    volumePoints: [],
    equityPoints: [],
    orderPoints: [],
    realizedPnLDelta: 0,
    feesDelta: 0,
    volumeDelta: 0,
    newOrdersCount: 0,
    equity: null,
    unrealizedPnL: null,
    positionsChanged: false,
    ordersChanged: false,
    allOrdersChanged: false,
    lastOrderTimes: new Map(),
    lastFillTimes: new Map(),
    marketStatsChanged: false,
  };
}

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
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
    allOpenOrders: new Map(),
    lastOrderTimeByMarket: new Map(),
    lastFillTimeByMarket: new Map(),
    marketStats: new Map(),
  });

  // Track positions for aggregating P&L (internal ref for quick lookup)
  const positionsRef = useRef<Map<string, WSPosition>>(new Map());
  // Track open orders by market for showing exit prices
  const openOrdersRef = useRef<Map<string, Order>>(new Map());
  // Track all open orders by market (for tiers display)
  const allOpenOrdersRef = useRef<Map<string, Map<string, Order>>>(new Map()); // market -> orderId -> Order
  // Track last order time per market
  const lastOrderTimeRef = useRef<Map<string, number>>(new Map());
  // Track last fill time per market (for position size changes)
  const lastFillTimeRef = useRef<Map<string, number>>(new Map());
  // Track per-market statistics
  const marketStatsRef = useRef<Map<string, MarketStats>>(new Map());

  // Batched updates
  const pendingUpdatesRef = useRef<PendingUpdates>(createEmptyPendingUpdates());
  const updateScheduledRef = useRef(false);
  const stateRef = useRef(state);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Flush pending updates to state
  const flushUpdates = useCallback(() => {
    updateScheduledRef.current = false;
    const pending = pendingUpdatesRef.current;

    // Skip if nothing to update
    if (
      pending.fills.length === 0 &&
      pending.pnlPoints.length === 0 &&
      pending.volumePoints.length === 0 &&
      pending.equityPoints.length === 0 &&
      pending.orderPoints.length === 0 &&
      pending.realizedPnLDelta === 0 &&
      pending.feesDelta === 0 &&
      pending.volumeDelta === 0 &&
      pending.newOrdersCount === 0 &&
      pending.equity === null &&
      pending.unrealizedPnL === null &&
      !pending.positionsChanged &&
      !pending.ordersChanged &&
      !pending.allOrdersChanged &&
      pending.lastOrderTimes.size === 0 &&
      pending.lastFillTimes.size === 0 &&
      !pending.marketStatsChanged
    ) {
      return;
    }

    setState(prev => {
      const newRealizedPnL = prev.realizedPnL + pending.realizedPnLDelta;
      const newTotalFees = prev.totalFees + pending.feesDelta;
      const newTotalVolume = prev.totalVolume + pending.volumeDelta;
      const newOrdersCount = prev.ordersCreated + pending.newOrdersCount;
      const newEquity = pending.equity ?? prev.equity;
      const newUnrealizedPnL = pending.unrealizedPnL ?? prev.unrealizedPnL;

      // Build positions array if changed
      let newPositions = prev.positions;
      if (pending.positionsChanged) {
        newPositions = [];
        positionsRef.current.forEach((pos, market) => {
          newPositions.push({
            id: market,
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
      }

      // Limit history arrays to prevent unbounded growth
      const limitArray = <T,>(arr: T[], newItems: T[], max: number): T[] => {
        if (newItems.length === 0) return arr;
        const combined = [...arr, ...newItems];
        return combined.length > max ? combined.slice(-max) : combined;
      };

      return {
        ...prev,
        realizedPnL: newRealizedPnL,
        totalFees: newTotalFees,
        totalVolume: newTotalVolume,
        ordersCreated: newOrdersCount,
        equity: newEquity,
        unrealizedPnL: newUnrealizedPnL,
        recentFills: pending.fills.length > 0
          ? [...pending.fills.reverse(), ...prev.recentFills].slice(0, 100)
          : prev.recentFills,
        pnlHistory: limitArray(prev.pnlHistory, pending.pnlPoints, MAX_HISTORY_POINTS),
        volumeHistory: limitArray(prev.volumeHistory, pending.volumePoints, MAX_HISTORY_POINTS),
        equityHistory: limitArray(prev.equityHistory, pending.equityPoints, MAX_HISTORY_POINTS),
        ordersHistory: pending.orderPoints.length > 0
          ? limitArray(prev.ordersHistory, pending.orderPoints, MAX_HISTORY_POINTS)
              .sort((a, b) => a.time - b.time)
              .map((point, index) => ({ time: point.time, value: index + 1 }))
          : prev.ordersHistory,
        positions: newPositions,
        openOrders: pending.ordersChanged ? new Map(openOrdersRef.current) : prev.openOrders,
        allOpenOrders: pending.allOrdersChanged
          ? new Map(
              Array.from(allOpenOrdersRef.current.entries()).map(([market, ordersMap]) => [
                market,
                Array.from(ordersMap.values()),
              ])
            )
          : prev.allOpenOrders,
        lastOrderTimeByMarket: pending.lastOrderTimes.size > 0
          ? new Map([...prev.lastOrderTimeByMarket, ...lastOrderTimeRef.current])
          : prev.lastOrderTimeByMarket,
        lastFillTimeByMarket: pending.lastFillTimes.size > 0
          ? new Map([...prev.lastFillTimeByMarket, ...lastFillTimeRef.current])
          : prev.lastFillTimeByMarket,
        marketStats: pending.marketStatsChanged
          ? new Map(marketStatsRef.current)
          : prev.marketStats,
      };
    });

    // Reset pending updates
    pendingUpdatesRef.current = createEmptyPendingUpdates();
  }, []);

  // Schedule a batched update
  const scheduleUpdate = useCallback(() => {
    if (!updateScheduledRef.current) {
      updateScheduledRef.current = true;
      setTimeout(flushUpdates, STATE_UPDATE_INTERVAL_MS);
    }
  }, [flushUpdates]);

  const handleFill = useCallback((fill: Fill) => {
    log('Processing fill:', fill);
    const pending = pendingUpdatesRef.current;

    const fillVolume = parseFloat(fill.price) * parseFloat(fill.size);
    const fillRealizedPnL = parseFloat(fill.realized_pnl) || 0;
    const fillFee = parseFloat(fill.fee) || 0;
    const now = Date.now();

    pending.fills.push(fill);
    pending.realizedPnLDelta += fillRealizedPnL;
    pending.feesDelta += fillFee;
    pending.volumeDelta += fillVolume;
    pending.volumePoints.push({ time: now, value: fillVolume, market: fill.market });

    // Update per-market stats
    const stats = marketStatsRef.current.get(fill.market) || {
      market: fill.market,
      realizedPnL: 0,
      unrealizedPnL: 0,
      fees: 0,
      volume: 0,
      orderCount: 0,
      fillCount: 0,
    };
    stats.realizedPnL += fillRealizedPnL;
    stats.fees += fillFee;
    stats.volume += fillVolume;
    stats.fillCount += 1;
    marketStatsRef.current.set(fill.market, stats);
    pending.marketStatsChanged = true;

    // Track last fill time for this market (position size changed)
    lastFillTimeRef.current.set(fill.market, now);
    pending.lastFillTimes.set(fill.market, now);

    // Calculate new total P&L for chart
    const currentState = stateRef.current;
    const newRealizedPnL = currentState.realizedPnL + pending.realizedPnLDelta;
    const newTotalFees = currentState.totalFees + pending.feesDelta;
    const unrealizedPnL = pending.unrealizedPnL ?? currentState.unrealizedPnL;
    const newTotalPnL = newRealizedPnL - newTotalFees + unrealizedPnL;
    pending.pnlPoints.push({ time: now, value: newTotalPnL });

    scheduleUpdate();
  }, [scheduleUpdate]);

  const handleOrder = useCallback((order: Order) => {
    log('Processing order:', order.status, order);
    const pending = pendingUpdatesRef.current;

    // Track last order time for this market (for all order statuses)
    const orderTime = order.updated_at || order.created_at;
    lastOrderTimeRef.current.set(order.market, orderTime);
    pending.lastOrderTimes.set(order.market, orderTime);

    if (order.status === 'NEW' || order.status === 'OPEN') {
      openOrdersRef.current.set(order.market, order);
      pending.ordersChanged = true;
      pending.newOrdersCount++;
      pending.orderPoints.push({ time: order.created_at, value: 0 }); // Value recalculated on flush

      // Track in allOpenOrders
      if (!allOpenOrdersRef.current.has(order.market)) {
        allOpenOrdersRef.current.set(order.market, new Map());
      }
      allOpenOrdersRef.current.get(order.market)!.set(order.id, order);
      pending.allOrdersChanged = true;

      // Update per-market order count
      const stats = marketStatsRef.current.get(order.market) || {
        market: order.market,
        realizedPnL: 0,
        unrealizedPnL: 0,
        fees: 0,
        volume: 0,
        orderCount: 0,
        fillCount: 0,
      };
      stats.orderCount += 1;
      marketStatsRef.current.set(order.market, stats);
      pending.marketStatsChanged = true;

      scheduleUpdate();
    } else if (order.status === 'CLOSED' || order.status === 'CANCELED' || order.status === 'REJECTED') {
      const existingOrder = openOrdersRef.current.get(order.market);
      if (existingOrder?.id === order.id) {
        openOrdersRef.current.delete(order.market);
        pending.ordersChanged = true;
      }

      // Remove from allOpenOrders
      const marketOrders = allOpenOrdersRef.current.get(order.market);
      if (marketOrders) {
        marketOrders.delete(order.id);
        if (marketOrders.size === 0) {
          allOpenOrdersRef.current.delete(order.market);
        }
        pending.allOrdersChanged = true;
      }

      scheduleUpdate();
    }
  }, [scheduleUpdate]);

  const handlePosition = useCallback((wsPosition: WSPosition) => {
    log('Processing position:', wsPosition);
    const pending = pendingUpdatesRef.current;

    // Update ref for quick P&L calculation
    if (wsPosition.status === 'CLOSED' || parseFloat(wsPosition.size) === 0) {
      positionsRef.current.delete(wsPosition.market);
      // Clear unrealized P&L for this market
      const stats = marketStatsRef.current.get(wsPosition.market);
      if (stats) {
        stats.unrealizedPnL = 0;
        pending.marketStatsChanged = true;
      }
    } else {
      positionsRef.current.set(wsPosition.market, wsPosition);
      // Update unrealized P&L for this market
      const stats = marketStatsRef.current.get(wsPosition.market) || {
        market: wsPosition.market,
        realizedPnL: 0,
        unrealizedPnL: 0,
        fees: 0,
        volume: 0,
        orderCount: 0,
        fillCount: 0,
      };
      stats.unrealizedPnL = parseFloat(wsPosition.unrealized_pnl) || 0;
      marketStatsRef.current.set(wsPosition.market, stats);
      pending.marketStatsChanged = true;
    }

    // Calculate total unrealized P&L
    let totalUnrealized = 0;
    positionsRef.current.forEach(pos => {
      totalUnrealized += parseFloat(pos.unrealized_pnl) || 0;
    });

    pending.unrealizedPnL = totalUnrealized;
    pending.positionsChanged = true;

    // Add P&L point
    const now = Date.now();
    const currentState = stateRef.current;
    const realizedPnL = currentState.realizedPnL + pending.realizedPnLDelta;
    const totalFees = currentState.totalFees + pending.feesDelta;
    const newTotalPnL = realizedPnL - totalFees + totalUnrealized;
    pending.pnlPoints.push({ time: now, value: newTotalPnL });

    scheduleUpdate();
  }, [scheduleUpdate]);

  const handleAccount = useCallback((account: AccountData) => {
    log('Processing account:', account);
    const pending = pendingUpdatesRef.current;
    const now = Date.now();

    const newEquity = parseFloat(account.equity ?? '') || parseFloat(account.account_value ?? '') || 0;
    const newUnrealizedPnL = parseFloat(account.unrealized_pnl ?? '') || 0;

    if (newEquity > 0) {
      pending.equity = newEquity;
      pending.equityPoints.push({ time: now, value: newEquity });
    }

    if (newUnrealizedPnL !== 0 || account.unrealized_pnl !== undefined) {
      pending.unrealizedPnL = newUnrealizedPnL;

      // Add P&L point
      const currentState = stateRef.current;
      const realizedPnL = currentState.realizedPnL + pending.realizedPnLDelta;
      const totalFees = currentState.totalFees + pending.feesDelta;
      const newTotalPnL = realizedPnL - totalFees + newUnrealizedPnL;
      pending.pnlPoints.push({ time: now, value: newTotalPnL });
    }

    scheduleUpdate();
  }, [scheduleUpdate]);

  const handleBalanceEvent = useCallback((balance: BalanceEvent) => {
    log('Processing balance event:', balance);
    // Balance events are informational - realized P&L is tracked from fills
  }, []);

  const processSubscriptionData = useCallback((channel: string, data: unknown) => {
    log('Subscription data received:', channel);

    if (channel === 'account') {
      handleAccount(data as AccountData);
    } else if (channel === 'positions') {
      const positions = Array.isArray(data) ? data : [data];
      positions.forEach((pos: WSPosition) => handlePosition(pos));
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
    log('Subscribing to channels...');

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
      log('Fetching initial positions...');
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

      log('Fetched positions:', positions.length);

      // Update refs
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

      // Calculate unrealized P&L
      let totalUnrealized = 0;
      positionsRef.current.forEach(pos => {
        totalUnrealized += parseFloat(pos.unrealized_pnl) || 0;
      });

      setState(prev => ({
        ...prev,
        positions,
        unrealizedPnL: totalUnrealized,
      }));
    } catch (err) {
      console.error('Failed to fetch initial positions:', err);
    }
  }, []);

  // Fetch initial open orders via REST API
  const fetchInitialOrders = useCallback(async (token: string) => {
    try {
      log('Fetching initial open orders...');
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

      log('Fetched open orders:', orders.length);

      // Store orders by market (most recent per market) and all orders
      orders.forEach(order => {
        const existing = openOrdersRef.current.get(order.market);
        if (!existing || order.created_at > existing.created_at) {
          openOrdersRef.current.set(order.market, order);
        }

        // Track in allOpenOrders
        if (!allOpenOrdersRef.current.has(order.market)) {
          allOpenOrdersRef.current.set(order.market, new Map());
        }
        allOpenOrdersRef.current.get(order.market)!.set(order.id, order);
      });

      setState(prev => ({
        ...prev,
        openOrders: new Map(openOrdersRef.current),
        allOpenOrders: new Map(
          Array.from(allOpenOrdersRef.current.entries()).map(([market, ordersMap]) => [
            market,
            Array.from(ordersMap.values()),
          ])
        ),
      }));
    } catch (err) {
      console.error('Failed to fetch initial orders:', err);
    }
  }, []);

  // Re-authenticate when token refreshes (without reconnecting)
  useEffect(() => {
    // If already connected and we have a new token, just re-authenticate
    if (jwtToken && wsRef.current?.readyState === WebSocket.OPEN) {
      log('Re-authenticating WebSocket with refreshed token...');
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
    log('Connecting to WebSocket...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      log('WebSocket connected, authenticating...');
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
            log('WebSocket authenticated');
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
          log('Subscription confirmed:', message.id);
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
        console.error('Failed to parse message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = (event) => {
      log('WebSocket disconnected:', event.code, event.reason);
      setIsConnected(false);
    };

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (DEBUG && ws.readyState === WebSocket.OPEN) {
        log('WebSocket heartbeat - connection open');
      }
    }, 10000);

    return () => {
      log('Closing WebSocket...');
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
