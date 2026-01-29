import { memo } from 'react';
import type { Fill } from '../types/paradex';
import { MarketIcon, getBaseSymbol } from './MarketIcon';

interface FillsMetricCardProps {
  fills: Fill[];
}

export const FillsMetricCard = memo(function FillsMetricCard({ fills }: FillsMetricCardProps) {
  // Calculate fills by market
  const fillsByMarket = fills.reduce((acc, fill) => {
    const market = getBaseSymbol(fill.market);
    acc[market] = (acc[market] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topMarkets = Object.entries(fillsByMarket)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const totalFills = fills.length;

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <div className="text-gray-400 text-sm font-medium mb-2">Fills</div>
      <div className="flex items-start justify-between">
        <div className="text-2xl font-bold text-white">{totalFills}</div>
        {topMarkets.length > 0 && (
          <div className="space-y-1">
            {topMarkets.map(([market, count]) => (
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
