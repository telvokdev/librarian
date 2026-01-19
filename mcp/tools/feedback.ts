// ============================================================================
// Feedback Tool
// Send feedback to the Telvok team
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface FeedbackArgs {
  message: string;
  type?: 'bug' | 'feature' | 'general' | 'question';
}

interface FeedbackResult {
  success: boolean;
  message: string;
  feedback_id?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const feedbackTool = {
  name: 'feedback',
  description: `Send feedback to the Telvok team.

Report bugs, request features, or ask questions.

Types:
- bug: Something isn't working
- feature: Request a new feature
- question: Ask about usage
- general: Other feedback

Examples:
- feedback({ message: "The sync tool times out with large books", type: "bug" })
- feedback({ message: "Would love to filter by author", type: "feature" })
- feedback({ message: "Great tool, saved me hours!" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      message: {
        type: 'string',
        description: 'Your feedback message (5-5000 characters)',
      },
      type: {
        type: 'string',
        enum: ['bug', 'feature', 'general', 'question'],
        description: 'Type of feedback (default: general)',
      },
    },
    required: ['message'],
  },

  async handler(args: unknown): Promise<FeedbackResult> {
    const { message, type = 'general' } = args as FeedbackArgs;

    if (!message || typeof message !== 'string') {
      throw new Error('Message is required');
    }

    if (message.trim().length < 5) {
      throw new Error('Message must be at least 5 characters');
    }

    if (message.length > 5000) {
      throw new Error('Message must be 5000 characters or less');
    }

    // Get API key for attribution (optional)
    const apiKey = await loadApiKey();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${TELVOK_API_URL}/api/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: message.trim(),
          type,
          context: {
            source: 'mcp',
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || 'Failed to send feedback',
        };
      }

      return {
        success: true,
        message: data.message || 'Feedback sent! Thank you.',
        feedback_id: data.feedback_id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send feedback: ${errorMessage}`);
    }
  },
};

export default feedbackTool;
