import { memo, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface PnLChartProps {
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

export const PnLChart = memo(function PnLChart({ data }: PnLChartProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatValue = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  // Downsample to max 200 points for smooth rendering
  const chartData = useMemo(() => downsample(data, 200), [data]);

  const latestValue = data.length > 0 ? data[data.length - 1].value : 0;
  const lineColor = latestValue >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <h3 className="text-white font-medium mb-4">P&L Over Time</h3>
      <div className="h-64">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Waiting for fills...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                tickFormatter={formatValue}
                stroke="#6b7280"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#12121a',
                  border: '1px solid #1e1e2e',
                  borderRadius: '8px',
                }}
                labelFormatter={formatTime}
                formatter={(value: number) => [formatValue(value), 'P&L']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});
