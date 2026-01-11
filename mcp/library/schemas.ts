import { z } from 'zod';

// ============================================================================
// Core Types
// ============================================================================

export const SourceTypeSchema = z.enum(['local', 'imported', 'archived']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const EntrySourceSchema = z.enum(['manual', 'precompact', 'imported']);
export type EntrySource = z.infer<typeof EntrySourceSchema>;

// ============================================================================
// Library Entry
// ============================================================================

export const LibraryEntrySchema = z.object({
  id: z.string().uuid(),
  topics: z.array(z.string().min(1)).min(1),
  content: z.string().min(1),
  created: z.string().datetime(),
  source: SourceTypeSchema,
  origin: EntrySourceSchema.optional(),
  imported_from: z.string().optional(),
});

export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;

// ============================================================================
// File Frontmatter (YAML)
// ============================================================================

export const FrontmatterSchema = z.object({
  id: z.string().uuid(),
  topics: z.array(z.string().min(1)).min(1),
  created: z.string().datetime(),
  source: EntrySourceSchema.optional(),
  imported_from: z.string().optional(),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

// ============================================================================
// MCP Tool Parameters
// ============================================================================

export const BriefParamsSchema = z.object({
  topic: z.string().min(1).describe('What to query (e.g., "deployment", "api-design")'),
  context: z.string().optional().describe('Additional context to narrow results'),
});

export type BriefParams = z.infer<typeof BriefParamsSchema>;

export const RecordParamsSchema = z.object({
  topics: z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1),
  ]).describe('Topic tags - string or array (e.g., "deployment" or ["stripe", "webhooks"])'),
  content: z.string().min(1).describe('The reasoning to record'),
});

export type RecordParams = z.infer<typeof RecordParamsSchema>;

export const AdoptParamsSchema = z.object({
  entry_id: z.string().uuid().describe('ID of the imported entry to adopt'),
  library_name: z.string().optional().describe('Name of the imported library'),
});

export type AdoptParams = z.infer<typeof AdoptParamsSchema>;

// ============================================================================
// MCP Tool Results
// ============================================================================

export const BriefResultSchema = z.object({
  entries: z.array(LibraryEntrySchema),
  conflict: z.boolean().optional(),
  conflict_summary: z.string().optional(),
});

export type BriefResult = z.infer<typeof BriefResultSchema>;

export const ImportedLibrarySchema = z.object({
  name: z.string(),
  entry_count: z.number(),
  purchased_at: z.string().datetime(),
  sync_preference: z.enum(['auto', 'manual', 'pinned']).optional(),
  last_synced: z.string().datetime().optional(),
});

export type ImportedLibrary = z.infer<typeof ImportedLibrarySchema>;

export const StateResultSchema = z.object({
  entries: z.array(LibraryEntrySchema),
  imported_libraries: z.array(ImportedLibrarySchema),
});

export type StateResult = z.infer<typeof StateResultSchema>;

export const RecordResultSchema = z.object({
  entry: LibraryEntrySchema,
  path: z.string(),
});

export type RecordResult = z.infer<typeof RecordResultSchema>;

// ============================================================================
// Extraction Types
// ============================================================================

export const ExtractedEntrySchema = z.object({
  topics: z.array(z.string().min(1)).min(1),
  content: z.string().min(1),
});

export type ExtractedEntry = z.infer<typeof ExtractedEntrySchema>;

export const ExtractionResultSchema = z.object({
  entries: z.array(ExtractedEntrySchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
