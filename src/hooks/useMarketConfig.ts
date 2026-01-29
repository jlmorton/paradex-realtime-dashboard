import { useState, useEffect } from 'react';
import type { MarketConfig } from '../types/paradex';

const API_URL = 'https://api.prod.paradex.trade/v1/markets';

function countDecimals(value: number): number {
  if (value >= 1) return 0;
  const str = value.toString();
  if (str.includes('e-')) {
    // Handle scientific notation like 1e-7
    return parseInt(str.split('e-')[1], 10);
  }
  const parts = str.split('.');
  return parts[1]?.length || 0;
}

export function useMarketConfig() {
  const [marketConfigs, setMarketConfigs] = useState<Map<string, MarketConfig>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMarkets() {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`Failed to fetch markets: ${response.status}`);
        }
        const data = await response.json();
        const configs = new Map<string, MarketConfig>();

        for (const market of data.results) {
          const priceTickSize = parseFloat(market.price_tick_size);
          const orderSizeIncrement = parseFloat(market.order_size_increment);

          configs.set(market.symbol, {
            symbol: market.symbol,
            priceTickSize,
            orderSizeIncrement,
            priceDecimals: countDecimals(priceTickSize),
            sizeDecimals: countDecimals(orderSizeIncrement),
          });
        }

        setMarketConfigs(configs);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch market config');
        setIsLoading(false);
      }
    }

    fetchMarkets();
  }, []);

  return { marketConfigs, isLoading, error };
}

export function formatPriceWithConfig(
  value: number | string,
  market: string,
  configs: Map<string, MarketConfig>
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';

  const config = configs.get(market);
  const decimals = config?.priceDecimals ?? 2;

  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSizeWithConfig(
  value: number | string,
  market: string,
  configs: Map<string, MarketConfig>
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';

  const config = configs.get(market);
  const decimals = config?.sizeDecimals ?? 4;

  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
