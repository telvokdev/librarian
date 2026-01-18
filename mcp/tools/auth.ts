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
  description: `Handle Telvok marketplace authentication.

Use this to connect your agent to your Telvok account.

Actions:
- login: Start device code flow. Returns a code to enter at telvok.com/device
- logout: Remove stored credentials
- status: Check if authenticated and show current user

Examples:
- auth({ action: 'login' })  → Get code, visit URL, authorize
- auth({ action: 'status' }) → Check if logged in
- auth({ action: 'logout' }) → Clear credentials`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['login', 'logout', 'status'],
        description: 'Auth action to perform',
      },
    },
    required: ['action'],
  },

  async handler(args: unknown): Promise<AuthResult> {
    const { action } = args as { action: 'login' | 'logout' | 'status' };

    const libraryPath = getLibraryPath();
    const authFile = path.join(libraryPath, '.auth');

    switch (action) {
      case 'status':
        return await checkStatus(authFile);

      case 'logout':
        return await logout(authFile);

      case 'login':
        return await login(authFile);

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

async function login(authFile: string): Promise<AuthResult> {
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
  let deviceCode: string;
  let userCode: string;
  let verificationUrl: string;

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
    deviceCode = data.device_code;
    userCode = data.user_code;
    verificationUrl = data.verification_url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start login: ${message}`);
  }

  // Display instructions to user
  console.log('\n' + '='.repeat(50));
  console.log('  TELVOK AUTHENTICATION');
  console.log('='.repeat(50));
  console.log(`\n  1. Visit: ${verificationUrl}`);
  console.log(`  2. Enter code: ${userCode}`);
  console.log(`  3. Authorize your agent\n`);
  console.log('  Waiting for authorization...\n');

  // Poll for completion
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const response = await fetch(`${TELVOK_API_URL}/api/auth/device/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });

      const data = await response.json();

      if (data.status === 'pending') {
        // Still waiting, continue polling
        continue;
      }

      if (data.status === 'expired') {
        throw new Error('Code expired. Please try again.');
      }

      if (data.status === 'success') {
        // Save credentials
        const authData: AuthData = {
          api_key: data.api_key,
          user_email: data.user.email,
          user_id: data.user.id,
          created_at: new Date().toISOString(),
        };

        // Ensure .librarian directory exists
        const libraryPath = getLibraryPath();
        await fs.mkdir(libraryPath, { recursive: true });

        // Write auth file
        await fs.writeFile(authFile, JSON.stringify(authData, null, 2), 'utf-8');

        console.log('  Success! Agent authorized.\n');
        console.log('='.repeat(50) + '\n');

        return {
          authenticated: true,
          user_email: data.user.email,
          user_id: data.user.id,
          message: `Successfully authenticated as ${data.user.email}`,
        };
      }

      // Unknown status
      throw new Error(`Unexpected status: ${data.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('expired')) {
        throw error;
      }
      // Network error, continue polling
    }
  }

  throw new Error('Authorization timed out. Please try again.');
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
