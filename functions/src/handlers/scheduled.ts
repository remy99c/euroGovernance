import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/firebase.js';
import { Evidence } from '@eurogovernance/shared-types';

/**
 * Scheduled Function: checkEvidenceExpiriesAndReminders
 * Runs daily at 04:00 UTC to flag expired evidence and generate notifications.
 */
export const checkEvidenceExpiriesAndReminders = onSchedule('0 4 * * *', async () => {
  const now = new Date().toISOString();
  const tenantsSnap = await db.collection('tenants').where('status', '==', 'active').get();

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const expiredEvidenceSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('evidence')
      .where('status', '==', 'valid')
      .where('reviewDueDate', '<=', now)
      .get();

    if (expiredEvidenceSnap.empty) {
      continue;
    }

    const batch = db.batch();
    for (const doc of expiredEvidenceSnap.docs) {
      const evidence = doc.data() as Evidence;
      batch.update(doc.ref, {
        status: 'expired',
        updatedAt: now,
        updatedBy: 'system_cron',
      });

      // Create notification for evidence owner
      const notificationRef = db.collection('tenants').doc(tenantId).collection('notifications').doc();
      batch.set(notificationRef, {
        id: notificationRef.id,
        tenantId,
        recipientId: evidence.createdBy,
        type: 'evidence_expiry_warning',
        title: 'Evidence Review Expired',
        body: `Evidence "${evidence.title}" has passed its review due date and is now marked as expired.`,
        actionUrl: `/evidence/${evidence.id}`,
        isRead: false,
        readAt: null,
        createdAt: now,
      });
    }

    await batch.commit();
  }
});
