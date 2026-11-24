import { db, isCloudSqlConfigured } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  role = 'School Administrator'
) {
  if (!isCloudSqlConfigured()) return null;
  try {
    const now = new Date();
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || null,
        role,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || null,
          role,
          updatedAt: now,
        },
      })
      .returning();

    return result[0] ?? null;
  } catch (error) {
    console.error('Database query failed while syncing user:', error);
    throw new Error('Database user synchronization failed. Please try again later.', {
      cause: error,
    });
  }
}
