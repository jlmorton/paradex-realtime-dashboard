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
import type { OrderDataPoint } from '../types/paradex';
import { MarketIcon } from './MarketIcon';

interface OrdersChartProps {
  data: OrderDataPoint[];
}

// Market colors for stacked bars
const MARKET_COLORS: Record<string, string> = {
  BTC: '#f7931a',
  ETH: '#627eea',
  SOL: '#14f195',
  ARB: '#28a0f0',
};

const getMarketColor = (market: string) => {
  return MARKET_COLORS[market] || '#6b7280';
};

interface AggregatedData {
  data: Record<string, number>[];
  markets: string[];
}

// Aggregate order points into time buckets
function aggregateByTime(data: OrderDataPoint[], bucketMs: number = 5000): AggregatedData {
  if (data.length === 0) return { data: [], markets: [] };

  const buckets = new Map<number, Map<string, number>>();
  const markets = new Set<string>();

  data.forEach(point => {
    const bucket = Math.floor(point.time / bucketMs) * bucketMs;
    const baseMarket = point.market.split('-')[0];
    markets.add(baseMarket);

    if (!buckets.has(bucket)) {
      buckets.set(bucket, new Map());
    }
    const marketCounts = buckets.get(bucket)!;
    marketCounts.set(baseMarket, (marketCounts.get(baseMarket) || 0) + 1);
  });

  const sortedMarkets = Array.from(markets).sort();
  const result = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, marketCounts]) => {
      const entry: Record<string, number> = { time };
      let total = 0;
      sortedMarkets.forEach(market => {
        const count = marketCounts.get(market) || 0;
        entry[market] = count;
        total += count;
      });
      entry.total = total;
      return entry;
    });

  return { data: result, markets: sortedMarkets };
}

export const OrdersChart = memo(function OrdersChart({ data }: OrdersChartProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const { data: chartData, markets } = useMemo(() => {
    return aggregateByTime(data, 3000);
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
              {markets.map((market: string) => (
                <Bar
                  key={market}
                  dataKey={market}
                  stackId="orders"
                  fill={getMarketColor(market)}
                  radius={[0, 0, 0, 0]}
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
          {markets.map((market: string) => (
            <div key={market} className="flex items-center gap-1.5">
              <MarketIcon symbol={market} size={14} />
              <span className="text-xs" style={{ color: getMarketColor(market) }}>{market}</span>
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
