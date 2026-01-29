import { memo } from 'react';
import type { MarketStats } from '../types/paradex';
import { MarketIcon } from './MarketIcon';

interface OrdersMetricCardProps {
  ordersCreated: number;
  marketStats: Map<string, MarketStats>;
}

export const OrdersMetricCard = memo(function OrdersMetricCard({ ordersCreated, marketStats }: OrdersMetricCardProps) {
  // Get orders by market from stats
  const ordersByMarket = Array.from(marketStats.values())
    .filter(s => s.orderCount > 0)
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 4)
    .map(s => ({
      market: s.market.split('-')[0],
      count: s.orderCount,
    }));

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <div className="text-gray-400 text-sm font-medium mb-2">Orders Created</div>
      <div className="flex items-start justify-between">
        <div className="text-2xl font-bold text-white">{ordersCreated}</div>
        {ordersByMarket.length > 0 && (
          <div className="space-y-1">
            {ordersByMarket.map(({ market, count }) => (
              <div key={market} className="flex items-center gap-1.5 text-xs">
                <MarketIcon symbol={market} size={14} />
                <span className="text-gray-400">{market}</span>
                <span className="text-white font-medium">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
