import { memo, useMemo } from 'react';
import type { Order } from '../types/paradex';

interface OrderTiersProps {
  allOpenOrders: Map<string, Order[]>;
}

interface MarketOrderSummary {
  market: string;
  shortName: string;
  buyOrders: Order[];
  sellOrders: Order[];
  buyTiers: number;
  sellTiers: number;
  buySize: number;
  sellSize: number;
  buySpread: { min: number; max: number } | null;
  sellSpread: { min: number; max: number } | null;
}

export const OrderTiers = memo(function OrderTiers({ allOpenOrders }: OrderTiersProps) {
  const marketSummaries = useMemo(() => {
    const summaries: MarketOrderSummary[] = [];

    allOpenOrders.forEach((orders, market) => {
      const buyOrders = orders.filter(o => o.side === 'BUY');
      const sellOrders = orders.filter(o => o.side === 'SELL');

      const buyPrices = buyOrders.map(o => parseFloat(o.price));
      const sellPrices = sellOrders.map(o => parseFloat(o.price));

      summaries.push({
        market,
        shortName: market.split('-')[0],
        buyOrders,
        sellOrders,
        buyTiers: buyOrders.length,
        sellTiers: sellOrders.length,
        buySize: buyOrders.reduce((sum, o) => sum + parseFloat(o.remaining_size || o.size), 0),
        sellSize: sellOrders.reduce((sum, o) => sum + parseFloat(o.remaining_size || o.size), 0),
        buySpread: buyPrices.length > 0 ? { min: Math.min(...buyPrices), max: Math.max(...buyPrices) } : null,
        sellSpread: sellPrices.length > 0 ? { min: Math.min(...sellPrices), max: Math.max(...sellPrices) } : null,
      });
    });

    // Sort by total tiers descending
    return summaries.sort((a, b) => (b.buyTiers + b.sellTiers) - (a.buyTiers + a.sellTiers));
  }, [allOpenOrders]);

  const formatPrice = (value: number) => {
    if (value >= 1000) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  const formatSize = (value: number) => {
    if (value >= 1) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  };

  if (marketSummaries.length === 0) {
    return (
      <div className="bg-paradex-card border border-paradex-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Open Orders by Market</h3>
        <div className="text-gray-500 text-sm text-center py-2">No open orders</div>
      </div>
    );
  }

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Open Orders by Market</h3>
      <div className="flex flex-wrap gap-3">
        {marketSummaries.map((summary) => (
          <div
            key={summary.market}
            className="bg-paradex-dark border border-paradex-border rounded-lg px-3 py-2 min-w-[180px]"
          >
            <div className="text-white font-medium text-sm mb-1">{summary.shortName}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              {/* Buy side */}
              {summary.buyTiers > 0 && (
                <>
                  <div className="text-paradex-green">
                    {summary.buyTiers} buy{summary.buyTiers > 1 ? 's' : ''}
                  </div>
                  <div className="text-gray-400 text-right">
                    {formatSize(summary.buySize)}
                  </div>
                  <div className="text-gray-500 col-span-2">
                    {summary.buySpread && (
                      summary.buySpread.min === summary.buySpread.max
                        ? `@ $${formatPrice(summary.buySpread.min)}`
                        : `$${formatPrice(summary.buySpread.min)} - $${formatPrice(summary.buySpread.max)}`
                    )}
                  </div>
                </>
              )}
              {/* Sell side */}
              {summary.sellTiers > 0 && (
                <>
                  <div className="text-paradex-red">
                    {summary.sellTiers} sell{summary.sellTiers > 1 ? 's' : ''}
                  </div>
                  <div className="text-gray-400 text-right">
                    {formatSize(summary.sellSize)}
                  </div>
                  <div className="text-gray-500 col-span-2">
                    {summary.sellSpread && (
                      summary.sellSpread.min === summary.sellSpread.max
                        ? `@ $${formatPrice(summary.sellSpread.min)}`
                        : `$${formatPrice(summary.sellSpread.min)} - $${formatPrice(summary.sellSpread.max)}`
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
