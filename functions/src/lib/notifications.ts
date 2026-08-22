import { db } from './firebase.js';
import {
  Notification,
  NotificationType,
  NotificationPriority,
} from '@eurogovernance/shared-types';

export interface CreateNotificationParams {
  tenantId: string;
  recipientId: string;
  recipientEmail?: string;
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  linkUrl?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  deduplicationKey?: string | null;
}

/**
 * Creates an immutable recipient-scoped notification in Firestore using privileged Admin SDK.
 * Supports duplicate suppression via deduplicationKey.
 * Direct client creation is blocked by security rules.
 */
export async function createNotification(params: CreateNotificationParams): Promise<Notification> {
  const {
    tenantId,
    recipientId,
    recipientEmail,
    title,
    message,
    type,
    priority = 'medium',
    linkUrl = null,
    sourceEntityType = null,
    sourceEntityId = null,
    deduplicationKey = null,
  } = params;

  if (deduplicationKey) {
    const existingSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('notifications')
      .where('deduplicationKey', '==', deduplicationKey)
      .limit(1)
      .get();

    if (!existingSnap.empty && existingSnap.docs[0]) {
      return existingSnap.docs[0].data() as Notification;
    }
  }

  const notifRef = db.collection('tenants').doc(tenantId).collection('notifications').doc();
  const now = new Date().toISOString();

  const notifDoc: Notification = {
    id: notifRef.id,
    tenantId,
    recipientId,
    recipientEmail,
    title: title.trim(),
    body: message.trim(),
    type,
    priority,
    isRead: false,
    readAt: null,
    linkUrl,
    actionUrl: linkUrl || '',
    sourceEntityType,
    sourceEntityId,
    deduplicationKey,
    createdAt: now,
  };

  await notifRef.set(notifDoc);
  return notifDoc;
}
