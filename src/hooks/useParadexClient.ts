import { useState, useCallback, useRef, useEffect } from 'react';
import { Client, Config, Signer, type ParadexClient } from '@paradex/sdk';
import { BrowserProvider } from 'ethers';
import type { Account, TypedData } from 'starknet';

const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const REST_API_URL = 'https://api.prod.paradex.trade/v1';
const STORAGE_KEY = 'paradex_was_connected';

type ConnectionStatus =
  | 'disconnected'
  | 'connecting_wallet'
  | 'deriving_account'
  | 'authenticating'
  | 'connected';

interface ParadexClientState {
  client: ParadexClient | null;
  jwtToken: string | null;
  address: string | null;
  paradexAddress: string | null;
  isConnecting: boolean;
  connectionStatus: ConnectionStatus;
  error: string | null;
}

// Pad a hex string to 66 characters (0x + 64 hex chars)
function padHex(hex: string): string {
  const withoutPrefix = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = withoutPrefix.padStart(64, '0');
  return '0x' + padded;
}

export function useParadexClient() {
  const [state, setState] = useState<ParadexClientState>({
    client: null,
    jwtToken: null,
    address: null,
    paradexAddress: null,
    isConnecting: false,
    connectionStatus: 'disconnected',
    error: null,
  });

  // Store credentials for token refresh
  const starknetAccountRef = useRef<Account | null>(null);
  const paradexAddressRef = useRef<string | null>(null);
  const chainIdRef = useRef<string | null>(null);

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, connectionStatus: 'connecting_wallet', error: null }));

    try {
      if (!window.ethereum) {
        throw new Error('Please install MetaMask or another Ethereum wallet');
      }

      // Request accounts
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const ethAddress = accounts[0];

      // Update status: deriving Paradex account
      setState(prev => ({ ...prev, connectionStatus: 'deriving_account', address: ethAddress }));

      // Create ethers provider and signer
      const provider = new BrowserProvider(window.ethereum);
      const ethersSigner = await provider.getSigner();

      // Fetch Paradex config
      const config = await Config.fetch('prod');

      // Create SDK signer adapter
      const signer = Signer.fromEthers(ethersSigner);

      // Create Paradex client (derives Starknet account from Ethereum signer)
      // This step requires a signature from the user's wallet
      const client = await Client.fromEthSigner({ config, signer });
      const rawAddress = client.getAddress();
      // Use raw address for auth (matching Paradex app format)
      // Keep padded version for display
      const paradexAddress = rawAddress;
      const displayAddress = padHex(rawAddress);

      // Update status: authenticating
      setState(prev => ({ ...prev, connectionStatus: 'authenticating', paradexAddress: displayAddress }));

      // Get the underlying Starknet account from the provider
      const paradexProvider = client.getProvider();
      // Access internal account (the SDK exposes this via getAccount)
      const starknetAccount = (paradexProvider as unknown as { getAccount(): Account }).getAccount();

      // Store credentials for token refresh
      starknetAccountRef.current = starknetAccount;
      paradexAddressRef.current = paradexAddress;
      chainIdRef.current = config.paradexChainId;

      // Get JWT token via REST API authentication (use raw address, not padded)
      const jwtToken = await authenticateWithRestApi(paradexAddress, starknetAccount, config.paradexChainId);

      // Remember that user was connected for auto-reconnect
      localStorage.setItem(STORAGE_KEY, 'true');

      setState({
        client,
        jwtToken,
        address: ethAddress,
        paradexAddress: displayAddress,
        isConnecting: false,
        connectionStatus: 'connected',
        error: null,
      });

      return { jwtToken, address: ethAddress, paradexAddress };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      console.error('Connection error:', err);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        connectionStatus: 'disconnected',
        error: errorMessage,
      }));
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    // Clear auto-reconnect flag
    localStorage.removeItem(STORAGE_KEY);
    starknetAccountRef.current = null;
    paradexAddressRef.current = null;
    chainIdRef.current = null;
    setState({
      client: null,
      jwtToken: null,
      address: null,
      paradexAddress: null,
      isConnecting: false,
      connectionStatus: 'disconnected',
      error: null,
    });
  }, []);

  const refreshToken = useCallback(async () => {
    const starknetAccount = starknetAccountRef.current;
    const paradexAddress = paradexAddressRef.current;
    const chainId = chainIdRef.current;

    if (!starknetAccount || !paradexAddress || !chainId) {
      return;
    }

    try {
      console.log('Refreshing JWT token...');
      const newToken = await authenticateWithRestApi(paradexAddress, starknetAccount, chainId);
      setState(prev => ({ ...prev, jwtToken: newToken }));
      console.log('JWT token refreshed successfully');
    } catch (err) {
      console.error('Failed to refresh JWT token:', err);
    }
  }, []);

  // Set up automatic token refresh
  useEffect(() => {
    if (state.connectionStatus !== 'connected') {
      return;
    }

    const intervalId = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [state.connectionStatus, refreshToken]);

  // Auto-reconnect on page load if user was previously connected
  useEffect(() => {
    const wasConnected = localStorage.getItem(STORAGE_KEY);
    if (wasConnected && state.connectionStatus === 'disconnected' && !state.isConnecting) {
      console.log('Auto-reconnecting previously connected wallet...');
      connect().catch((err) => {
        console.error('Auto-reconnect failed:', err);
        // Clear the flag if auto-reconnect fails (user may have revoked access)
        localStorage.removeItem(STORAGE_KEY);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    connect,
    disconnect,
  };
}

async function authenticateWithRestApi(
  paradexAddress: string,
  starknetAccount: Account,
  chainId: string
): Promise<string> {
  // Get auth timestamp (in seconds, not milliseconds)
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 24 * 60 * 60; // 24 hours

  const timestampStr = now.toString();
  const expirationStr = expiry.toString();

  // Create the typed data matching the Go implementation format
  const authTypedData: TypedData = {
    types: {
      StarkNetDomain: [
        { name: 'name', type: 'felt' },
        { name: 'chainId', type: 'felt' },
        { name: 'version', type: 'felt' },
      ],
      Request: [
        { name: 'method', type: 'felt' },
        { name: 'path', type: 'felt' },
        { name: 'body', type: 'felt' },
        { name: 'timestamp', type: 'felt' },
        { name: 'expiration', type: 'felt' },
      ],
    },
    primaryType: 'Request',
    domain: {
      name: 'Paradex',
      version: '1',
      chainId: chainId,
    },
    message: {
      method: 'POST',
      path: '/v1/auth',
      body: '',
      timestamp: timestampStr,
      expiration: expirationStr,
    },
  };

  // Sign with Starknet account
  const signature = await starknetAccount.signMessage(authTypedData);

  // Format signature as ["r", "s"] with decimal strings (matching Go implementation)
  let signatureStr: string;
  if (Array.isArray(signature)) {
    // Convert to decimal strings
    const sigArray = signature.map(s => BigInt(s).toString());
    signatureStr = JSON.stringify(sigArray);
  } else if (typeof signature === 'object' && 'r' in signature && 's' in signature) {
    signatureStr = JSON.stringify([
      BigInt(signature.r).toString(),
      BigInt(signature.s).toString(),
    ]);
  } else {
    throw new Error('Unexpected signature format');
  }

  // Make auth request with interactive token type for WebSocket subscriptions
  const authResponse = await fetch(`${REST_API_URL}/auth?token_usage=interactive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PARADEX-STARKNET-ACCOUNT': paradexAddress,
      'PARADEX-STARKNET-SIGNATURE': signatureStr,
      'PARADEX-TIMESTAMP': timestampStr,
      'PARADEX-SIGNATURE-EXPIRATION': expirationStr,
    },
    body: JSON.stringify({}),
  });

  if (!authResponse.ok) {
    const errorData = await authResponse.json().catch(() => ({}));
    console.error('Auth error:', errorData);
    throw new Error(errorData.message || 'Authentication failed');
  }

  const authResult = await authResponse.json();
  return authResult.jwt_token;
}

// Global type declaration for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}
