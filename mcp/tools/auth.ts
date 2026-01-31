import * as fs from 'fs/promises';
import * as path from 'path';
import { getLibraryPath } from '../library/storage.js';

// ============================================================================
// Types
// ============================================================================

export interface AuthData {
  api_key: string;
  user_email: string;
  user_id: string;
  created_at: string;
  expires_at?: string;
}

export interface AuthResult {
  authenticated: boolean;
  user_email?: string;
  user_id?: string;
  message: string;
  verification_url?: string;
  user_code?: string;
  expires_at?: string;
  days_until_expiry?: number;
}

// ============================================================================
// Constants
// ============================================================================

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Tool Definition
// ============================================================================

export const authTool = {
  name: 'auth',
  title: 'Manage Authentication',
  description: `Handle Telvok library authentication.

USE THIS TOOL WHEN:
- Any library operation fails with "authentication required"
- User wants to access marketplace features (buy, publish, sync)
- Checking if we're logged in before marketplace operations
- Key is expiring soon (< 7 days) → use refresh action

Actions:
- login: Start device code flow. Returns code for telvok.com/device
- complete: After user authorizes, finish login and save credentials
- refresh: Rotate API key before expiration (call when < 7 days left)
- status: Check if authenticated and show expiration
- logout: Remove credentials AND revoke key on server (key becomes immediately invalid)
- revoke: Same as logout - immediately invalidates the API key everywhere

TRIGGER PATTERNS:
- "auth required" error → auth({ action: 'login' })
- User completed browser auth → auth({ action: 'complete' })
- Expiring soon warning → auth({ action: 'refresh' })
- Key compromised → auth({ action: 'revoke' }) to immediately invalidate`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['login', 'complete', 'logout', 'status', 'refresh', 'revoke'],
        description: 'Auth action to perform',
      },
    },
    required: ['action'],
  },

  outputSchema: {
    type: 'object' as const,
    properties: {
      authenticated: { type: 'boolean' },
      user_email: { type: 'string' },
      user_id: { type: 'string' },
      message: { type: 'string' },
      verification_url: { type: 'string' },
      user_code: { type: 'string' },
      expires_at: { type: 'string' },
      days_until_expiry: { type: 'number' },
    },
    required: ['authenticated', 'message'],
  },

  async handler(args: unknown): Promise<AuthResult> {
    const { action } = args as { action: 'login' | 'complete' | 'logout' | 'status' | 'refresh' | 'revoke' };

    const libraryPath = getLibraryPath();
    const authFile = path.join(libraryPath, '.auth');
    const pendingFile = path.join(libraryPath, '.auth-pending');

    switch (action) {
      case 'status':
        return await checkStatus(authFile);

      case 'logout':
      case 'revoke':
        // Both logout and revoke now invalidate the key server-side
        return await revokeAndLogout(authFile);

      case 'login':
        return await login(authFile, pendingFile);

      case 'complete':
        return await completeLogin(authFile, pendingFile);

      case 'refresh':
        return await refreshKey(authFile);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
};

// ============================================================================
// Action Handlers
// ============================================================================

async function checkStatus(authFile: string): Promise<AuthResult> {
  try {
    const content = await fs.readFile(authFile, 'utf-8');
    const data: AuthData = JSON.parse(content);

    let message = `Authenticated as ${data.user_email}`;
    let daysUntilExpiry: number | undefined;

    // Check expiration
    if (data.expires_at) {
      const expiresAt = new Date(data.expires_at);
      const now = new Date();
      const msUntilExpiry = expiresAt.getTime() - now.getTime();
      daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 0) {
        return {
          authenticated: false,
          message: 'API key has expired. Use auth({ action: "login" }) to get a new key.',
        };
      } else if (daysUntilExpiry <= 7) {
        message += ` ⚠️ Key expires in ${daysUntilExpiry} days! Use auth({ action: "refresh" }) to renew.`;
      } else {
        message += ` (expires in ${daysUntilExpiry} days)`;
      }
    }

    return {
      authenticated: true,
      user_email: data.user_email,
      user_id: data.user_id,
      message,
      expires_at: data.expires_at,
      days_until_expiry: daysUntilExpiry,
    };
  } catch {
    return {
      authenticated: false,
      message: 'Not authenticated. Use auth({ action: "login" }) to connect your Telvok account.',
    };
  }
}

async function revokeAndLogout(authFile: string): Promise<AuthResult> {
  // Read current credentials to revoke server-side
  let authData: AuthData | null = null;
  try {
    const content = await fs.readFile(authFile, 'utf-8');
    authData = JSON.parse(content);
  } catch {
    return {
      authenticated: false,
      message: 'Already logged out.',
    };
  }

  // Try to revoke on server (but don't fail if server is down)
  let serverRevoked = false;
  if (authData?.api_key) {
    try {
      const response = await fetch(`${TELVOK_API_URL}/api/auth/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.api_key}`,
        },
      });

      if (response.ok) {
        serverRevoked = true;
      } else if (response.status === 401) {
        // Key already invalid, that's fine
        serverRevoked = true;
      }
    } catch {
      // Server unreachable, still delete local file
    }
  }

  // Always delete local file
  try {
    await fs.unlink(authFile);
  } catch {
    // File already gone
  }

  const message = serverRevoked
    ? 'Logged out and API key revoked. The key is now invalid everywhere.'
    : 'Logged out locally. Note: Could not reach server to revoke key (it will expire in 90 days).';

  return {
    authenticated: false,
    message,
  };
}

