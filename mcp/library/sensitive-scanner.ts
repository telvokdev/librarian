// ============================================================================
// Sensitive Data Scanner
// Shared module for scanning entries before they leave the user's machine.
// Used by: library_publish (mandatory), audit tool (on-demand)
// ============================================================================

export interface SensitiveFinding {
  entry: string;
  file?: string;
  matches: string[];
}

interface ScannableEntry {
  title: string;
  content: string;
  intent?: string;
  context?: string;
  reasoning?: string;
  example?: string;
  originalPath?: string;
}

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // API keys and tokens
  { pattern: /sk_(live|test)_[a-zA-Z0-9]{10,}/g, label: 'Stripe secret key' },
  { pattern: /whsec_[a-zA-Z0-9]{10,}/g, label: 'Stripe webhook secret' },
  { pattern: /tvk_[a-zA-Z0-9]{20,}/g, label: 'Telvok API key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: 'GitHub personal access token' },
  { pattern: /xoxb-[a-zA-Z0-9-]+/g, label: 'Slack bot token' },
  { pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, label: 'JWT token' },
  { pattern: /AKIA[A-Z0-9]{16}/g, label: 'AWS access key' },
  { pattern: /npm_[a-zA-Z0-9]{36}/g, label: 'npm token' },

  // Credentials in assignments
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, label: 'password value' },
  { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/gi, label: 'secret value' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, label: 'API key value' },

  // Personal data
  { pattern: /\b[a-zA-Z0-9._%+-]+@(?!example\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, label: 'email address' },

  // Connection strings with credentials
  { pattern: /:\/\/[^:]+:[^@]+@[^/\s]+/g, label: 'URL with embedded credentials' },
];

/**
 * Scan entries for sensitive data patterns.
 * Returns findings grouped by entry.
 */
export function scanForSensitiveData(entries: ScannableEntry[]): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];

  for (const entry of entries) {
    const textToScan = [
      entry.title,
      entry.content,
      entry.intent,
      entry.context,
      entry.reasoning,
      entry.example,
    ].filter(Boolean).join('\n');

    const matches: string[] = [];
    for (const { pattern, label } of SENSITIVE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(textToScan)) {
        matches.push(label);
      }
    }

    if (matches.length > 0) {
      findings.push({
        entry: entry.title,
        file: entry.originalPath,
        matches,
      });
    }
  }

  return findings;
}
