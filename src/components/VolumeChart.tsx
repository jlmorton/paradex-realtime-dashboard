import { memo, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { VolumeDataPoint } from '../types/paradex';

interface VolumeChartProps {
  data: VolumeDataPoint[];
}

// Color palette for different markets
const MARKET_COLORS: Record<string, string> = {
  'BTC-USD-PERP': '#f7931a',
  'ETH-USD-PERP': '#627eea',
  'SOL-USD-PERP': '#9945ff',
  'AVAX-USD-PERP': '#e84142',
  'ARB-USD-PERP': '#28a0f0',
  'OP-USD-PERP': '#ff0420',
  'DOGE-USD-PERP': '#c2a633',
  'LINK-USD-PERP': '#2a5ada',
  'MATIC-USD-PERP': '#8247e5',
  'BNB-USD-PERP': '#f3ba2f',
  'XRP-USD-PERP': '#00aae4',
  'PAXG-USD-PERP': '#e4b34d',
};

const DEFAULT_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#f97316', '#eab308', '#84cc16', '#22c55e',
];

function getMarketColor(market: string, index: number): string {
  return MARKET_COLORS[market] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

// Get short name from market (e.g., "BTC-USD-PERP" -> "BTC")
function getShortName(market: string): string {
  return market.split('-')[0];
}

export const VolumeChart = memo(function VolumeChart({ data }: VolumeChartProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Process data to create stacked bar format and cumulative total
  const { chartData, markets } = useMemo(() => {
    if (data.length === 0) return { chartData: [], markets: [] };

    // Get unique markets
    const marketsSet = new Set<string>();
    data.forEach(d => marketsSet.add(d.market));
    const markets = Array.from(marketsSet);

    // Group data by time buckets (to avoid too many bars)
    const bucketSize = Math.max(1, Math.floor(data.length / 100)); // Max ~100 bars
    const buckets: Map<number, Map<string, number>> = new Map();

    let bucketIndex = 0;
    let currentBucketTime = data[0]?.time || 0;

    data.forEach((point, i) => {
      if (i > 0 && i % bucketSize === 0) {
        bucketIndex++;
        currentBucketTime = point.time;
      }

      if (!buckets.has(currentBucketTime)) {
        buckets.set(currentBucketTime, new Map());
      }

      const bucket = buckets.get(currentBucketTime)!;
      bucket.set(point.market, (bucket.get(point.market) || 0) + point.value);
    });

    // Convert to chart data format with cumulative total
    let cumulativeTotal = 0;
    const chartData = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, marketVolumes]) => {
        const point: Record<string, number> = { time };
        let bucketTotal = 0;

        markets.forEach(market => {
          const vol = marketVolumes.get(market) || 0;
          point[market] = vol;
          bucketTotal += vol;
        });

        cumulativeTotal += bucketTotal;
        point.total = cumulativeTotal;

        return point;
      });

    return { chartData, markets };
  }, [data]);

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <h3 className="text-white font-medium mb-4">Volume Over Time</h3>
      <div className="h-64">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Waiting for fills...
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
                yAxisId="left"
                tickFormatter={formatValue}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={formatValue}
                stroke="#10b981"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#12121a',
                  border: '1px solid #1e1e2e',
                  borderRadius: '8px',
                }}
                labelFormatter={formatTime}
                formatter={(value: number, name: string) => [
                  formatValue(value),
                  name === 'total' ? 'Total' : getShortName(name),
                ]}
              />
              {markets.length > 1 && (
                <Legend
                  formatter={(value) => value === 'total' ? 'Total' : getShortName(value)}
                  wrapperStyle={{ fontSize: '12px' }}
                />
              )}
              {markets.map((market, index) => (
                <Bar
                  key={market}
                  yAxisId="left"
                  dataKey={market}
                  stackId="volume"
                  fill={getMarketColor(market, index)}
                  name={market}
                  isAnimationActive={false}
                />
              ))}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="total"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="total"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});
