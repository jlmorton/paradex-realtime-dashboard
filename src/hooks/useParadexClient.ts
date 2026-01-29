import { useState, useCallback, useRef, useEffect } from 'react';
import { Client, Config, Signer, type ParadexClient } from '@paradex/sdk';
import { BrowserProvider } from 'ethers';
import { Account, RpcProvider, type TypedData } from 'starknet';

const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const REST_API_URL = 'https://api.prod.paradex.trade/v1';
const SESSION_STORAGE_KEY = 'paradex_session';

type ConnectionStatus =
  | 'disconnected'
  | 'connecting_wallet'
  | 'deriving_account'
  | 'authenticating'
  | 'restoring_session'
  | 'connected';

interface StoredSession {
  privateKey: string;
  paradexAddress: string;
  ethAddress: string;
  chainId: string;
  rpcUrl: string;
  jwtToken: string;
  storedAt: number;
}

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

// Extract private key from Account's signer
function getPrivateKey(account: Account): string | null {
  try {
    const signer = account.signer as { pk?: string };
    return signer.pk || null;
  } catch {
    return null;
  }
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

  // Save session to localStorage
  const saveSession = useCallback((session: StoredSession) => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      console.log('Session saved to localStorage');
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }, []);

  // Clear session from localStorage
  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('Session cleared from localStorage');
  }, []);

  // Restore session from localStorage
  const restoreSession = useCallback(async (): Promise<boolean> => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) {
        return false;
      }

      const session: StoredSession = JSON.parse(stored);
      console.log('Found stored session, restoring...');

      setState(prev => ({ ...prev, isConnecting: true, connectionStatus: 'restoring_session', error: null }));

      // Create RPC provider and Account from stored credentials
      const provider = new RpcProvider({ nodeUrl: session.rpcUrl });
      const account = new Account({
        provider,
        address: session.paradexAddress,
        signer: session.privateKey,
      });

      // Store in refs for token refresh
      starknetAccountRef.current = account;
      paradexAddressRef.current = session.paradexAddress;
      chainIdRef.current = session.chainId;

      // Try using the stored JWT first
      let jwtToken = session.jwtToken;

      // If JWT is older than 20 hours, refresh it proactively
      const jwtAge = Date.now() - session.storedAt;
      const twentyHours = 20 * 60 * 60 * 1000;

      if (jwtAge > twentyHours) {
        console.log('Stored JWT is old, refreshing...');
        try {
          jwtToken = await authenticateWithRestApi(session.paradexAddress, account, session.chainId);
          // Update stored session with new JWT
          saveSession({ ...session, jwtToken, storedAt: Date.now() });
        } catch (err) {
          console.error('Failed to refresh JWT, using stored token:', err);
        }
      }

      const displayAddress = padHex(session.paradexAddress);

      setState({
        client: null, // We don't have the full SDK client, but don't need it for the dashboard
        jwtToken,
        address: session.ethAddress,
        paradexAddress: displayAddress,
        isConnecting: false,
        connectionStatus: 'connected',
        error: null,
      });

      console.log('Session restored successfully');
      return true;
    } catch (err) {
      console.error('Failed to restore session:', err);
      clearSession();
      setState(prev => ({
        ...prev,
        isConnecting: false,
        connectionStatus: 'disconnected',
        error: null,
      }));
      return false;
    }
  }, [saveSession, clearSession]);

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

      // Extract private key for session persistence
      const privateKey = getPrivateKey(starknetAccount);
      if (!privateKey) {
        console.warn('Could not extract private key for session persistence');
      }

      // Store credentials for token refresh
      starknetAccountRef.current = starknetAccount;
      paradexAddressRef.current = paradexAddress;
      chainIdRef.current = config.paradexChainId;

      // Get JWT token via REST API authentication (use raw address, not padded)
      const jwtToken = await authenticateWithRestApi(paradexAddress, starknetAccount, config.paradexChainId);

      // Save session to localStorage for persistence across page reloads
      if (privateKey) {
        saveSession({
          privateKey,
          paradexAddress,
          ethAddress,
          chainId: config.paradexChainId,
          rpcUrl: config.paradexFullNodeRpcUrl,
          jwtToken,
          storedAt: Date.now(),
        });
      }

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
  }, [saveSession]);

  const disconnect = useCallback(() => {
    // Clear stored session
    clearSession();
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
  }, [clearSession]);

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

      // Update stored session with new JWT
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session: StoredSession = JSON.parse(stored);
        saveSession({ ...session, jwtToken: newToken, storedAt: Date.now() });
      }

      console.log('JWT token refreshed successfully');
    } catch (err) {
      console.error('Failed to refresh JWT token:', err);
    }
  }, [saveSession]);

  // Set up automatic token refresh
  useEffect(() => {
    if (state.connectionStatus !== 'connected') {
      return;
    }

    const intervalId = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [state.connectionStatus, refreshToken]);

  // Auto-restore session on page load
  useEffect(() => {
    if (state.connectionStatus === 'disconnected' && !state.isConnecting) {
      restoreSession().then(restored => {
        if (!restored) {
          console.log('No stored session found');
        }
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
