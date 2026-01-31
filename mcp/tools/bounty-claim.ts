// ============================================================================
// Bounty Claim Tool
// Claim a bounty to work on it
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface BountyClaimArgs {
  bounty_id: string;
}

interface BountyClaimResult {
  success: boolean;
  message: string;
  bounty?: {
    id: string;
    title: string;
    amount_cents: number;
    claimed_at: string;
  };
  setup_url?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const bountyClaimTool = {
  name: 'bounty_claim',
  title: 'Claim Bounty',
  description: `Claim a bounty to commit to fulfilling it.

USE THIS TOOL WHEN:
- User found a bounty they can fulfill from bounty_list()
- User says "I'll take that bounty" or "claim this"

After claiming: publish book → submit with bounty_submit() → get paid on approval.
First come, first served. Requires Stripe Connect for payment.

TRIGGER PATTERNS:
- "Claim that bounty" → bounty_claim({ bounty_id: "<id from bounty_list>" })
- User wants to fulfill a bounty → bounty_claim({ bounty_id: "..." })

Example:
- bounty_claim({ bounty_id: "abc123" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      bounty_id: {
        type: 'string',
        description: 'ID of the bounty to claim',
      },
    },
    required: ['bounty_id'],
  },

  async handler(args: unknown): Promise<BountyClaimResult> {
    const { bounty_id } = args as BountyClaimArgs;

    if (!bounty_id || typeof bounty_id !== 'string') {
      return {
        success: false,
        message: 'bounty_id is required',
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
      const response = await fetch(`${TELVOK_API_URL}/api/bounties/${bounty_id}/claim`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check for payment setup required
        if (data.setup_url) {
          return {
            success: false,
            message: `Payment setup required to claim bounties. Complete setup at:\n\n${data.setup_url}`,
            setup_url: data.setup_url,
          };
        }

        return {
          success: false,
          message: data.error || `Failed to claim bounty: HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        bounty: data.bounty,
        message: data.message || `Bounty claimed! Now publish a book with library_publish() and submit it with bounty_submit({ bounty_id: "${bounty_id}", library_slug: "your-book-slug" })`,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to claim bounty: ${message}`,
      };
    }
  },
};
