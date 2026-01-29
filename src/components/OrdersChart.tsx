import { memo, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { OrderBucket } from '../types/paradex';
import { MarketIcon } from './MarketIcon';

interface OrdersChartProps {
  data: OrderBucket[];
}

// Colors for stacked bars - just cycle through by index
const COLORS = [
  '#f7931a', '#627eea', '#14f195', '#f0b90b', '#e84142',
  '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#64748b',
];

export const OrdersChart = memo(function OrdersChart({ data }: OrdersChartProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Convert buckets to chart format and collect all markets
  const { chartData, markets } = useMemo(() => {
    if (data.length === 0) return { chartData: [], markets: [] };

    const marketsSet = new Set<string>();
    data.forEach(bucket => {
      Object.keys(bucket.counts).forEach(market => marketsSet.add(market));
    });
    const markets = Array.from(marketsSet).sort();

    const chartData = data.map(bucket => {
      const entry: Record<string, number> = { time: bucket.time };
      let total = 0;
      markets.forEach(market => {
        const count = bucket.counts[market] || 0;
        entry[market] = count;
        total += count;
      });
      entry.total = total;
      return entry;
    });

    return { chartData, markets };
  }, [data]);

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <h3 className="text-white font-medium mb-4">Orders Over Time</h3>
      <div className="h-56">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Waiting for orders...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#12121a',
                  border: '1px solid #1e1e2e',
                  borderRadius: '8px',
                }}
                labelFormatter={formatTime}
              />
              {markets.map((market: string, index: number) => (
                <Bar
                  key={market}
                  dataKey={market}
                  name={market}
                  stackId="orders"
                  fill={COLORS[index % COLORS.length]}
                  isAnimationActive={false}
                />
              ))}
              <Line
                type="monotone"
                dataKey="total"
                stroke="#ffffff"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Total"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {/* Custom legend with icons */}
      {markets.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
          {markets.map((market: string, index: number) => (
            <div key={market} className="flex items-center gap-1.5">
              <MarketIcon symbol={market} size={14} />
              <span className="text-xs" style={{ color: COLORS[index % COLORS.length] }}>{market}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-white"></div>
            <span className="text-xs text-white">Total</span>
          </div>
        </div>
      )}
    </div>
  );
});
