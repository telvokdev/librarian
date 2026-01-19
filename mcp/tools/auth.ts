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
}

export interface AuthResult {
  authenticated: boolean;
  user_email?: string;
  user_id?: string;
  message: string;
  verification_url?: string;
  user_code?: string;
}

// ============================================================================
// Constants
// ============================================================================

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 120; // 10 minutes / 5 seconds

// ============================================================================
// Tool Definition
// ============================================================================

export const authTool = {
  name: 'auth',
  description: `Handle Telvok library authentication.

Use this to connect your agent to your Telvok account.

Actions:
- login: Start device code flow. Returns a code to enter at telvok.com/device
- complete: After user authorizes, call this to finish login and save credentials
- logout: Remove stored credentials
- status: Check if authenticated and show current user

Examples:
- auth({ action: 'login' })  → Get code, visit URL, authorize
- auth({ action: 'complete' }) → After authorizing, complete the login
- auth({ action: 'status' }) → Check if logged in
- auth({ action: 'logout' }) → Clear credentials`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['login', 'complete', 'logout', 'status'],
        description: 'Auth action to perform',
      },
    },
    required: ['action'],
  },

  async handler(args: unknown): Promise<AuthResult> {
    const { action } = args as { action: 'login' | 'complete' | 'logout' | 'status' };

    const libraryPath = getLibraryPath();
    const authFile = path.join(libraryPath, '.auth');
    const pendingFile = path.join(libraryPath, '.auth-pending');

    switch (action) {
      case 'status':
        return await checkStatus(authFile);

      case 'logout':
        return await logout(authFile);

      case 'login':
        return await login(authFile, pendingFile);

      case 'complete':
        return await completeLogin(authFile, pendingFile);

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

    return {
      authenticated: true,
      user_email: data.user_email,
      user_id: data.user_id,
      message: `Authenticated as ${data.user_email}`,
    };
  } catch {
    return {
      authenticated: false,
      message: 'Not authenticated. Use auth({ action: "login" }) to connect your Telvok account.',
    };
  }
}

async function logout(authFile: string): Promise<AuthResult> {
  try {
    await fs.unlink(authFile);
    return {
      authenticated: false,
      message: 'Logged out successfully. Credentials removed.',
    };
  } catch {
    return {
      authenticated: false,
      message: 'Already logged out.',
    };
  }
}

async function login(authFile: string, pendingFile: string): Promise<AuthResult> {
  // Check if already authenticated
  try {
    const content = await fs.readFile(authFile, 'utf-8');
    const data: AuthData = JSON.parse(content);
    return {
      authenticated: true,
      user_email: data.user_email,
      user_id: data.user_id,
      message: `Already authenticated as ${data.user_email}. Use auth({ action: "logout" }) first to switch accounts.`,
    };
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
        // Save credentials
        const authData: AuthData = {
          api_key: data.api_key,
          user_email: data.user.email,
          user_id: data.user.id,
          created_at: new Date().toISOString(),
        };

        await fs.writeFile(authFile, JSON.stringify(authData, null, 2), 'utf-8');
        await fs.unlink(pendingFile).catch(() => {});

        return {
          authenticated: true,
          user_email: data.user.email,
          user_id: data.user.id,
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
    return data.api_key;
  } catch {
    return null;
  }
}
