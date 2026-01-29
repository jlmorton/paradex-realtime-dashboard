import { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { Order, MarketConfig } from '../types/paradex';
import { formatPriceWithConfig, formatSizeWithConfig } from '../hooks/useMarketConfig';
import { MarketIcon } from './MarketIcon';

interface OrderTiersProps {
  allOpenOrders: Map<string, Order[]>;
  marketConfigs: Map<string, MarketConfig>;
}

interface MarketOrderSummary {
  market: string;
  shortName: string;
  buyOrders: Order[];
  sellOrders: Order[];
  hasOrders: boolean;
}

const MARKET_TIMEOUT_MS = 60000; // 60 seconds before removing empty markets
const ORDER_CACHE_MS = 1500; // 1.5 second grace period before showing "0 orders"
const MAX_TIERS_SHOWN = 5;

interface CachedOrders {
  orders: Order[];
  removedAt: number | null;
}

export const OrderTiers = memo(function OrderTiers({ allOpenOrders, marketConfigs }: OrderTiersProps) {
  // Track when each market was last seen with orders
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  // Cache for buy/sell orders per market to prevent flashing
  const orderCacheRef = useRef<Map<string, CachedOrders>>(new Map());
  const [, forceUpdate] = useState(0);

  // Update last seen times and trigger cleanup
  useEffect(() => {
    const now = Date.now();
    const timeouts: NodeJS.Timeout[] = [];

    // Update last seen for markets that have orders
    allOpenOrders.forEach((orders, market) => {
      if (orders.length > 0) {
        lastSeenRef.current.set(market, now);
      }
    });

    // Set timeout to clear order caches after grace period
    orderCacheRef.current.forEach((cached) => {
      if (cached.removedAt !== null && now - cached.removedAt < ORDER_CACHE_MS) {
        const timeout = setTimeout(() => {
          forceUpdate(n => n + 1);
        }, ORDER_CACHE_MS - (now - cached.removedAt) + 50);
        timeouts.push(timeout);
      }
    });

    // Set up interval to clean up stale markets
    const cleanup = setInterval(() => {
      const now = Date.now();
      let changed = false;

      lastSeenRef.current.forEach((lastSeen, market) => {
        if (now - lastSeen > MARKET_TIMEOUT_MS && !allOpenOrders.has(market)) {
          lastSeenRef.current.delete(market);
          changed = true;
        }
      });

      // Clean up expired order caches
      orderCacheRef.current.forEach((cached, key) => {
        if (cached.removedAt !== null && now - cached.removedAt >= ORDER_CACHE_MS) {
          orderCacheRef.current.delete(key);
          changed = true;
        }
      });

      if (changed) {
        forceUpdate(n => n + 1);
      }
    }, 5000); // Check every 5 seconds

    return () => {
      clearInterval(cleanup);
      timeouts.forEach(t => clearTimeout(t));
    };
  }, [allOpenOrders]);

  const marketSummaries = useMemo(() => {
    const summaries: MarketOrderSummary[] = [];
    const now = Date.now();

    // Get all markets that currently have orders
    const marketsWithOrders = new Set<string>();
    allOpenOrders.forEach((orders, market) => {
      if (orders.length > 0) {
        marketsWithOrders.add(market);
      }
    });

    // Get all markets to display (current + recently seen)
    const marketsToShow = new Set<string>(marketsWithOrders);
    lastSeenRef.current.forEach((lastSeen, market) => {
      if (now - lastSeen <= MARKET_TIMEOUT_MS) {
        marketsToShow.add(market);
      }
    });

    marketsToShow.forEach(market => {
      const orders = allOpenOrders.get(market) || [];
      let buyOrders = orders
        .filter(o => o.side === 'BUY')
        .sort((a, b) => parseFloat(b.price) - parseFloat(a.price)); // Highest first
      let sellOrders = orders
        .filter(o => o.side === 'SELL')
        .sort((a, b) => parseFloat(a.price) - parseFloat(b.price)); // Lowest first

      // Cache logic for buy orders
      const buyCacheKey = `${market}-BUY`;
      const buyCached = orderCacheRef.current.get(buyCacheKey);
      if (buyOrders.length > 0) {
        orderCacheRef.current.set(buyCacheKey, { orders: buyOrders, removedAt: null });
      } else if (buyCached) {
        if (buyCached.removedAt === null) {
          // Just disappeared - mark removal time
          orderCacheRef.current.set(buyCacheKey, { ...buyCached, removedAt: now });
          buyOrders = buyCached.orders;
        } else if (now - buyCached.removedAt < ORDER_CACHE_MS) {
          // Within grace period - show cached
          buyOrders = buyCached.orders;
        }
      }

      // Cache logic for sell orders
      const sellCacheKey = `${market}-SELL`;
      const sellCached = orderCacheRef.current.get(sellCacheKey);
      if (sellOrders.length > 0) {
        orderCacheRef.current.set(sellCacheKey, { orders: sellOrders, removedAt: null });
      } else if (sellCached) {
        if (sellCached.removedAt === null) {
          // Just disappeared - mark removal time
          orderCacheRef.current.set(sellCacheKey, { ...sellCached, removedAt: now });
          sellOrders = sellCached.orders;
        } else if (now - sellCached.removedAt < ORDER_CACHE_MS) {
          // Within grace period - show cached
          sellOrders = sellCached.orders;
        }
      }

      summaries.push({
        market,
        shortName: market.split('-')[0],
        buyOrders,
        sellOrders,
        hasOrders: orders.length > 0 || buyOrders.length > 0 || sellOrders.length > 0,
      });
    });

    // Sort alphabetically by market name for stable ordering
    return summaries.sort((a, b) => a.market.localeCompare(b.market));
  }, [allOpenOrders]);

  const renderOrderList = useCallback((orders: Order[], side: 'BUY' | 'SELL', market: string) => {
    const visibleOrders = orders.slice(0, MAX_TIERS_SHOWN);
    const hiddenCount = orders.length - MAX_TIERS_SHOWN;
    const colorClass = side === 'BUY' ? 'text-paradex-green' : 'text-paradex-red';
    const label = side === 'BUY' ? 'BIDS' : 'ASKS';

    return (
      <div>
        <div className={`text-[10px] font-medium ${colorClass} mb-0.5`}>
          {orders.length === 0 ? `0 ${label}` : label}
        </div>
        {orders.length > 0 && (
          <div className="space-y-px">
            {visibleOrders.map((order) => {
              const price = parseFloat(order.price);
              const size = parseFloat(order.remaining_size || order.size);
              return (
                <div key={order.id} className="flex justify-between text-[11px] leading-tight">
                  <span className="text-gray-400">${formatPriceWithConfig(price, market, marketConfigs)}</span>
                  <span className="text-gray-300 ml-2">{formatSizeWithConfig(size, market, marketConfigs)}</span>
                </div>
              );
            })}
            {hiddenCount > 0 && (
              <div className="text-[10px] text-gray-500 italic">
                +{hiddenCount} more
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [marketConfigs]);

  if (marketSummaries.length === 0) {
    return (
      <div className="bg-paradex-card border border-paradex-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Your Open Orders by Market</h3>
        <div className="text-gray-500 text-sm text-center py-2">No open orders</div>
      </div>
    );
  }

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Your Open Orders by Market</h3>
      <div className="flex flex-wrap gap-3">
        {marketSummaries.map((summary) => (
          <div
            key={summary.market}
            className={`bg-paradex-dark border rounded-lg px-3 py-2 min-w-[160px] h-[260px] flex flex-col ${
              summary.hasOrders ? 'border-paradex-border' : 'border-paradex-border/50 opacity-60'
            }`}
          >
            <div className="flex items-center gap-1.5 text-white font-medium text-sm mb-1">
              <MarketIcon symbol={summary.shortName} size={16} />
              {summary.shortName}
            </div>
            {!summary.hasOrders ? (
              <div className="text-gray-500 text-xs">No orders</div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="h-1/2">
                  {renderOrderList(summary.sellOrders, 'SELL', summary.market)}
                </div>
                <div className="h-1/2">
                  {renderOrderList(summary.buyOrders, 'BUY', summary.market)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
