import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/firebase.js';
import {
  Evidence,
  Certification,
  ProcessorCertification,
  evaluateCertificationReminders,
  evaluateProcessorCertificationReminders,
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

    // 2. Process internal certifications
    const [certSnap, evSnap, procertSnap] = await Promise.all([
      db.collection('tenants').doc(tenantId).collection('certifications').get(),
      db.collection('tenants').doc(tenantId).collection('evidence').get(),
      db.collection('tenants').doc(tenantId).collection('processor_certifications').get(),
    ]);

    const certs = certSnap.docs.map((d) => d.data() as Certification);
    const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);
    const processorCerts = procertSnap.docs.map((d) => d.data() as ProcessorCertification);

    // Certification date states are derived at read/evaluation time. Do not
    // mutate authoritative records here outside their revisioned command and
    // immutable-version chain.

    // Auto-transition expired processor certifications
    for (const doc of procertSnap.docs) {
      const pc = doc.data() as ProcessorCertification;
      if (
        pc.status === 'active_valid' &&
        !pc.isHistoricVersion &&
        pc.reviewStatus !== 'superseded' &&
        new Date(pc.validUntil).getTime() <= nowDate.getTime()
      ) {
        batch.update(doc.ref, {
          status: 'expired',
          updatedAt: now,
          updatedBy: 'system_cron',
        });
        hasUpdates = true;
      }
    }

    // Evaluate internal certification reminders
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

    // Evaluate processor certification reminders
    const procertReminders = evaluateProcessorCertificationReminders(processorCerts, {
      asOfDate: nowDate,
      windowDays: 90,
      gracePeriodDays: 30,
    });
    for (const pr of procertReminders) {
      const notificationRef = db.collection('tenants').doc(tenantId).collection('notifications').doc();
      batch.set(notificationRef, {
        id: notificationRef.id,
        tenantId,
        recipientId: pr.recipientUserId,
        type: pr.reminderType,
        title: pr.title,
        body: pr.message,
        actionUrl: `/processor-inventory?certId=${pr.certificationId}`,
        sourceEntityType: 'processor_certification',
        sourceEntityId: pr.certificationId,
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
