import { memo, useMemo } from 'react';
import type { MarketStats } from '../types/paradex';
import { MarketIcon } from './MarketIcon';

interface MarketStatsTableProps {
  marketStats: Map<string, MarketStats>;
}

export const MarketStatsTable = memo(function MarketStatsTable({ marketStats }: MarketStatsTableProps) {
  const formatCurrency = (value: number) => {
    const formatted = Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return value >= 0 ? `$${formatted}` : `-$${formatted}`;
  };

  const formatVolume = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  // Get short name from market (e.g., "BTC-USD-PERP" -> "BTC")
  const getShortName = (market: string): string => {
    return market.split('-')[0];
  };

  const { sortedStats, totals } = useMemo(() => {
    const stats = Array.from(marketStats.values());

    // Sort by volume descending
    const sortedStats = stats.sort((a, b) => b.volume - a.volume);

    // Calculate totals
    const totals = stats.reduce(
      (acc, stat) => ({
        realizedPnL: acc.realizedPnL + stat.realizedPnL,
        unrealizedPnL: acc.unrealizedPnL + stat.unrealizedPnL,
        fees: acc.fees + stat.fees,
        volume: acc.volume + stat.volume,
        orderCount: acc.orderCount + stat.orderCount,
        fillCount: acc.fillCount + stat.fillCount,
      }),
      { realizedPnL: 0, unrealizedPnL: 0, fees: 0, volume: 0, orderCount: 0, fillCount: 0 }
    );

    return { sortedStats, totals };
  }, [marketStats]);

  const getPnLColor = (value: number) => {
    if (value > 0) return 'text-paradex-green';
    if (value < 0) return 'text-paradex-red';
    return 'text-gray-400';
  };

  if (sortedStats.length === 0) {
    return (
      <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Market Summary</h3>
        <div className="text-gray-400 text-center py-8">No trading activity yet</div>
      </div>
    );
  }

  const totalPnL = totals.realizedPnL + totals.unrealizedPnL - totals.fees;

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Market Summary</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-paradex-border">
              <th className="pb-3 pr-4">Market</th>
              <th className="pb-3 pr-4 text-right">Volume</th>
              <th className="pb-3 pr-4 text-right">Orders</th>
              <th className="pb-3 pr-4 text-right">Fills</th>
              <th className="pb-3 pr-4 text-right">Realized P&L</th>
              <th className="pb-3 pr-4 text-right">Unrealized P&L</th>
              <th className="pb-3 pr-4 text-right">Fees</th>
              <th className="pb-3 pr-4 text-right">Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat) => {
              const netPnL = stat.realizedPnL + stat.unrealizedPnL - stat.fees;
              return (
                <tr
                  key={stat.market}
                  className="border-b border-paradex-border/50 hover:bg-paradex-border/20"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <MarketIcon symbol={getShortName(stat.market)} size={18} />
                      <span className="text-white font-medium">{getShortName(stat.market)}</span>
                      <span className="text-xs text-gray-500">{stat.market}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right text-white font-mono">
                    {formatVolume(stat.volume)}
                  </td>
                  <td className="py-3 pr-4 text-right text-white font-mono">
                    {stat.orderCount}
                  </td>
                  <td className="py-3 pr-4 text-right text-white font-mono">
                    {stat.fillCount}
                  </td>
                  <td className={`py-3 pr-4 text-right font-mono ${getPnLColor(stat.realizedPnL)}`}>
                    {formatCurrency(stat.realizedPnL)}
                  </td>
                  <td className={`py-3 pr-4 text-right font-mono ${getPnLColor(stat.unrealizedPnL)}`}>
                    {formatCurrency(stat.unrealizedPnL)}
                  </td>
                  <td className="py-3 pr-4 text-right text-paradex-red font-mono">
                    {formatCurrency(stat.fees)}
                  </td>
                  <td className={`py-3 pr-4 text-right font-mono font-medium ${getPnLColor(netPnL)}`}>
                    {formatCurrency(netPnL)}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr className="border-t-2 border-paradex-border bg-paradex-border/10 font-medium">
              <td className="py-3 pr-4 text-white">Total</td>
              <td className="py-3 pr-4 text-right text-white font-mono">
                {formatVolume(totals.volume)}
              </td>
              <td className="py-3 pr-4 text-right text-white font-mono">
                {totals.orderCount}
              </td>
              <td className="py-3 pr-4 text-right text-white font-mono">
                {totals.fillCount}
              </td>
              <td className={`py-3 pr-4 text-right font-mono ${getPnLColor(totals.realizedPnL)}`}>
                {formatCurrency(totals.realizedPnL)}
              </td>
              <td className={`py-3 pr-4 text-right font-mono ${getPnLColor(totals.unrealizedPnL)}`}>
                {formatCurrency(totals.unrealizedPnL)}
              </td>
              <td className="py-3 pr-4 text-right text-paradex-red font-mono">
                {formatCurrency(totals.fees)}
              </td>
              <td className={`py-3 pr-4 text-right font-mono ${getPnLColor(totalPnL)}`}>
                {formatCurrency(totalPnL)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});
