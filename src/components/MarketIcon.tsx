import { memo, useState } from 'react';

interface MarketIconProps {
  symbol: string; // e.g., "BTC", "ETH", "SOL"
  size?: number;
  className?: string;
}

// Use cryptocurrency-icons CDN (very reliable, widely used)
const getIconUrl = (symbol: string) => {
  const normalized = symbol.toLowerCase();
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/${normalized}.png`;
};

export const MarketIcon = memo(function MarketIcon({ symbol, size = 16, className = '' }: MarketIconProps) {
  const [hasError, setHasError] = useState(false);
  const normalized = symbol.toUpperCase();

  if (hasError) {
    // Fallback to colored initial
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-paradex-border text-[10px] font-bold text-gray-300 ${className}`}
        style={{ width: size, height: size }}
      >
        {normalized[0]}
      </div>
    );
  }

  return (
    <img
      src={getIconUrl(symbol)}
      alt={normalized}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
      onError={() => setHasError(true)}
    />
  );
});

// Extract base symbol from market name (e.g., "BTC-USD-PERP" -> "BTC")
export function getBaseSymbol(market: string): string {
  return market.split('-')[0];
}
