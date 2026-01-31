// ============================================================================
// My Bounties Tool
// View your created and claimed bounties
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface MyBountiesArgs {
  role?: 'creator' | 'claimer' | 'all';
}

interface BountyItem {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  amount_cents: number;
  status: string;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
}

interface MyBountiesResult {
  success: boolean;
  message: string;
  created: BountyItem[];
  claimed: BountyItem[];
  summary?: {
    total_created: number;
    total_claimed: number;
    pending_approval: number;
    in_progress: number;
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const myBountiesTool = {
  name: 'my_bounties',
  title: 'View My Bounties',
  description: `View your bounty activity and pending actions.

USE THIS TOOL WHEN:
- User asks "what bounties do I have"
- Checking status of created or claimed bounties
- User needs to see pending approvals or submissions

Shows bounties you created (as buyer) and claimed (as seller).

TRIGGER PATTERNS:
- "Show my bounties" → my_bounties()
- "What bounties am I working on?" → my_bounties({ role: "claimer" })
- "Check bounty status" → my_bounties()

Examples:
- my_bounties() - Show all your bounties
- my_bounties({ role: "creator" }) - Only bounties you created
- my_bounties({ role: "claimer" }) - Only bounties you claimed`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      role: {
        type: 'string',
        enum: ['creator', 'claimer', 'all'],
        description: 'Filter by role (default: all)',
      },
    },
    required: [],
  },

  async handler(args: unknown): Promise<MyBountiesResult> {
    const { role = 'all' } = (args || {}) as MyBountiesArgs;

    // Check authentication
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'Not authenticated. Run auth({ action: "login" }) to connect your Telvok account first.',
        created: [],
        claimed: [],
      };
    }

    try {
      const params = new URLSearchParams();
      if (role !== 'all') {
        params.set('role', role);
      }

      const response = await fetch(`${TELVOK_API_URL}/api/my-bounties?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || `Failed to fetch bounties: HTTP ${response.status}`,
          created: [],
          claimed: [],
        };
      }

      const created: BountyItem[] = data.created || [];
      const claimed: BountyItem[] = data.claimed || [];
      const summary = data.summary;

      // Build summary message
      const parts: string[] = [];

      if (created.length > 0) {
        parts.push(`**Bounties You Created (${created.length}):**`);
        created.forEach((b, i) => {
          const statusEmoji = b.status === 'submitted' ? '⏳' : b.status === 'completed' ? '✅' : '📝';
          parts.push(`${i + 1}. ${statusEmoji} ${b.title} (${b.amount}) - ${b.status}`);
        });
      }

      if (claimed.length > 0) {
        if (parts.length > 0) parts.push('');
        parts.push(`**Bounties You Claimed (${claimed.length}):**`);
        claimed.forEach((b, i) => {
          const statusEmoji = b.status === 'submitted' ? '⏳' : b.status === 'completed' ? '✅' : '🔨';
          parts.push(`${i + 1}. ${statusEmoji} ${b.title} (${b.amount}) - ${b.status}`);
        });
      }

      if (parts.length === 0) {
        parts.push('No bounties found. Create one with bounty_create() or browse with bounty_list().');
      }

      // Add action hints
      if (summary?.pending_approval > 0) {
        parts.push('');
        parts.push(`💡 You have ${summary.pending_approval} submission(s) awaiting your approval.`);
      }

      if (summary?.in_progress > 0) {
        parts.push('');
        parts.push(`💡 You have ${summary.in_progress} claimed bounty(s) to complete.`);
      }

      return {
        success: true,
        created,
        claimed,
        summary,
        message: parts.join('\n'),
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to fetch bounties: ${message}`,
        created: [],
        claimed: [],
      };
    }
  },
};
