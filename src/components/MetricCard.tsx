interface MetricCardProps {
  label: string;
  value: string;
  prefix?: string;
  colorClass?: string;
}

export function MetricCard({ label, value, prefix = '', colorClass }: MetricCardProps) {
  return (
    <div className="bg-paradex-card border border-paradex-border rounded-lg p-6">
      <div className="text-gray-400 text-sm font-medium mb-2">{label}</div>
      <div className={`text-2xl font-bold ${colorClass || 'text-white'}`}>
        {prefix}{value}
      </div>
    </div>
  );
}
