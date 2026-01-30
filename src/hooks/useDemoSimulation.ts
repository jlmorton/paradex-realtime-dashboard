import { useState, useEffect, useRef, useCallback } from 'react';
import type { DashboardState, Fill, Position, Order, MarketStats, VolumeDataPoint } from '../types/paradex';

const ORDER_BUCKET_MS = 5000; // 5 second buckets

// Market configurations
const MARKETS = [
  { symbol: 'BTC-USD-PERP', basePrice: 97000, volatility: 500, tickSize: 0.5, minSize: 0.001 },
  { symbol: 'ETH-USD-PERP', basePrice: 3450, volatility: 50, tickSize: 0.01, minSize: 0.01 },
  { symbol: 'SOL-USD-PERP', basePrice: 195, volatility: 5, tickSize: 0.01, minSize: 0.1 },
  { symbol: 'ARB-USD-PERP', basePrice: 0.82, volatility: 0.02, tickSize: 0.0001, minSize: 10 },
];

interface MarketState {
  symbol: string;
  midPrice: number;
  buyOrders: Order[];
  sellOrders: Order[];
  position: Position | null;
}

let orderIdCounter = 1;
let fillIdCounter = 1;

function generateOrderId() {
  return `demo-order-${orderIdCounter++}`;
}

function generateFillId() {
  return `demo-fill-${fillIdCounter++}`;
}

