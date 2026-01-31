// ============================================================================
// Error Code Definitions
// JSON-RPC compatible error codes for MCP
// ============================================================================

/**
 * Error codes following JSON-RPC 2.0 conventions
 * -32xxx: Standard JSON-RPC errors
 * -31xxx: Authentication errors
 * -30xxx: Resource errors
 * -29xxx: Network errors
 */
export const ErrorCodes = {
  // Auth errors (-31xxx)
  AUTH_REQUIRED: -31001,
  AUTH_EXPIRED: -31002,
  AUTH_INVALID_SCOPE: -31003,
  AUTH_INVALID_KEY: -31004,

  // Resource errors (-30xxx)
  ENTRY_NOT_FOUND: -30001,
  BOOK_NOT_FOUND: -30002,
  INDEX_STALE: -30003,
  FILE_NOT_FOUND: -30004,
  INVALID_PATH: -30005,

  // Validation errors (-32xxx - JSON-RPC standard)
  INVALID_PARAMS: -32602,
  INVALID_REQUEST: -32600,

  // Network errors (-29xxx)
  API_UNAVAILABLE: -29001,
  NETWORK_TIMEOUT: -29002,
  API_ERROR: -29003,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Custom error class for Librarian MCP
 * Includes error code and retryable flag for AI agents
 */
export class LibrarianError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable: boolean = false) {
    super(message);
    this.name = 'LibrarianError';
    this.code = code;
    this.retryable = retryable;
  }

  /**
   * Convert to JSON-RPC compatible error object
   */
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
    };
  }
}

// ============================================================================
// Helper Functions for Common Errors
// ============================================================================

export function authRequired(): LibrarianError {
  return new LibrarianError(
    ErrorCodes.AUTH_REQUIRED,
    'Authentication required. Use auth({ action: "login" }) to connect.',
    false
  );
}

export function authExpired(): LibrarianError {
  return new LibrarianError(
    ErrorCodes.AUTH_EXPIRED,
    'API key has expired. Use auth({ action: "login" }) to get a new key.',
    false
  );
}

export function entryNotFound(path: string): LibrarianError {
  return new LibrarianError(
    ErrorCodes.ENTRY_NOT_FOUND,
    `Entry not found: ${path}`,
    false
  );
}

export function bookNotFound(slug: string): LibrarianError {
  return new LibrarianError(
    ErrorCodes.BOOK_NOT_FOUND,
    `Book not found: ${slug}`,
    false
  );
}

export function apiError(message: string): LibrarianError {
  return new LibrarianError(
    ErrorCodes.API_ERROR,
    message,
    true // Network errors are typically retryable
  );
}

export function networkTimeout(): LibrarianError {
  return new LibrarianError(
    ErrorCodes.NETWORK_TIMEOUT,
    'Request timed out. Please try again.',
    true
  );
}

export function invalidParams(message: string): LibrarianError {
  return new LibrarianError(
    ErrorCodes.INVALID_PARAMS,
    message,
    false
  );
}
