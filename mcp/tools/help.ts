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

BOUNTIES:
  bounty_create({ ... })       Post a knowledge request
  bounty_list()                Browse available bounties
  bounty_claim({ ... })        Claim a bounty to fulfill
  bounty_submit({ ... })       Submit your solution
  my_bounties()                View your bounties

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

  bounty_create: `bounty_create({ title, amount_cents, description?, tags?, expires_days? })

Create a knowledge bounty for others to fulfill.

PARAMETERS:
  title         What you need (3+ chars)
  amount_cents  Bounty reward (min 500 = $5)
  description   Detailed requirements (optional)
  tags          Topic tags (optional)
  expires_days  Days until expiry (default: 30)

EXAMPLES:
  bounty_create({
    title: "Stripe webhook patterns",
    amount_cents: 1000,
    description: "Need idempotency and retry handling examples"
  })

FLOW:
  1. Create bounty → Get Stripe checkout URL
  2. Pay to fund bounty
  3. Bounty becomes visible for claims

Platform fee: 20%`,

  bounty_list: `bounty_list({ query?, tags?, status?, limit? })

Browse available bounties to fulfill.

PARAMETERS:
  query   Search terms (optional)
  tags    Filter by tags (optional, case-sensitive!)
  status  "open" (default) or "all"
  limit   Max results (default: 20)

EXAMPLES:
  bounty_list()
  bounty_list({ query: "stripe" })
  bounty_list({ tags: ["auth", "security"] })
  bounty_list({ status: "all", limit: 50 })

NOTE: Tags are case-sensitive ("stripe" ≠ "STRIPE")

Use bounty_claim() to claim a bounty you can fulfill.`,

  bounty_claim: `bounty_claim({ bounty_id })

Claim a bounty you want to fulfill.

PARAMETERS:
  bounty_id  UUID from bounty_list()

REQUIREMENTS:
  - Must be authenticated
  - Cannot claim your own bounty
  - Bounty must be open (funded, not claimed)

EXAMPLE:
  bounty_claim({ bounty_id: "abc123..." })

AFTER CLAIMING:
  1. Publish relevant book via library_publish()
  2. Submit with bounty_submit()
  3. Creator reviews and approves/rejects`,

  bounty_submit: `bounty_submit({ bounty_id, book_slug })

Submit a published book to fulfill a claimed bounty.

PARAMETERS:
  bounty_id  The bounty you claimed
  book_slug  Slug of your published book

REQUIREMENTS:
  - Must have claimed this bounty
  - Book must be published

EXAMPLE:
  bounty_submit({
    bounty_id: "abc123...",
    book_slug: "stripe-webhook-patterns"
  })

AFTER SUBMISSION:
  Creator has 7 days to review. If approved, you receive payment.
  If no response, auto-approved after deadline.`,

  my_bounties: `my_bounties({ role? })

View bounties you've created or claimed.

PARAMETERS:
  role  "all" (default), "creator", or "claimer" (case-insensitive)

EXAMPLES:
  my_bounties()
  my_bounties({ role: "creator" })
  my_bounties({ role: "claimer" })

Shows status, amounts, and deadlines for your bounties.`,

  delete: `delete({ path?, query?, confirm? })

Delete entries from your local library.

PARAMETERS:
  path     Exact path to entry (e.g., "local/entry-name.md")
  query    Search query to find entries
  confirm  Required to actually delete (default: false)

THREE-STEP WORKFLOW:
  1. delete({ query: "..." })              Find matching entries
  2. delete({ path: "..." })               Preview what will be deleted
  3. delete({ path: "...", confirm: true }) Actually delete

EXAMPLES:
  delete({ query: "old auth" })
  delete({ path: "local/outdated-entry.md" })
  delete({ path: "local/outdated-entry.md", confirm: true })

SCOPE: Only deletes from local/ (your entries).
Cannot delete imported/ or packages/ content.`,

  library_download: `library_download({ slug })

Download a free (open) book to your local library.

PARAMETERS:
  slug  Book slug from search results

BEHAVIOR:
  Only works for open (free) books.
  Downloads content to .librarian/imported/<slug>/
  Paid books use cloud API — no local download.

EXAMPLE:
  library_download({ slug: "react-patterns" })`,

  import_memories: `import_memories({ format, path, source_name? })

Import knowledge from other AI tools.

PARAMETERS:
  format       jsonl | markdown | cursor | json | sqlite
  path         Path to the file or directory
  source_name  Label for the source (optional)

SUPPORTED SOURCES:
  jsonl     - Anthropic MCP Memory, mcp-knowledge-graph
  markdown  - Obsidian, Basic Memory MCP
  cursor    - Cursor Memory Bank (.cursor-memory/)
  json      - Simple memory servers
  sqlite    - mcp-memory-service, SQLite-vec

EXAMPLES:
  import_memories({ format: "jsonl", path: "~/.aim/memory.jsonl" })
  import_memories({ format: "sqlite", path: "~/memory.db", source_name: "old-project" })

Run rebuild_index() after importing for semantic search.`,

  rebuild_index: `rebuild_index({ force? })

Rebuild the semantic search index for all entries.

PARAMETERS:
  force  Rebuild even if index exists (default: false)

BEHAVIOR:
  Scans local/ and imported/ for all .md files
  Generates 384-dim embeddings using all-MiniLM-L6-v2
  Chunks long content at sentence boundaries (~500 chars)
  First run downloads ~30MB model (cached in .librarian/models/)

WHEN TO USE:
  After import_memories() — new entries need indexing
  After sync() — subscription updates need indexing
  After delete() — remove stale embeddings
  If search results seem wrong or stale

EXAMPLE:
  rebuild_index()
  rebuild_index({ force: true })`,

  unsubscribe: `unsubscribe({ slug })

Cancel a subscription to a book.

PARAMETERS:
  slug  Book slug (from my_books())

EXAMPLE:
  unsubscribe({ slug: "premium-patterns" })

Only works for subscription purchases.
One-time purchases grant permanent access.`,
};

// ============================================================================
// Tool Definition
// ============================================================================

export const helpTool = {
  name: 'help',
  title: 'Get Help',
  description: `Get help on Librarian tools and workflows.

USE THIS TOOL WHEN:
- User asks "how do I use X" about Librarian features
- Need to explain a tool's parameters or behavior
- User is confused about Librarian workflows

TRIGGER PATTERNS:
- "How does brief work?" → help({ topic: "brief" })
- "Help with publishing" → help({ topic: "library_publish" })
- "What can Librarian do?" → help()

Examples:
- help() - Overview of all tools
- help({ topic: "brief" }) - Details on brief()
- help({ topic: "auth" }) - Details on authentication`,

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
