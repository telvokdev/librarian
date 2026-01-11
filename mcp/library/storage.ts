import * as path from 'path';

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the library root path.
 * Uses .librarian/ in the current working directory.
 */
export function getLibraryPath(): string {
  return path.join(process.cwd(), '.librarian');
}

/**
 * Get the local entries path.
 */
export function getLocalPath(libraryPath: string): string {
  return path.join(libraryPath, 'local');
}

/**
 * Get the imported entries path.
 */
export function getImportedPath(libraryPath: string): string {
  return path.join(libraryPath, 'imported');
}

/**
 * Get the archived entries path.
 */
export function getArchivedPath(libraryPath: string): string {
  return path.join(libraryPath, 'archived');
}
