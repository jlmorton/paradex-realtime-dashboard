import { Analytics } from '@vercel/analytics/react';
import { useParadexClient } from './hooks/useParadexClient';
import { useWebSocket } from './hooks/useWebSocket';
import { useDemoSimulation } from './hooks/useDemoSimulation';
import { useMarketConfig } from './hooks/useMarketConfig';
import { ConnectWallet } from './components/ConnectWallet';
import { MetricCard } from './components/MetricCard';
import { PnLChart } from './components/PnLChart';
import { VolumeChart } from './components/VolumeChart';
import { OrdersChart } from './components/OrdersChart';
import { AccountValueChart } from './components/AccountValueChart';
import { PositionsTable } from './components/PositionsTable';
import { FillsTable } from './components/FillsTable';
import { OrderTiers } from './components/OrderTiers';
import { MarketStatsTable } from './components/MarketStatsTable';

const CheckIcon = () => (
  <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

function App() {
  const {
    jwtToken,
    address,
    paradexAddress,
    isConnecting,
    connectionStatus,
    error,
    connect,
    disconnect,
  } = useParadexClient();

  const { isConnected: isWsConnected, state: liveState } = useWebSocket({
    jwtToken,
  });

  // Live demo simulation for when not connected
  const { state: demoState } = useDemoSimulation();

  // Fetch market configurations for proper decimal formatting
  const { marketConfigs } = useMarketConfig();

  // Use demo data when not connected, live data when connected
  const isDemo = !address;
  const state = isDemo ? demoState : liveState;

  const formatCurrency = (value: number) => {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatVolume = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}K`;
    }
    return formatCurrency(value);
  };

  const totalPnL = state.realizedPnL - state.totalFees + state.unrealizedPnL;
  const pnlColor = totalPnL >= 0 ? 'text-paradex-green' : 'text-paradex-red';

  // Calculate fills by market for subtitle
  const fillsByMarket = state.recentFills.reduce((acc, fill) => {
    const market = fill.market.split('-')[0]; // Get short name like "BTC"
    acc[market] = (acc[market] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topFillsMarkets = Object.entries(fillsByMarket)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([market, count]) => `${market}: ${count}`)
    .join(' · ');

  const totalFills = state.recentFills.length;

  return (
    <div className="min-h-screen bg-paradex-dark">
      {/* Header */}
      <header className="border-b border-paradex-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">Paradex Bot Monitor</h1>
          </div>
          <ConnectWallet
            address={address}
            paradexAddress={paradexAddress}
            isConnecting={isConnecting}
            connectionStatus={connectionStatus}
            isWsConnected={isWsConnected}
            error={error}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section - shown when not connected */}
        {isDemo && (
          <div className="mb-8">
            {/* Hero */}
            <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/20 rounded-xl p-8 mb-6">
              <div className="max-w-3xl">
                <h2 className="text-3xl font-bold text-white mb-4">
                  Real-Time Trading Bot Analytics
                </h2>
                <p className="text-gray-300 text-lg mb-6">
                  Monitor your Paradex trading bot's performance with live metrics, P&L tracking,
                  and order management. All data stays local in your browser — connect your wallet
                  to stream real-time updates directly from Paradex.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm text-gray-300">
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Live P&L Tracking
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Volume & Fee Analytics
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Order Tier Visualization
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Per-Market Breakdown
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Position Monitoring
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Real-Time Fill Feed
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Session Persistence
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon />
                    Privacy-First Design
                  </div>
                </div>
              </div>
            </div>

            {/* Demo Data Banner */}
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-amber-200 text-sm">
                <strong>Live Demo:</strong> Watching simulated trading activity. Connect your wallet to monitor your actual bot.
              </span>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <MetricCard
              label="Total P&L (incl. fees)"
              value={formatCurrency(totalPnL)}
              prefix="$"
              colorClass={pnlColor}
            />
            <MetricCard
              label="Account Value"
              value={formatCurrency(state.equity)}
              prefix="$"
            />
            <MetricCard
              label="Session Volume"
              value={formatVolume(state.totalVolume)}
              prefix="$"
            />
            <MetricCard
              label="Orders Created"
              value={state.ordersCreated.toString()}
            />
            <MetricCard
              label="Fills"
              value={totalFills.toString()}
              subtitle={topFillsMarkets || undefined}
            />
          </div>

          {/* Realized/Unrealized P&L breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              label="Realized P&L"
              value={formatCurrency(state.realizedPnL)}
              prefix="$"
              colorClass={state.realizedPnL >= 0 ? 'text-paradex-green' : 'text-paradex-red'}
            />
            <MetricCard
              label="Unrealized P&L"
              value={formatCurrency(state.unrealizedPnL)}
              prefix="$"
              colorClass={state.unrealizedPnL >= 0 ? 'text-paradex-green' : 'text-paradex-red'}
            />
            <MetricCard
              label="Total Fees Paid"
              value={formatCurrency(state.totalFees)}
              prefix="-$"
              colorClass="text-paradex-red"
            />
          </div>

          {/* Positions Table */}
          <PositionsTable
            positions={state.positions}
            openOrders={state.openOrders}
            lastOrderTimeByMarket={state.lastOrderTimeByMarket}
            lastFillTimeByMarket={state.lastFillTimeByMarket}
            marketConfigs={marketConfigs}
          />

          {/* Open Orders by Market */}
          <OrderTiers allOpenOrders={state.allOpenOrders} marketConfigs={marketConfigs} />

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PnLChart data={state.pnlHistory} />
            <AccountValueChart data={state.equityHistory} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <VolumeChart data={state.volumeHistory} />
            <OrdersChart data={state.ordersHistory} />
          </div>

          {/* Fills Table */}
          <FillsTable fills={state.recentFills} marketConfigs={marketConfigs} />

          {/* Market Summary */}
          <MarketStatsTable marketStats={state.marketStats} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-paradex-border px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto text-center text-gray-500 text-sm">
          {isDemo ? 'Connect wallet to start tracking your bot' : 'Data tracked since session start'}
        </div>
      </footer>
      <Analytics />
    </div>
  );
}

export default App;
