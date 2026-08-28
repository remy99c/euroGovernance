export const COMMAND_ATTEMPT_RATE_LIMIT = Object.freeze({
  windowMilliseconds: 60_000,
  maximumAttemptsPerActor: 30,
  maximumAttemptsPerAction: 20,
  maximumTrackedActions: 100,
});

export interface CommandAttemptRateLimitState {
  schemaVersion: 1;
  actorHash: string;
  windowStartedAtMillis: number;
  totalAttempts: number;
  actionAttempts: Record<string, number>;
  lastAction: string;
  updatedAt: string;
}

export class CommandAttemptRateLimitError extends Error {
  constructor(message = 'Too many authoritative command attempts. Try again shortly.') {
    super(message);
    this.name = 'CommandAttemptRateLimitError';
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseCurrentState(value: unknown): CommandAttemptRateLimitState | null {
  if (value === undefined || value === null) return null;
  if (!isPlainRecord(value) || !isPlainRecord(value.actionAttempts)) {
    throw new Error('Command attempt rate-limit state is invalid.');
  }
  const actionEntries = Object.entries(value.actionAttempts);
  if (
    value.schemaVersion !== 1 ||
    typeof value.actorHash !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.actorHash) ||
    !Number.isSafeInteger(value.windowStartedAtMillis) ||
    (value.windowStartedAtMillis as number) < 0 ||
    !Number.isSafeInteger(value.totalAttempts) ||
    (value.totalAttempts as number) < 0 ||
    actionEntries.length > COMMAND_ATTEMPT_RATE_LIMIT.maximumTrackedActions ||
    actionEntries.some(
      ([action, count]) =>
        !/^[a-z][a-z0-9_.:-]{2,79}$/u.test(action) ||
        !Number.isSafeInteger(count) ||
        (count as number) < 0
    ) ||
    typeof value.lastAction !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Command attempt rate-limit state is invalid.');
  }
  return value as unknown as CommandAttemptRateLimitState;
}

export function nextCommandAttemptRateLimitState(
  currentValue: unknown,
  input: {
    actorHash: string;
    commandName: string;
    nowMillis: number;
    updatedAt: string;
  }
): CommandAttemptRateLimitState {
  if (!/^[0-9a-f]{64}$/u.test(input.actorHash)) {
    throw new Error('actorHash is invalid.');
  }
  if (!/^[a-z][a-z0-9_.:-]{2,79}$/u.test(input.commandName)) {
    throw new Error('commandName is invalid.');
  }
  if (!Number.isSafeInteger(input.nowMillis) || input.nowMillis < 0) {
    throw new Error('nowMillis is invalid.');
  }

  const current = parseCurrentState(currentValue);
  if (current && current.actorHash !== input.actorHash) {
    throw new Error('Command attempt rate-limit actor binding is invalid.');
  }
  const startsNewWindow =
    !current ||
    input.nowMillis - current.windowStartedAtMillis >=
      COMMAND_ATTEMPT_RATE_LIMIT.windowMilliseconds;

  if (current && input.nowMillis + 5_000 < current.windowStartedAtMillis) {
    throw new Error('Command attempt rate-limit clock moved backwards.');
  }

  const actionAttempts = startsNewWindow ? {} : { ...current.actionAttempts };
  const totalAttempts = startsNewWindow ? 0 : current.totalAttempts;
  const currentActionAttempts = actionAttempts[input.commandName] ?? 0;
  if (
    totalAttempts >= COMMAND_ATTEMPT_RATE_LIMIT.maximumAttemptsPerActor ||
    currentActionAttempts >= COMMAND_ATTEMPT_RATE_LIMIT.maximumAttemptsPerAction
  ) {
    throw new CommandAttemptRateLimitError();
  }
  if (
    currentActionAttempts === 0 &&
    Object.keys(actionAttempts).length >=
      COMMAND_ATTEMPT_RATE_LIMIT.maximumTrackedActions
  ) {
    throw new CommandAttemptRateLimitError();
  }

  actionAttempts[input.commandName] = currentActionAttempts + 1;
  return {
    schemaVersion: 1,
    actorHash: input.actorHash,
    windowStartedAtMillis: startsNewWindow
      ? input.nowMillis
      : current!.windowStartedAtMillis,
    totalAttempts: totalAttempts + 1,
    actionAttempts,
    lastAction: input.commandName,
    updatedAt: input.updatedAt,
  };
}