function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function useDemoSimulation() {
  const [state, setState] = useState<DashboardState>(() => createInitialState());
  const marketStatesRef = useRef<Map<string, MarketState>>(new Map());
  const statsRef = useRef<Map<string, MarketStats>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize market states
  useEffect(() => {
    MARKETS.forEach(market => {
      marketStatesRef.current.set(market.symbol, {
        symbol: market.symbol,
        midPrice: market.basePrice,
        buyOrders: [],
        sellOrders: [],
        position: null,
      });
      statsRef.current.set(market.symbol, {
        market: market.symbol,
        realizedPnL: 0,
        unrealizedPnL: 0,
        fees: 0,
        volume: 0,
        orderCount: 0,
        fillCount: 0,
      });
    });
  }, []);

  const simulateTick = useCallback(() => {
    const now = Date.now();

    setState(prev => {
      let newRealizedPnL = prev.realizedPnL;
      let newUnrealizedPnL = 0;
      let newTotalFees = prev.totalFees;
      let newTotalVolume = prev.totalVolume;
      let newOrdersCreated = prev.ordersCreated;
      const newFills: Fill[] = [];
      const newVolumePoints: VolumeDataPoint[] = [];
      const orderCounts: Record<string, number> = {};
      const newPositions: Position[] = [];
      const newOpenOrders = new Map(prev.openOrders);
      const newAllOpenOrders = new Map<string, Order[]>();
      const newLastOrderTimes = new Map(prev.lastOrderTimeByMarket);
      const newLastFillTimes = new Map(prev.lastFillTimeByMarket);

      MARKETS.forEach(marketConfig => {
        const marketState = marketStatesRef.current.get(marketConfig.symbol)!;
        const stats = statsRef.current.get(marketConfig.symbol)!;

        // Update mid price with random walk (larger moves = more fills)
        const priceChange = (Math.random() - 0.5) * marketConfig.volatility * 0.3;
        marketState.midPrice = roundToTick(
          marketState.midPrice + priceChange,
          marketConfig.tickSize
        );

        // Determine which side to place orders on based on position
        // If we have a position, only place orders on the opposite side (exit orders)
        let allowedSide: 'BUY' | 'SELL' | 'BOTH' = 'BOTH';
        if (marketState.position) {
          allowedSide = marketState.position.side === 'LONG' ? 'SELL' : 'BUY';
        }

        // Randomly place new orders (50% chance per tick per market)
        // Max 3 orders per side
        const maxOrdersPerSide = 3;
        if (Math.random() < 0.5) {
          let side: 'BUY' | 'SELL';
          if (allowedSide === 'BOTH') {
            side = Math.random() < 0.5 ? 'BUY' : 'SELL';
          } else {
            side = allowedSide;
          }

          // Check if we already have max orders on this side
          const currentCount = side === 'BUY' ? marketState.buyOrders.length : marketState.sellOrders.length;
          if (currentCount < maxOrdersPerSide) {
            // Place orders closer to mid price so they cross more often
            const offset = randomBetween(0.0005, 0.008) * marketState.midPrice;
            const price = roundToTick(
              side === 'BUY' ? marketState.midPrice - offset : marketState.midPrice + offset,
              marketConfig.tickSize
            );
            const size = roundToTick(
              marketConfig.minSize * randomBetween(1, 5),
              marketConfig.minSize
            );

            const order: Order = {
              id: generateOrderId(),
              market: marketConfig.symbol,
              side,
              type: 'LIMIT',
              size: size.toString(),
              price: price.toString(),
              status: 'OPEN',
              created_at: now,
            };

            if (side === 'BUY') {
              marketState.buyOrders.push(order);
            } else {
              marketState.sellOrders.push(order);
            }

            newOrdersCreated++;
            stats.orderCount++;
            newLastOrderTimes.set(marketConfig.symbol, now);
            const baseMarket = marketConfig.symbol.split('-')[0];
            orderCounts[baseMarket] = (orderCounts[baseMarket] || 0) + 1;
          }
        }

        // Check for fills (orders that cross the mid price)
        const filledBuyOrders: Order[] = [];
        const filledSellOrders: Order[] = [];

        marketState.buyOrders = marketState.buyOrders.filter(order => {
          if (parseFloat(order.price) >= marketState.midPrice) {
            filledBuyOrders.push(order);
            return false;
          }
          return true;
        });

        marketState.sellOrders = marketState.sellOrders.filter(order => {
          if (parseFloat(order.price) <= marketState.midPrice) {
            filledSellOrders.push(order);
            return false;
          }
          return true;
        });

        // Process fills
        [...filledBuyOrders, ...filledSellOrders].forEach(order => {
          const fillPrice = parseFloat(order.price);
          const fillSize = parseFloat(order.size);
          const fillVolume = fillPrice * fillSize;
          const fee = fillVolume * 0.0002; // 2bps fee

          // Calculate P&L from position
          let realizedPnL = 0;
          if (marketState.position) {
            const posSize = parseFloat(marketState.position.size);
            const entryPrice = parseFloat(marketState.position.average_entry_price);
            const isClosing =
              (marketState.position.side === 'LONG' && order.side === 'SELL') ||
              (marketState.position.side === 'SHORT' && order.side === 'BUY');

            if (isClosing) {
              const closeSize = Math.min(fillSize, posSize);
              if (marketState.position.side === 'LONG') {
                realizedPnL = (fillPrice - entryPrice) * closeSize;
              } else {
                realizedPnL = (entryPrice - fillPrice) * closeSize;
              }
            }
          }

          const fill: Fill = {
            id: generateFillId(),
            market: marketConfig.symbol,
            side: order.side,
            size: order.size,
            price: order.price,
            realized_pnl: realizedPnL.toFixed(2),
            fee: fee.toFixed(2),
            created_at: now,
            order_id: order.id,
            trade_type: 'FILL',
          };

          newFills.push(fill);
          newVolumePoints.push({ time: now, value: fillVolume, market: marketConfig.symbol });

          newRealizedPnL += realizedPnL;
          newTotalFees += fee;
          newTotalVolume += fillVolume;
          stats.realizedPnL += realizedPnL;
          stats.fees += fee;
          stats.volume += fillVolume;
          stats.fillCount++;
          newLastFillTimes.set(marketConfig.symbol, now);

          // Update position
          if (!marketState.position) {
            marketState.position = {
              id: `pos-${marketConfig.symbol}`,
              market: marketConfig.symbol,
              side: order.side === 'BUY' ? 'LONG' : 'SHORT',
              status: 'OPEN',
              size: order.size,
              leverage: '3',
              average_entry_price: order.price,
              unrealized_pnl: '0',
              realized_positional_pnl: realizedPnL.toFixed(2),
              liquidation_price: (
                order.side === 'BUY'
                  ? fillPrice * 0.7
                  : fillPrice * 1.3
              ).toFixed(2),
              cost: (fillVolume / 3).toFixed(2),
            };
          } else {
            const posSize = parseFloat(marketState.position.size);
            const entryPrice = parseFloat(marketState.position.average_entry_price);
            const isAdding =
              (marketState.position.side === 'LONG' && order.side === 'BUY') ||
              (marketState.position.side === 'SHORT' && order.side === 'SELL');

            if (isAdding) {
              // Adding to position
              const newSize = posSize + fillSize;
              const newAvgPrice = (posSize * entryPrice + fillSize * fillPrice) / newSize;
              marketState.position.size = newSize.toFixed(6);
              marketState.position.average_entry_price = newAvgPrice.toFixed(2);
            } else {
              // Reducing position
              const newSize = posSize - fillSize;
              if (newSize <= 0.0001) {
                marketState.position = null;
              } else {
                marketState.position.size = newSize.toFixed(6);
              }
            }

            if (marketState.position) {
              marketState.position.realized_positional_pnl = (
                parseFloat(marketState.position.realized_positional_pnl || '0') + realizedPnL
              ).toFixed(2);
            }
          }
        });

        // Update unrealized P&L for open positions
        if (marketState.position) {
          const posSize = parseFloat(marketState.position.size);
          const entryPrice = parseFloat(marketState.position.average_entry_price);
          const unrealizedPnL =
            marketState.position.side === 'LONG'
              ? (marketState.midPrice - entryPrice) * posSize
              : (entryPrice - marketState.midPrice) * posSize;

          marketState.position.unrealized_pnl = unrealizedPnL.toFixed(2);
          stats.unrealizedPnL = unrealizedPnL;
          newUnrealizedPnL += unrealizedPnL;
          newPositions.push(marketState.position);

          // Update exit order display
          const exitOrder = marketState.position.side === 'LONG'
            ? marketState.sellOrders[0]
            : marketState.buyOrders[0];
          if (exitOrder) {
            newOpenOrders.set(marketConfig.symbol, exitOrder);
          } else {
            newOpenOrders.delete(marketConfig.symbol);
          }
        }

        // Build allOpenOrders
        const allOrders = [...marketState.buyOrders, ...marketState.sellOrders];
        if (allOrders.length > 0) {
          newAllOpenOrders.set(marketConfig.symbol, allOrders);
        }

        // Randomly cancel old orders (20% chance) - keep max 3 per side
        if (Math.random() < 0.2) {
          if (marketState.buyOrders.length > 2) {
            marketState.buyOrders.shift();
          }
          if (marketState.sellOrders.length > 2) {
            marketState.sellOrders.shift();
          }
        }

        // Clear orders on the wrong side if we have a position
        if (marketState.position) {
          if (marketState.position.side === 'LONG') {
            marketState.buyOrders = []; // Clear buy orders when long
          } else {
            marketState.sellOrders = []; // Clear sell orders when short
          }
        }
      });

      // Calculate total P&L and new equity
      const totalPnL = newRealizedPnL - newTotalFees + newUnrealizedPnL;
      const baseEquity = 10000;
      const newEquity = baseEquity + totalPnL;

      // Append to history arrays (no limit - keep full session history)
      const newPnlHistory = [
        ...prev.pnlHistory,
        { time: now, value: totalPnL },
      ];
      const newEquityHistory = [
        ...prev.equityHistory,
        { time: now, value: newEquity },
      ];
      const newVolumeHistory = [
        ...prev.volumeHistory,
        ...newVolumePoints,
      ];
      // Update orders history with time buckets
      const bucketTime = Math.floor(now / ORDER_BUCKET_MS) * ORDER_BUCKET_MS;
      const newOrdersHistory = [...prev.ordersHistory];

      // Find or create the current bucket
      const lastBucket = newOrdersHistory[newOrdersHistory.length - 1];
      if (lastBucket && lastBucket.time === bucketTime) {
        // Add to existing bucket
        const updatedCounts = { ...lastBucket.counts };
        for (const [market, count] of Object.entries(orderCounts)) {
          updatedCounts[market] = (updatedCounts[market] || 0) + count;
        }
        newOrdersHistory[newOrdersHistory.length - 1] = { time: bucketTime, counts: updatedCounts };
      } else if (Object.keys(orderCounts).length > 0) {
        // Create new bucket
        newOrdersHistory.push({ time: bucketTime, counts: orderCounts });
      }

      return {
        ...prev,
        realizedPnL: newRealizedPnL,
        unrealizedPnL: newUnrealizedPnL,
        totalFees: newTotalFees,
        totalVolume: newTotalVolume,
        ordersCreated: newOrdersCreated,
        equity: newEquity,
        pnlHistory: newPnlHistory,
        volumeHistory: newVolumeHistory,
        ordersHistory: newOrdersHistory,
        equityHistory: newEquityHistory,
        recentFills: [...newFills, ...prev.recentFills],
        positions: newPositions,
        openOrders: newOpenOrders,
        allOpenOrders: newAllOpenOrders,
        lastOrderTimeByMarket: newLastOrderTimes,
        lastFillTimeByMarket: newLastFillTimes,
        marketStats: new Map(statsRef.current),
      };
    });
  }, []);

  // Start simulation
  useEffect(() => {
    // Initial orders - place 2 per side
    MARKETS.forEach(marketConfig => {
      const marketState = marketStatesRef.current.get(marketConfig.symbol)!;
      for (let i = 0; i < 2; i++) {
        const buyOffset = randomBetween(0.005, 0.015) * marketConfig.basePrice * (i + 1);
        const sellOffset = randomBetween(0.005, 0.015) * marketConfig.basePrice * (i + 1);

        marketState.buyOrders.push({
          id: generateOrderId(),
          market: marketConfig.symbol,
          side: 'BUY',
          type: 'LIMIT',
          size: (marketConfig.minSize * randomBetween(1, 3)).toFixed(6),
          price: roundToTick(marketConfig.basePrice - buyOffset, marketConfig.tickSize).toString(),
          status: 'OPEN',
          created_at: Date.now(),
        });

        marketState.sellOrders.push({
          id: generateOrderId(),
          market: marketConfig.symbol,
          side: 'SELL',
          type: 'LIMIT',
          size: (marketConfig.minSize * randomBetween(1, 3)).toFixed(6),
          price: roundToTick(marketConfig.basePrice + sellOffset, marketConfig.tickSize).toString(),
          status: 'OPEN',
          created_at: Date.now(),
        });
      }
    });

    // Run simulation every 300ms for faster activity
    intervalRef.current = setInterval(simulateTick, 300);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [simulateTick]);

  return { state };
}

function createInitialState(): DashboardState {
  return {
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalFees: 0,
    totalVolume: 0,
    ordersCreated: 0,
    equity: 10000,
    pnlHistory: [],
    volumeHistory: [],
    ordersHistory: [],
    equityHistory: [{ time: Date.now(), value: 10000 }],
    recentFills: [],
    positions: [],
    openOrders: new Map(),
    allOpenOrders: new Map(),
    lastOrderTimeByMarket: new Map(),
    lastFillTimeByMarket: new Map(),
    marketStats: new Map(),
  };
}
