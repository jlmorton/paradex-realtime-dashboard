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

interface VolumeChartProps {
  data: { time: number; value: number }[];
}

// Downsample data for better chart performance
function downsample(data: { time: number; value: number }[], maxPoints: number) {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const result = [];
  for (let i = 0; i < data.length; i += step) {
    result.push(data[i]);
  }
  // Always include the last point
  if (result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }
  return result;
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

  const chartData = useMemo(() => {
    // First downsample, then calculate cumulative
    const downsampled = downsample(data, 200);
    let cumulative = 0;
    // Calculate cumulative based on original data up to each downsampled point
    return downsampled.map((item) => {
      // Sum all values up to this point in original data
      const originalIndex = data.indexOf(item);
      cumulative = 0;
      for (let i = 0; i <= originalIndex; i++) {
        cumulative += data[i].value;
      }
      return {
        ...item,
        total: cumulative,
      };
    });
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
                  name === 'total' ? 'Total Volume' : 'Volume',
                ]}
              />
              <Bar
                yAxisId="left"
                dataKey="value"
                fill="#6366f1"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="total"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});
