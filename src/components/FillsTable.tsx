import { memo } from 'react';
import type { Fill } from '../types/paradex';

interface FillsTableProps {
  fills: Fill[];
}

export const FillsTable = memo(function FillsTable({ fills }: FillsTableProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatSize = (size: string) => {
    const num = parseFloat(size);
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  };

  const formatValue = (size: string, price: string) => {
    const sizeNum = parseFloat(size);
    const priceNum = parseFloat(price);
    const value = sizeNum * priceNum;
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <h3 className="text-white font-medium mb-4">Recent Fills</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-paradex-border">
              <th className="text-left py-3 px-2">Time</th>
              <th className="text-left py-3 px-2">Market</th>
              <th className="text-left py-3 px-2">Side</th>
              <th className="text-right py-3 px-2">Size</th>
              <th className="text-right py-3 px-2">Price</th>
              <th className="text-right py-3 px-2">Value</th>
              <th className="text-right py-3 px-2">P&L</th>
            </tr>
          </thead>
          <tbody>
            {fills.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  No fills yet
                </td>
              </tr>
            ) : (
              fills.map((fill) => (
                <tr
                  key={fill.id}
                  className="border-b border-paradex-border hover:bg-paradex-border/30 transition-colors"
                >
                  <td className="py-3 px-2 text-gray-400 text-sm">
                    {formatTime(fill.created_at)}
                  </td>
                  <td className="py-3 px-2 text-white font-medium">
                    {fill.market}
                  </td>
                  <td className="py-3 px-2">
                    <span
                      className={
                        fill.side === 'BUY'
                          ? 'text-paradex-green'
                          : 'text-paradex-red'
                      }
                    >
                      {fill.side}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right text-white font-mono">
                    {formatSize(fill.size)}
                  </td>
                  <td className="py-3 px-2 text-right text-white font-mono">
                    ${formatPrice(fill.price)}
                  </td>
                  <td className="py-3 px-2 text-right text-white font-mono">
                    ${formatValue(fill.size, fill.price)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono">
                    <span
                      className={
                        parseFloat(fill.realized_pnl) >= 0
                          ? 'text-paradex-green'
                          : 'text-paradex-red'
                      }
                    >
                      ${formatPrice(fill.realized_pnl)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
