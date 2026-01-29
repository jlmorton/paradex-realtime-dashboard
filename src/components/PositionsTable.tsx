import { memo } from 'react';
import type { Position, Order } from '../types/paradex';

interface PositionsTableProps {
  positions: Position[];
  openOrders: Map<string, Order>;
  lastOrderTimeByMarket: Map<string, number>;
  lastFillTimeByMarket: Map<string, number>;
}

export const PositionsTable = memo(function PositionsTable({ positions, openOrders, lastOrderTimeByMarket, lastFillTimeByMarket }: PositionsTableProps) {
  const formatPrice = (value: string | undefined) => {
    if (!value) return '-';
    const num = parseFloat(value);
    if (num >= 1000) {
      return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const formatSize = (value: string | undefined, market: string) => {
    if (!value) return '-';
    const num = Math.abs(parseFloat(value));
    // Extract base asset from market (e.g., "BTC-USD-PERP" -> "BTC")
    const baseAsset = market.split('-')[0];
    return `${num.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 6 })} ${baseAsset}`;
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

  // Get exit order for a position (order on opposite side)
  const getExitOrder = (position: Position): Order | undefined => {
    const order = openOrders.get(position.market);
    if (!order) return undefined;
    // Exit order should be on opposite side
    const isExitOrder =
      (position.side === 'LONG' && order.side === 'SELL') ||
      (position.side === 'SHORT' && order.side === 'BUY');
    return isExitOrder ? order : undefined;
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
              <th className="pb-3 pr-4">Exit Order</th>
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
              const exitOrder = getExitOrder(position);

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
                    ${formatPrice(position.average_entry_price)}
                  </td>
                  <td className="py-3 pr-4">
                    {exitOrder ? (
                      <div className="flex flex-col">
                        <span className={exitOrder.side === 'BUY' ? 'text-paradex-green' : 'text-paradex-red'}>
                          ${formatPrice(exitOrder.price)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {exitOrder.side} {exitOrder.type}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-white">
                    {position.liquidation_price && parseFloat(position.liquidation_price) > 0
                      ? `$${formatPrice(position.liquidation_price)}`
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
    </div>
  );
});
