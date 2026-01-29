import { memo, useRef, useState, useEffect } from 'react';
import type { Position, Order, MarketConfig } from '../types/paradex';
import { formatPriceWithConfig, formatSizeWithConfig } from '../hooks/useMarketConfig';

interface PositionsTableProps {
  positions: Position[];
  openOrders: Map<string, Order>;
  lastOrderTimeByMarket: Map<string, number>;
  lastFillTimeByMarket: Map<string, number>;
  marketConfigs: Map<string, MarketConfig>;
}

interface CachedOrder {
  order: Order;
  removedAt: number | null; // null means currently active, timestamp means when it was removed
}

const EXIT_ORDER_CACHE_MS = 1000; // 1 second grace period before removing

export const PositionsTable = memo(function PositionsTable({ positions, openOrders, lastOrderTimeByMarket, lastFillTimeByMarket, marketConfigs }: PositionsTableProps) {
  // Cache for exit orders to prevent flashing during rapid cancel/create cycles
  const exitOrderCacheRef = useRef<Map<string, CachedOrder>>(new Map());
  const [, forceUpdate] = useState(0);

  // Update cache and handle timeouts
  useEffect(() => {
    const cache = exitOrderCacheRef.current;
    const now = Date.now();
    const timeouts: NodeJS.Timeout[] = [];

    positions.forEach((position) => {
      const currentOrder = openOrders.get(position.market);
      const isExitOrder = currentOrder && (
        (position.side === 'LONG' && currentOrder.side === 'SELL') ||
        (position.side === 'SHORT' && currentOrder.side === 'BUY')
      );
      const exitOrder = isExitOrder ? currentOrder : undefined;
      const cached = cache.get(position.market);

      if (exitOrder) {
        // We have a current exit order - update cache immediately
        cache.set(position.market, { order: exitOrder, removedAt: null });
      } else if (cached && cached.removedAt === null) {
        // Order just disappeared - mark removal time
        cache.set(position.market, { ...cached, removedAt: now });
        // Set timeout to clear after grace period
        const timeout = setTimeout(() => {
          const current = cache.get(position.market);
          if (current && current.removedAt !== null && Date.now() - current.removedAt >= EXIT_ORDER_CACHE_MS) {
            cache.delete(position.market);
            forceUpdate(n => n + 1);
          }
        }, EXIT_ORDER_CACHE_MS + 50); // Small buffer
        timeouts.push(timeout);
      }
    });

    // Clean up markets that are no longer in positions
    const positionMarkets = new Set(positions.map(p => p.market));
    cache.forEach((_, market) => {
      if (!positionMarkets.has(market)) {
        cache.delete(market);
      }
    });

    return () => {
      timeouts.forEach(t => clearTimeout(t));
    };
  }, [positions, openOrders]);

  // Get exit order with caching logic
  const getDisplayExitOrder = (position: Position): Order | undefined => {
    const currentOrder = openOrders.get(position.market);
    const isExitOrder = currentOrder && (
      (position.side === 'LONG' && currentOrder.side === 'SELL') ||
      (position.side === 'SHORT' && currentOrder.side === 'BUY')
    );

    if (isExitOrder) {
      return currentOrder;
    }

    // Check cache
    const cached = exitOrderCacheRef.current.get(position.market);
    if (cached && cached.removedAt !== null) {
      // Only show cached order if within grace period
      if (Date.now() - cached.removedAt < EXIT_ORDER_CACHE_MS) {
        return cached.order;
      }
    }

    return undefined;
  };
  const formatPrice = (value: string | undefined, market: string) => {
    if (!value) return '-';
    return formatPriceWithConfig(value, market, marketConfigs);
  };

  const formatSize = (value: string | undefined, market: string) => {
    if (!value) return '-';
    const num = Math.abs(parseFloat(value));
    const baseAsset = market.split('-')[0];
    return `${formatSizeWithConfig(num, market, marketConfigs)} ${baseAsset}`;
  };

  const formatValue = (size: string, price: string) => {
    const sizeNum = Math.abs(parseFloat(size));
    const priceNum = parseFloat(price);
    const value = sizeNum * priceNum;
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPnL = (value: string | undefined) => {
    if (!value) return { text: '-', color: 'text-gray-400' };
    const num = parseFloat(value);
    const formatted = `${num >= 0 ? '+' : ''}$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const color = num >= 0 ? 'text-paradex-green' : 'text-paradex-red';
    return { text: formatted, color };
  };

  const formatROI = (pnl: string | undefined, cost: string | undefined) => {
    if (!pnl || !cost) return '';
    const pnlNum = parseFloat(pnl);
    const costNum = Math.abs(parseFloat(cost));
    if (costNum === 0) return '';
    const roi = (pnlNum / costNum) * 100;
    return `(${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%)`;
  };

  const formatTimeSince = (timestamp: number | undefined) => {
    if (!timestamp) return '-';
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) {
      return `${diffSecs}s ago`;
    }
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      const remainMins = diffMins % 60;
      return remainMins > 0 ? `${diffHours}h ${remainMins}m ago` : `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  
  if (positions.length === 0) {
    return (
      <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Open Positions</h3>
        <div className="text-gray-400 text-center py-8">No open positions</div>
      </div>
    );
  }

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Open Positions</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-paradex-border">
              <th className="pb-3 pr-4">Market</th>
              <th className="pb-3 pr-4">Size</th>
              <th className="pb-3 pr-4">Value</th>
              <th className="pb-3 pr-4">Entry Price</th>
              <th className="pb-3 pr-4 w-32">Exit Order</th>
              <th className="pb-3 pr-4">Liq. Price</th>
              <th className="pb-3 pr-4">Unrealized P&L</th>
              <th className="pb-3 pr-4">Realized P&L</th>
              <th className="pb-3 pr-4">Last Order</th>
              <th className="pb-3 pr-4">Last Fill</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const unrealizedPnL = formatPnL(position.unrealized_pnl);
              const realizedPnL = formatPnL(position.realized_positional_pnl);
              const roi = formatROI(position.unrealized_pnl, position.cost);
              const exitOrder = getDisplayExitOrder(position);

              return (
                <tr
                  key={position.market}
                  className="border-b border-paradex-border/50 hover:bg-paradex-border/20"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{position.market}</span>
                      <span className="text-xs bg-paradex-border px-1.5 py-0.5 rounded text-gray-300">
                        PERP
                      </span>
                      {position.leverage && (
                        <span className="text-xs bg-paradex-border px-1.5 py-0.5 rounded text-gray-300">
                          {parseFloat(position.leverage).toFixed(0)}x
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={position.side === 'LONG' ? 'text-paradex-green' : 'text-paradex-red'}>
                      {formatSize(position.size, position.market)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-white">
                    {formatValue(position.size, position.average_entry_price)}
                  </td>
                  <td className="py-3 pr-4 text-white">
                    ${formatPrice(position.average_entry_price, position.market)}
                  </td>
                  <td className="py-3 pr-4 w-32">
                    <div className="flex items-center justify-between h-5">
                      {exitOrder ? (
                        <>
                          <span className={exitOrder.side === 'BUY' ? 'text-paradex-green' : 'text-paradex-red'}>
                            ${formatPrice(exitOrder.price, position.market)}
                          </span>
                          <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                            exitOrder.side === 'BUY'
                              ? 'bg-paradex-green/20 text-paradex-green'
                              : 'bg-paradex-red/20 text-paradex-red'
                          }`}>
                            {exitOrder.side[0]}{exitOrder.type[0]}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-white">
                    {position.liquidation_price && parseFloat(position.liquidation_price) > 0
                      ? `$${formatPrice(position.liquidation_price, position.market)}`
                      : '-'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={unrealizedPnL.color}>
                      {unrealizedPnL.text}
                      {roi && <span className="ml-1 text-xs">{roi}</span>}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={realizedPnL.color}>{realizedPnL.text}</span>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-sm">
                    {formatTimeSince(lastOrderTimeByMarket.get(position.market))}
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-sm">
                    {formatTimeSince(lastFillTimeByMarket.get(position.market))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 pt-3 border-t border-paradex-border/50 text-[10px] text-gray-500 flex items-center gap-3">
        <span className="flex items-center gap-1"><span className="px-1 py-0.5 rounded font-medium bg-paradex-green/20 text-paradex-green">BL</span> Buy Limit</span>
        <span className="flex items-center gap-1"><span className="px-1 py-0.5 rounded font-medium bg-paradex-red/20 text-paradex-red">SL</span> Sell Limit</span>
        <span className="flex items-center gap-1"><span className="px-1 py-0.5 rounded font-medium bg-paradex-green/20 text-paradex-green">BM</span> Buy Market</span>
        <span className="flex items-center gap-1"><span className="px-1 py-0.5 rounded font-medium bg-paradex-red/20 text-paradex-red">SM</span> Sell Market</span>
      </div>
    </div>
  );
});
