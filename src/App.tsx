import { useParadexClient } from './hooks/useParadexClient';
import { useWebSocket } from './hooks/useWebSocket';
import { ConnectWallet } from './components/ConnectWallet';
import { MetricCard } from './components/MetricCard';
import { PnLChart } from './components/PnLChart';
import { VolumeChart } from './components/VolumeChart';
import { OrdersChart } from './components/OrdersChart';
import { AccountValueChart } from './components/AccountValueChart';
import { FillsTable } from './components/FillsTable';

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

  const { isConnected: isWsConnected, state } = useWebSocket({
    jwtToken,
  });

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

  return (
    <div className="min-h-screen bg-paradex-dark">
      {/* Header */}
      <header className="border-b border-paradex-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Paradex Dashboard</h1>
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
        {!address ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="text-6xl mb-6">📊</div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400 max-w-md">
              Connect your Ethereum wallet to view real-time P&L, volume, and
              order data from your Paradex account.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
            <FillsTable fills={state.recentFills} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-paradex-border px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto text-center text-gray-500 text-sm">
          Data tracked since session start
        </div>
      </footer>
    </div>
  );
}

export default App;
