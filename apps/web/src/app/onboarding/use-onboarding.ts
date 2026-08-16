'use client';

/**
 * euroGovernance - Resumable Multi-Tenant Onboarding State Hook
 *
 * Security & State Invariants:
 * 1. Multi-Tenant Scoping: Onboarding state is saved under `/tenants/{tenantId}/onboarding_state/{userId}`.
 * 2. Client Resilience: State is automatically auto-saved on step changes and restored across sessions.
 * 3. Graceful Fallback: Operates in offline/memory mode if Firestore read fails.
 */

import { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { UserRole, UserOnboardingProgress } from '@eurogovernance/shared-types';
import { PERSONA_ONBOARDING_FLOWS } from './persona-flows';

export function useOnboarding(tenantId: string, userId: string, role: UserRole) {
  const [progress, setProgress] = useState<UserOnboardingProgress | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const flowConfig = PERSONA_ONBOARDING_FLOWS[role] || PERSONA_ONBOARDING_FLOWS.tenant_admin;
  const totalSteps = flowConfig?.steps?.length || 5;

  useEffect(() => {
    if (!tenantId || !userId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'tenants', tenantId, 'onboarding_state', userId);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setProgress(snap.data() as UserOnboardingProgress);
        } else {
          // Initialize default unstarted state in memory
          const defaultState: UserOnboardingProgress = {
            userId,
            tenantId,
            role,
            status: 'not_started',
            currentStepId: flowConfig.steps[0]?.id || 'step_0',
            currentStepIndex: 0,
            completedStepIds: [],
            totalSteps,
            hasDismissedBanner: false,
            startedAt: new Date().toISOString(),
            completedAt: null,
            lastActiveAt: new Date().toISOString(),
          };
          setProgress(defaultState);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('[useOnboarding] Snapshot listener warning:', err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId, userId, role, totalSteps, flowConfig]);

  const saveProgress = useCallback(
    async (updates: Partial<UserOnboardingProgress>) => {
      if (!tenantId || !userId) return;
      const docRef = doc(db, 'tenants', tenantId, 'onboarding_state', userId);
      const payload = {
        ...updates,
        tenantId,
        userId,
        role,
        lastActiveAt: new Date().toISOString(),
      };

      try {
        await setDoc(docRef, payload, { merge: true });
      } catch (err) {
        console.warn('[useOnboarding] Failed to persist progress to Firestore:', err);
      }

      setProgress((prev) => (prev ? { ...prev, ...payload } : (payload as UserOnboardingProgress)));
    },
    [tenantId, userId, role]
  );

  const markStepComplete = useCallback(
    async (stepId: string, nextStepIndex?: number) => {
      const currentCompleted = progress?.completedStepIds || [];
      const updatedCompleted = Array.from(new Set([...currentCompleted, stepId]));
      const nextIndex = typeof nextStepIndex === 'number' ? nextStepIndex : (progress?.currentStepIndex || 0) + 1;
      const nextStepId = flowConfig.steps[nextIndex]?.id || stepId;

      await saveProgress({
        status: 'in_progress',
        completedStepIds: updatedCompleted,
        currentStepIndex: nextIndex,
        currentStepId: nextStepId,
      });
    },
    [progress, flowConfig, saveProgress]
  );

  const dismissBanner = useCallback(async () => {
    await saveProgress({
      hasDismissedBanner: true,
      status: progress?.status === 'completed' ? 'completed' : 'dismissed',
    });
  }, [progress, saveProgress]);

  const resumeOnboarding = useCallback(async () => {
    await saveProgress({
      hasDismissedBanner: false,
      status: 'in_progress',
    });
  }, [saveProgress]);

  const completeOnboarding = useCallback(async () => {
    const allStepIds = flowConfig.steps.map((s) => s.id);
    await saveProgress({
      status: 'completed',
      completedStepIds: allStepIds,
      currentStepIndex: flowConfig.steps.length - 1,
      completedAt: new Date().toISOString(),
      hasDismissedBanner: true,
    });
  }, [flowConfig, saveProgress]);

  const isCompleted = progress?.status === 'completed';
  const isDismissed = progress?.status === 'dismissed' || progress?.hasDismissedBanner === true;
  const currentStepIndex = progress?.currentStepIndex || 0;
  const percentComplete = Math.min(100, Math.round(((progress?.completedStepIds?.length || 0) / totalSteps) * 100));

  return {
    progress,
    loading,
    flowConfig,
    totalSteps,
    currentStepIndex,
    percentComplete,
    isCompleted,
    isDismissed,
    saveProgress,
    markStepComplete,
    dismissBanner,
    resumeOnboarding,
    completeOnboarding,
  };
}
