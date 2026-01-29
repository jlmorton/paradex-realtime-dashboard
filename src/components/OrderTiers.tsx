import { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { Order, MarketConfig } from '../types/paradex';
import { formatPriceWithConfig, formatSizeWithConfig } from '../hooks/useMarketConfig';

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
const MAX_TIERS_SHOWN = 5;

export const OrderTiers = memo(function OrderTiers({ allOpenOrders, marketConfigs }: OrderTiersProps) {
  // Track when each market was last seen with orders
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const [, forceUpdate] = useState(0);

  // Update last seen times and trigger cleanup
  useEffect(() => {
    const now = Date.now();

    // Update last seen for markets that have orders
    allOpenOrders.forEach((orders, market) => {
      if (orders.length > 0) {
        lastSeenRef.current.set(market, now);
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

      if (changed) {
        forceUpdate(n => n + 1);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(cleanup);
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
      const buyOrders = orders
        .filter(o => o.side === 'BUY')
        .sort((a, b) => parseFloat(b.price) - parseFloat(a.price)); // Highest first
      const sellOrders = orders
        .filter(o => o.side === 'SELL')
        .sort((a, b) => parseFloat(a.price) - parseFloat(b.price)); // Lowest first

      summaries.push({
        market,
        shortName: market.split('-')[0],
        buyOrders,
        sellOrders,
        hasOrders: orders.length > 0,
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
            className={`bg-paradex-dark border rounded-lg px-3 py-2 min-w-[160px] h-[220px] flex flex-col ${
              summary.hasOrders ? 'border-paradex-border' : 'border-paradex-border/50 opacity-60'
            }`}
          >
            <div className="text-white font-medium text-sm mb-1">{summary.shortName}</div>
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
