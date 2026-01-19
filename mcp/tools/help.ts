// ============================================================================
// Help Tool
// Self-documenting system for the Librarian MCP
// ============================================================================

// ============================================================================
// Types
// ============================================================================

interface HelpArgs {
  topic?: string;
}

interface HelpResult {
  topic: string;
  content: string;
}

// ============================================================================
// Help Content
// ============================================================================

const HELP_TOPICS: Record<string, string> = {
  overview: `LIBRARIAN - Memory layer for AI agents

Your library lives in .librarian/ with three folders:
- local/     Your knowledge (created via record())
- imported/  Downloaded books (via library_buy())
- packages/  Git-synced packages

QUICK START:
  brief({ query: "auth" })     Check what we know before diving in
  record({ insight: "..." })   Save what we learned
  mark_hit({ path: "..." })    This entry helped

MARKETPLACE:
  auth({ action: "login" })    Connect your Telvok account
  library_search({ ... })  Find books
  library_buy({ ... })     Purchase or claim a book
  my_books()                   View your books
  sync()                       Get updates for owned books
  rate_book({ ... })           Rate a purchased book

SELLING:
  library_publish({ ... }) Publish entries as a book
  seller_analytics()           View sales and reviews

Run help({ topic: "name" }) for details on any tool.`,

  brief: `brief({ query?, limit?, include_library? })

Check what we already know before diving in.

PARAMETERS:
  query           What are you working on? (optional)
  limit           Max entries to return (default: 5)
  include_library Also search Telvok (default: false)

EXAMPLES:
  brief({ query: "stripe webhooks" })
  brief({ query: "auth", include_library: true })
  brief({})  Returns recent entries

RANKING: 60% recency + 40% hits. Entries that helped bubble up.

When an entry helps, call mark_hit() so it ranks higher next time.`,

  record: `record({ insight, intent?, reasoning?, context?, example?, title? })

Save knowledge worth keeping. Call this proactively!

PARAMETERS:
  insight    (required) What did we learn?
  intent     What were we trying to accomplish?
  reasoning  Why does this work?
  context    Topic, area, or when this applies
  example    Code snippet or illustration
  title      Entry title (auto-generated if not provided)

EXAMPLES:
  record({ insight: "Stripe webhooks need idempotency checks" })

  record({
    intent: "Setting up auth flow",
    insight: "Add 30s buffer to token validation for clock skew",
    reasoning: "Server clocks drift between services",
    context: "auth, tokens"
  })

QUALITY BAR: "I wish we knew this yesterday"`,

  auth: `auth({ action })

Connect to your Telvok account.

ACTIONS:
  login     Start device code flow
  complete  Finish login after browser authorization
  status    Check if authenticated
  logout    Remove stored credentials

FLOW:
  1. auth({ action: "login" })    Get code and URL
  2. Visit URL, authorize in browser
  3. auth({ action: "complete" }) Finish login

Credentials saved in .librarian/.auth`,

  library_search: `library_search({ query, filters? })

Search Telvok library for books.

PARAMETERS:
  query    Search terms
  filters  Optional filters:
    - pricing: "open" | "one_time" | "subscription"
    - tags: ["tag1", "tag2"]
    - min_rating: 1-5

EXAMPLES:
  library_search({ query: "react patterns" })
  library_search({ query: "auth", filters: { pricing: "open" } })`,

  library_buy: `library_buy({ slug })

Purchase or claim a book from Telvok.

PARAMETERS:
  slug  Book slug from search results

BEHAVIOR:
  Free (open) books: Instantly adds to library
  Paid books: Returns checkout URL

EXAMPLE:
  library_buy({ slug: "react-best-practices" })

After purchase, use sync() for updates.`,

  rate_book: `rate_book({ slug, rating, title?, comment? })

Rate a book you've purchased.

PARAMETERS:
  slug     Book slug to rate
  rating   1 to 5 stars
  title    Optional review title
  comment  Optional review comment

EXAMPLES:
  rate_book({ slug: "auth-patterns", rating: 5 })
  rate_book({
    slug: "stripe-patterns",
    rating: 4,
    title: "Saved me hours",
    comment: "Webhook section was exactly what I needed"
  })

Ratings help surface quality content.`,

  sync: `sync({ slug?, force?, include_content? })

Check for and receive updates to owned books.

PARAMETERS:
  slug             Specific book (omit for all)
  force            Include manual preference books
  include_content  Download open book content

SYNC PREFERENCES (per-book):
  auto    Synced automatically (default)
  manual  Requires force: true
  pinned  Never synced

EXAMPLES:
  sync()
  sync({ slug: "premium-patterns" })
  sync({ force: true })`,

  my_books: `my_books({ filter? })

View your published and purchased books.

PARAMETERS:
  filter  "all" (default), "published", or "purchased"

EXAMPLES:
  my_books()
  my_books({ filter: "published" })

Shows slugs for sync(), rate_book(), etc.`,

  seller_analytics: `seller_analytics()

View analytics for books you've published.

SHOWS:
  - Total revenue and purchases
  - Per-book breakdown
  - Recent reviews
  - Hit counts (query frequency)

Requires authentication.`,

  mark_hit: `mark_hit({ path })

Mark an entry as helpful. Call when brief() helped.

PARAMETERS:
  path  Path to entry (from brief() results)

EXAMPLE:
  mark_hit({ path: "local/stripe-webhooks.md" })

Fire and forget. Entries with more hits rank higher.`,

  adopt: `adopt({ path, title? })

Make imported knowledge yours.

When an imported entry proves useful, adopt it into local/.

PARAMETERS:
  path   Path to entry (e.g., "imported/package/entry")
  title  New title (optional)

EXAMPLE:
  adopt({ path: "imported/stripe-patterns/webhooks" })`,

  library_publish: `library_publish({ name, description?, pricing, entries?, attestation })

Publish local entries as a book on Telvok.

PARAMETERS:
  name         Book name
  description  Short description
  pricing      { type: "open" | "one_time" | "subscription", price_cents? }
  entries      Entry paths to include (default: all local/)
  attestation  { original_work: true, terms_accepted: true }

EXAMPLES:
  library_publish({
    name: "React Patterns",
    pricing: { type: "open" },
    attestation: { original_work: true, terms_accepted: true }
  })

Paid books require Stripe Connect setup.`,

  feedback: `feedback({ message, type? })

Send feedback to the Telvok team.

PARAMETERS:
  message  Your feedback (5-5000 characters)
  type     bug | feature | question | general

EXAMPLES:
  feedback({ message: "Sync times out on large books", type: "bug" })
  feedback({ message: "Would love author filtering", type: "feature" })

We read every message!`,
};

// ============================================================================
// Tool Definition
// ============================================================================

export const helpTool = {
  name: 'help',
  description: `Get help on how to use the Librarian.

Run with no arguments for an overview, or specify a topic for details.

Examples:
- help()                     Overview of all tools
- help({ topic: "brief" })   Details on brief()
- help({ topic: "auth" })    Details on authentication`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      topic: {
        type: 'string',
        description: 'Specific topic to get help on',
        enum: Object.keys(HELP_TOPICS),
      },
    },
    required: [],
  },

  async handler(args: unknown): Promise<HelpResult> {
    const { topic } = (args || {}) as HelpArgs;

    const helpTopic = topic?.toLowerCase() || 'overview';
    const content = HELP_TOPICS[helpTopic];

    if (!content) {
      const availableTopics = Object.keys(HELP_TOPICS).filter(t => t !== 'overview').join(', ');
      return {
        topic: 'error',
        content: `Unknown topic: "${topic}"\n\nAvailable topics: ${availableTopics}`,
      };
    }

    return {
      topic: helpTopic,
      content: content.trim(),
    };
  },
};

// ============================================================================
// Export
// ============================================================================

export default helpTool;
