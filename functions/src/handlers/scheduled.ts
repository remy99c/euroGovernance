import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/firebase.js';
import {
  Evidence,
  Certification,
  evaluateCertificationReminders,
} from '@eurogovernance/shared-types';

/**
 * Scheduled Function: checkEvidenceExpiriesAndReminders
 * Runs daily at 04:00 UTC to flag expired evidence, evaluate certification lifecycles, and generate notifications.
 */
export const checkEvidenceExpiriesAndReminders = onSchedule('0 4 * * *', async () => {
  const now = new Date().toISOString();
  const nowDate = new Date();
  const tenantsSnap = await db.collection('tenants').where('status', '==', 'active').get();

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const batch = db.batch();
    let hasUpdates = false;

    // 1. Process expired evidence
    const expiredEvidenceSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('evidence')
      .where('status', '==', 'valid')
      .where('reviewDueDate', '<=', now)
      .get();

    for (const doc of expiredEvidenceSnap.docs) {
      const evidence = doc.data() as Evidence;
      batch.update(doc.ref, {
        status: 'expired',
        updatedAt: now,
        updatedBy: 'system_cron',
      });
      hasUpdates = true;

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

    // 2. Process certifications
    const [certSnap, evSnap] = await Promise.all([
      db.collection('tenants').doc(tenantId).collection('certifications').get(),
      db.collection('tenants').doc(tenantId).collection('evidence').get(),
    ]);

    const certs = certSnap.docs.map((d) => d.data() as Certification);
    const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);

    // Auto-transition expired active certifications
    for (const doc of certSnap.docs) {
      const c = doc.data() as Certification;
      if (c.status === 'active_valid' && new Date(c.expiryDate).getTime() <= nowDate.getTime()) {
        batch.update(doc.ref, {
          status: 'expired',
          updatedAt: now,
          updatedBy: 'system_cron',
        });
        hasUpdates = true;
      }
    }

    // Evaluate reminders
    const reminders = evaluateCertificationReminders(certs, evidenceDocs, { asOfDate: nowDate, windowDays: 90 });
    for (const r of reminders) {
      const notificationRef = db.collection('tenants').doc(tenantId).collection('notifications').doc();
      batch.set(notificationRef, {
        id: notificationRef.id,
        tenantId,
        recipientId: r.recipientUserId,
        type: r.reminderType,
        title: r.title,
        body: r.message,
        actionUrl: `/certifications/${r.certificationId}`,
        isRead: false,
        readAt: null,
        createdAt: now,
      });
      hasUpdates = true;
    }

    if (hasUpdates) {
      await batch.commit();
    }
  }
});
