import { batchSetDocuments, logAudit, SchoolStoreState } from './firestoreService';

export interface HybridBatchOperation {
  collectionName: string;
  docId: string;
  data: Record<string, unknown>;
}

export interface HybridDraftAudit {
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  actorRole?: string;
}

export interface HybridPendingDraft {
  id: string;
  schoolId: string;
  label: string;
  category: 'scores' | 'kg_competency' | 'personality';
  recordCount: number;
  createdAt: string;
  ops: HybridBatchOperation[];
  audit?: HybridDraftAudit;
}

export interface CachedSnapshotBundle {
  schoolId: string;
  cachedAt: string;
  snapshot: SchoolStoreState;
}

const SNAPSHOT_PREFIX = 'hybrid_school_snapshot_v1_';
const QUEUE_PREFIX = 'hybrid_offline_queue_v1_';

const syncListeners = new Set<() => void>();

export function onHybridSyncChange(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifyHybridSyncChange() {
  for (const fn of syncListeners) {
    fn();
  }
}

export function saveCachedSchoolSnapshot(schoolId: string, snapshot: SchoolStoreState): void {
  if (!schoolId || typeof window === 'undefined') return;
  try {
    const bundle: CachedSnapshotBundle = {
      schoolId,
      cachedAt: new Date().toISOString(),
      snapshot,
    };
    window.localStorage.setItem(`${SNAPSHOT_PREFIX}${schoolId}`, JSON.stringify(bundle));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadCachedSchoolSnapshot(schoolId: string): CachedSnapshotBundle | null {
  if (!schoolId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${SNAPSHOT_PREFIX}${schoolId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSnapshotBundle;
    if (!parsed || !parsed.snapshot) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getHybridDrafts(schoolId: string): HybridPendingDraft[] {
  if (!schoolId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${QUEUE_PREFIX}${schoolId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HybridPendingDraft[]) : [];
  } catch {
    return [];
  }
}

function writeHybridDrafts(schoolId: string, drafts: HybridPendingDraft[]): void {
  if (!schoolId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${QUEUE_PREFIX}${schoolId}`, JSON.stringify(drafts));
  } catch {
    // Ignore quota failures
  }
  notifyHybridSyncChange();
}

export function enqueueHybridDraft(params: {
  schoolId: string;
  label: string;
  category: HybridPendingDraft['category'];
  ops: HybridBatchOperation[];
  audit?: HybridDraftAudit;
}): HybridPendingDraft {
  const existing = getHybridDrafts(params.schoolId);
  const draft: HybridPendingDraft = {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    schoolId: params.schoolId,
    label: params.label,
    category: params.category,
    recordCount: params.ops.length,
    createdAt: new Date().toISOString(),
    ops: params.ops,
    audit: params.audit,
  };
  // Replace an older queued draft with the exact same label so re-saves stay clean
  const deduped = existing.filter((d) => d.label !== params.label);
  writeHybridDrafts(params.schoolId, [draft, ...deduped]);
  return draft;
}

export function removeHybridDraft(schoolId: string, draftId: string): void {
  const remaining = getHybridDrafts(schoolId).filter((d) => d.id !== draftId);
  writeHybridDrafts(schoolId, remaining);
}

export function clearHybridDrafts(schoolId: string): void {
  writeHybridDrafts(schoolId, []);
}

export async function syncHybridDrafts(schoolId: string): Promise<{
  syncedCount: number;
  failedCount: number;
  lastError: string | null;
}> {
  const drafts = getHybridDrafts(schoolId);
  if (drafts.length === 0) {
    return { syncedCount: 0, failedCount: 0, lastError: null };
  }

  let syncedCount = 0;
  let failedCount = 0;
  let lastError: string | null = null;
  const remaining: HybridPendingDraft[] = [];

  // Process oldest first so latest edits win
  const chronological = [...drafts].reverse();
  for (const draft of chronological) {
    try {
      const CHUNK_SIZE = 40;
      for (let i = 0; i < draft.ops.length; i += CHUNK_SIZE) {
        await batchSetDocuments(draft.ops.slice(i, i + CHUNK_SIZE));
      }
      if (draft.audit) {
        await logAudit({
          ...draft.audit,
          summary: `${draft.audit.summary} (Synced from offline draft)`,
        });
      }
      syncedCount++;
    } catch (err) {
      failedCount++;
      lastError = err instanceof Error ? err.message : 'Unable to sync queued offline draft.';
      remaining.unshift(draft);
    }
  }

  writeHybridDrafts(schoolId, remaining);
  return { syncedCount, failedCount, lastError };
}
