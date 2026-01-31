// ============================================================================
// Bounty Create Tool
// Create a bounty on the Telvok marketplace
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface BountyCreateArgs {
  title: string;
  description?: string;
  amount_cents: number;
  tags?: string[];
  expires_days?: number;
}

interface BountyCreateResult {
  success: boolean;
  message: string;
  bounty?: {
    id: string;
    title: string;
    amount_cents: number;
    expires_at: string;
  };
  checkout_url?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const bountyCreateTool = {
  name: 'bounty_create',
  title: 'Create Bounty',
  description: `Create a knowledge bounty when you need specific expertise.

USE THIS TOOL WHEN:
- User needs knowledge that doesn't exist in marketplace
- User says "I'd pay for someone to explain X"
- Searching shows no results for a topic user needs

Sellers claim bounties, publish relevant books, and get paid when you approve.
Bounty held in escrow until approval. Platform fee: 20%. Minimum: $5 (500 cents)

TRIGGER PATTERNS:
- Need expertise that doesn't exist → bounty_create({ title: "...", amount_cents: 2000 })
- "I'd pay for auth patterns" → bounty_create({ title: "Auth best practices", amount_cents: 2000 })

Examples:
- bounty_create({ title: "Stripe webhook patterns", amount_cents: 2000 })
- bounty_create({ title: "Auth best practices", description: "Need JWT refresh patterns", amount_cents: 5000, tags: ["auth", "jwt"] })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'What knowledge you need (3+ characters)',
      },
      description: {
        type: 'string',
        description: 'Additional details about what you need',
      },
      amount_cents: {
        type: 'number',
        description: 'Bounty amount in cents (minimum 500 = $5)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to help sellers find your bounty',
      },
      expires_days: {
        type: 'number',
        description: 'Days until bounty expires (default: 30)',
      },
    },
    required: ['title', 'amount_cents'],
  },

  async handler(args: unknown): Promise<BountyCreateResult> {
    const { title, description, amount_cents, tags, expires_days } = args as BountyCreateArgs;

    // Validate inputs
    if (!title || typeof title !== 'string' || title.length < 3) {
      return {
        success: false,
        message: 'Title must be at least 3 characters',
      };
    }

    if (!amount_cents || typeof amount_cents !== 'number' || amount_cents < 500) {
      return {
        success: false,
        message: 'Minimum bounty amount is $5 (500 cents)',
      };
    }

    // Check authentication
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'Not authenticated. Run auth({ action: "login" }) to connect your Telvok account first.',
      };
    }

    try {
      const response = await fetch(`${TELVOK_API_URL}/api/bounties`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          amount_cents,
          tags,
          expires_days,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || `Failed to create bounty: HTTP ${response.status}`,
        };
      }

      const amount = `$${(amount_cents / 100).toFixed(2)}`;

      return {
        success: true,
        bounty: data.bounty,
        checkout_url: data.checkout_url,
        message: `Bounty created! Complete payment to activate:\n\n${data.checkout_url}\n\nBounty: "${title}" (${amount})`,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to create bounty: ${message}`,
      };
    }
  },
};
