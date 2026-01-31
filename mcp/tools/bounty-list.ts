// ============================================================================
// Bounty List Tool
// List open bounties on the Telvok marketplace
// ============================================================================

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface BountyListArgs {
  query?: string;
  status?: 'open' | 'all';
  tags?: string[];
  limit?: number;
}

interface BountyItem {
  id: string;
  title: string;
  description: string | null;
  amount: string;
  amount_cents: number;
  tags: string[] | null;
  status: string;
  created_at: string;
  expires_at: string;
}

interface BountyListResult {
  success: boolean;
  message: string;
  bounties: BountyItem[];
  total: number;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const bountyListTool = {
  name: 'bounty_list',
  title: 'List Bounties',
  description: `Browse bounties to find knowledge requests you can fulfill.

USE THIS TOOL WHEN:
- User wants to earn by sharing expertise
- Looking for topics people will pay for
- User asks "what bounties are available"

Claim a bounty → publish relevant book → get paid when approved.

TRIGGER PATTERNS:
- "What bounties can I fulfill?" → bounty_list()
- Looking for earning opportunities → bounty_list({ query: "<user expertise>" })
- "Show stripe bounties" → bounty_list({ query: "stripe" })

Examples:
- bounty_list() - Show all open bounties
- bounty_list({ query: "stripe" }) - Search for Stripe-related bounties
- bounty_list({ tags: ["auth", "security"] }) - Filter by tags`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search terms to filter bounties',
      },
      status: {
        type: 'string',
        enum: ['open', 'all'],
        description: 'Filter by status (default: open)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 20, max: 50)',
      },
    },
    required: [],
  },

  async handler(args: unknown): Promise<BountyListResult> {
    const { query, status = 'open', tags, limit = 20 } = (args || {}) as BountyListArgs;

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('status', status);
      params.set('limit', String(Math.min(limit, 50)));

      if (query) {
        params.set('query', query);
      }

      if (tags && tags.length > 0) {
        params.set('tags', tags.join(','));
      }

      const response = await fetch(`${TELVOK_API_URL}/api/bounties?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || `Failed to fetch bounties: HTTP ${response.status}`,
          bounties: [],
          total: 0,
        };
      }

      const bounties: BountyItem[] = data.bounties || [];
      const total = data.total || 0;

      if (bounties.length === 0) {
        const queryMsg = query ? ` for "${query}"` : '';
        return {
          success: true,
          message: `No open bounties found${queryMsg}. Check back later or try different search terms.`,
          bounties: [],
          total: 0,
        };
      }

      // Format summary
      const summary = bounties.map((b, i) => {
        const tagsStr = b.tags?.length ? ` [${b.tags.join(', ')}]` : '';
        return `${i + 1}. **${b.title}** - ${b.amount}${tagsStr}\n   ${b.description?.slice(0, 100) || 'No description'}${(b.description?.length || 0) > 100 ? '...' : ''}`;
      }).join('\n');

      const queryMsg = query ? ` for "${query}"` : '';

      return {
        success: true,
        bounties,
        total,
        message: `Found ${total} bounty(s)${queryMsg}:\n\n${summary}\n\nUse bounty_claim({ bounty_id: "..." }) to claim a bounty.`,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to fetch bounties: ${message}`,
        bounties: [],
        total: 0,
      };
    }
  },
};
