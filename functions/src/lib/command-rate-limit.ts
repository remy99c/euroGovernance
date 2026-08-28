import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import {
  CommandAttemptRateLimitError,
  nextCommandAttemptRateLimitState,
} from './command-rate-limit-values.js';

/**
 * Charges every authenticated command attempt before untrusted envelope
 * parsing or domain reads. The document is global per actor, contains only a
 * one-way UID hash, and is inaccessible to browsers through default-deny Rules.
 */
export async function consumeCommandAttemptBudget(
  actorId: string,
  commandName: string,
  requestedAt: string
): Promise<void> {
  const actorHash = createHash('sha256').update(actorId, 'utf8').digest('hex');
  const rateLimitRef = db.collection('command_rate_limits').doc(actorHash);
  const nowMillis = Date.parse(requestedAt);

  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateLimitRef);
      const nextState = nextCommandAttemptRateLimitState(
        snapshot.exists ? snapshot.data() : null,
        { actorHash, commandName, nowMillis, updatedAt: requestedAt }
      );
      transaction.set(rateLimitRef, {
        ...nextState,
        // TTL is a retention control, not part of the rate calculation. Each
        // actor has one rolling document, deleted after 90 days of inactivity.
        expiresAt: Timestamp.fromMillis(nowMillis + 90 * 24 * 60 * 60 * 1_000),
      });
    });
  } catch (error) {
    if (error instanceof CommandAttemptRateLimitError) {
      throw new HttpsError('resource-exhausted', error.message);
    }
    throw error;
  }
}
