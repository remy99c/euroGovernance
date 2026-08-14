import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import {
  Notification,
  NotificationPriority,
} from '@eurogovernance/shared-types';

export interface ListNotificationsInput {
  tenantId: string;
  isRead?: boolean;
  priority?: NotificationPriority;
}

export interface MarkNotificationReadInput {
  tenantId: string;
  notificationId: string;
}

export interface MarkAllReadInput {
  tenantId: string;
}

/**
 * Callable Function: listRecipientNotifications
 * Returns only notifications intended specifically for the authenticated caller
 */
export const listRecipientNotifications = onCall<ListNotificationsInput>(async (request) => {
  const { tenantId, isRead, priority } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  const authContext = await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db
    .collection('tenants')
    .doc(tenantId)
    .collection('notifications')
    .where('recipientId', '==', authContext.userId);

  if (isRead !== undefined) {
    query = query.where('isRead', '==', isRead);
  }
  if (priority) {
    query = query.where('priority', '==', priority);
  }

  const snap = await query.get();
  const notifications: Notification[] = snap.docs.map((d) => d.data() as Notification);

  return { success: true, count: notifications.length, notifications };
});

/**
 * Callable Function: markNotificationAsRead
 * Updates notification read state for recipient
 */
export const markNotificationAsRead = onCall<MarkNotificationReadInput>(async (request) => {
  const { tenantId, notificationId } = request.data;
  if (!tenantId || !notificationId) {
    throw new HttpsError('invalid-argument', 'tenantId and notificationId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId);

  const notifRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('notifications')
    .doc(notificationId);

  const snap = await notifRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Notification not found.');
  }

  const notif = snap.data() as Notification;
  if (notif.recipientId !== authContext.userId) {
    throw new HttpsError('permission-denied', 'You cannot mark another user’s notification as read.');
  }

  const now = new Date().toISOString();
  await notifRef.update({
    isRead: true,
    readAt: now,
  });

  return { success: true, notificationId, isRead: true, readAt: now };
});

/**
 * Callable Function: markAllNotificationsAsRead
 * Batch marks all unread notifications for caller as read
 */
export const markAllNotificationsAsRead = onCall<MarkAllReadInput>(async (request) => {
  const { tenantId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  const authContext = await requireTenantMember(request, tenantId);

  const unreadSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('notifications')
    .where('recipientId', '==', authContext.userId)
    .where('isRead', '==', false)
    .get();

  if (unreadSnap.empty) {
    return { success: true, updatedCount: 0 };
  }

  const now = new Date().toISOString();
  const batch = db.batch();

  unreadSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      isRead: true,
      readAt: now,
    });
  });

  await batch.commit();

  return { success: true, updatedCount: unreadSnap.size };
});
