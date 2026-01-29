type ConnectionStatus =
  | 'disconnected'
  | 'connecting_wallet'
  | 'deriving_account'
  | 'authenticating'
  | 'restoring_session'
  | 'connected';

interface ConnectWalletProps {
  address: string | null;
  paradexAddress: string | null;
  isConnecting: boolean;
  connectionStatus: ConnectionStatus;
  isWsConnected: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

const STATUS_MESSAGES: Record<ConnectionStatus, string> = {
  disconnected: '',
  connecting_wallet: 'Connecting wallet...',
  deriving_account: 'Deriving Paradex account...',
  authenticating: 'Authenticating...',
  restoring_session: 'Restoring session...',
  connected: '',
};

export function ConnectWallet({
  address,
  paradexAddress,
  isConnecting,
  connectionStatus,
  isWsConnected,
  error,
  onConnect,
  onDisconnect,
}: ConnectWalletProps) {
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const statusMessage = STATUS_MESSAGES[connectionStatus];

  return (
    <div className="flex items-center gap-4">
      {error && (
        <span className="text-paradex-red text-sm">{error}</span>
      )}

      {isConnecting && statusMessage && (
        <span className="text-yellow-400 text-sm animate-pulse">{statusMessage}</span>
      )}

      {address && !isConnecting ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isWsConnected ? 'bg-paradex-green' : 'bg-yellow-500'
              }`}
            />
            <span className="text-gray-400 text-sm">
              {isWsConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 text-xs">L1</span>
                <span className="text-white font-mono text-sm bg-paradex-card px-2 py-0.5 rounded">
                  {formatAddress(address)}
                </span>
              </div>
              {paradexAddress && (
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500 text-xs">L2</span>
                  <span className="text-white font-mono text-sm bg-paradex-card px-2 py-0.5 rounded">
                    {formatAddress(paradexAddress)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onDisconnect}
            className="px-4 py-2 bg-paradex-card border border-paradex-border rounded hover:bg-paradex-border transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="px-6 py-2 bg-paradex-accent text-white rounded font-medium hover:bg-opacity-80 transition-colors disabled:opacity-50"
        >
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
}