async function login(authFile: string, pendingFile: string): Promise<AuthResult> {
  // Check if already authenticated
  try {
    const content = await fs.readFile(authFile, 'utf-8');
    const data: AuthData = JSON.parse(content);

    // Check if key is expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      // Key expired, allow new login
      await fs.unlink(authFile).catch(() => {});
    } else {
      return {
        authenticated: true,
        user_email: data.user_email,
        user_id: data.user_id,
        message: `Already authenticated as ${data.user_email}. Use auth({ action: "logout" }) first to switch accounts.`,
      };
    }
  } catch {
    // Not authenticated, proceed with login
  }

  // Request a new device code
  try {
    const response = await fetch(`${TELVOK_API_URL}/api/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Save device code to pending file for later completion
    const libraryPath = getLibraryPath();
    await fs.mkdir(libraryPath, { recursive: true });
    await fs.writeFile(pendingFile, JSON.stringify({
      device_code: data.device_code,
      user_code: data.user_code,
      verification_url: data.verification_url,
      created_at: new Date().toISOString(),
    }, null, 2), 'utf-8');

    // Return immediately with direct auth URL
    const directAuthUrl = `${TELVOK_API_URL}/auth/${data.device_code}`;
    return {
      authenticated: false,
      verification_url: directAuthUrl,
      user_code: data.user_code,
      message: `Click to authorize: ${directAuthUrl}\n\nAfter authorizing, call auth({ action: "complete" }) to finish.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start login: ${message}`);
  }
}

async function completeLogin(authFile: string, pendingFile: string): Promise<AuthResult> {
  // Read pending device code
  let deviceCode: string;
  try {
    const content = await fs.readFile(pendingFile, 'utf-8');
    const pending = JSON.parse(content);
    deviceCode = pending.device_code;
  } catch {
    return {
      authenticated: false,
      message: 'No pending login. Call auth({ action: "login" }) first.',
    };
  }

  // Poll for completion (try a few times)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${TELVOK_API_URL}/api/auth/device/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });

      const data = await response.json();

      if (data.status === 'pending') {
        await sleep(2000);
        continue;
      }

      if (data.status === 'expired') {
        await fs.unlink(pendingFile).catch(() => {});
        throw new Error('Code expired. Please call auth({ action: "login" }) to get a new code.');
      }

      if (data.status === 'success') {
        // Save credentials including expiration
        const authData: AuthData = {
          api_key: data.api_key,
          user_email: data.user.email,
          user_id: data.user.id,
          created_at: new Date().toISOString(),
          expires_at: data.expires_at,
        };

        await fs.writeFile(authFile, JSON.stringify(authData, null, 2), { encoding: 'utf-8', mode: 0o600 });
        await fs.unlink(pendingFile).catch(() => {});

        return {
          authenticated: true,
          user_email: data.user.email,
          user_id: data.user.id,
          expires_at: data.expires_at,
          message: `Successfully authenticated as ${data.user.email}`,
        };
      }

      throw new Error(`Unexpected status: ${data.status}`);
    } catch (error) {
      if (error instanceof Error && (error.message.includes('expired') || error.message.includes('Unexpected'))) {
        throw error;
      }
      // Network error, try again
      await sleep(1000);
    }
  }

  return {
    authenticated: false,
    message: 'Authorization not yet complete. Make sure you authorized at telvok.com/device, then call auth({ action: "complete" }) again.',
  };
}

async function refreshKey(authFile: string): Promise<AuthResult> {
  // Read current credentials
  let authData: AuthData;
  try {
    const content = await fs.readFile(authFile, 'utf-8');
    authData = JSON.parse(content);
  } catch {
    return {
      authenticated: false,
      message: 'Not authenticated. Use auth({ action: "login" }) first.',
    };
  }

  // Call refresh endpoint
  try {
    const response = await fetch(`${TELVOK_API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.api_key}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      if (response.status === 401) {
        // Key expired or invalid, need to re-login
        await fs.unlink(authFile).catch(() => {});
        return {
          authenticated: false,
          message: 'Key expired or invalid. Use auth({ action: "login" }) to get a new key.',
        };
      }
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Update stored credentials
    authData.api_key = data.api_key;
    authData.expires_at = data.expires_at;
    await fs.writeFile(authFile, JSON.stringify(authData, null, 2), { encoding: 'utf-8', mode: 0o600 });

    const expiresAt = new Date(data.expires_at);
    const daysUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return {
      authenticated: true,
      user_email: authData.user_email,
      user_id: authData.user_id,
      expires_at: data.expires_at,
      days_until_expiry: daysUntilExpiry,
      message: `Key refreshed! New key expires in ${daysUntilExpiry} days.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to refresh key: ${message}`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load saved API key from auth file
 * Used by other tools that need authenticated access
 */
export async function loadApiKey(): Promise<string | null> {
  try {
    const libraryPath = getLibraryPath();
    const authFile = path.join(libraryPath, '.auth');
    const content = await fs.readFile(authFile, 'utf-8');
    const data: AuthData = JSON.parse(content);

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return null;
    }

    return data.api_key;
  } catch {
    return null;
  }
}
