// ============================================================================
// Bounty Submit Tool
// Submit a book to fulfill a claimed bounty
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface BountySubmitArgs {
  bounty_id: string;
  library_slug: string;
}

interface BountySubmitResult {
  success: boolean;
  message: string;
  bounty?: {
    id: string;
    title: string;
    status: string;
  };
  library?: {
    slug: string;
    name: string;
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const bountySubmitTool = {
  name: 'bounty_submit',
  title: 'Submit Bounty',
  description: `Submit your published book to fulfill a claimed bounty.

USE THIS TOOL WHEN:
- User has claimed a bounty AND published a book to fulfill it
- User says "submit my book for the bounty"

The bounty creator reviews and approves (releasing payment) or rejects.

TRIGGER PATTERNS:
- After library_publish() for a bounty → bounty_submit({ bounty_id: "...", library_slug: "..." })
- "Submit my book for the bounty" → bounty_submit({ bounty_id: "...", library_slug: "..." })

Example:
- bounty_submit({ bounty_id: "abc123", library_slug: "my-webhook-patterns" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      bounty_id: {
        type: 'string',
        description: 'ID of the bounty you claimed',
      },
      library_slug: {
        type: 'string',
        description: 'Slug of your published book that fulfills the bounty',
      },
    },
    required: ['bounty_id', 'library_slug'],
  },

  async handler(args: unknown): Promise<BountySubmitResult> {
    const { bounty_id, library_slug } = args as BountySubmitArgs;

    if (!bounty_id || typeof bounty_id !== 'string') {
      return {
        success: false,
        message: 'bounty_id is required',
      };
    }

    if (!library_slug || typeof library_slug !== 'string') {
      return {
        success: false,
        message: 'library_slug is required. Publish a book first with library_publish().',
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
      const response = await fetch(`${TELVOK_API_URL}/api/bounties/${bounty_id}/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ library_slug }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || `Failed to submit: HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        bounty: data.bounty,
        library: data.library,
        message: data.message || `Submitted "${library_slug}" for bounty review. The creator will approve or reject your submission.`,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to submit: ${message}`,
      };
    }
  },
};
