import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export interface YaiHandoffIdentity {
  userId: string;
  personaId: string;
  accountId: string;
  name: string;
  email?: string;
  role: string;
}

export interface YaiLibreChatUserData {
  idOnTheSource: string;
  name: string;
  username: string;
  email: string;
  emailVerified: true;
  provider: 'yai';
  yaiSessionVersion: string;
}

export async function redeemYaiTicket(options: {
  ticket: string;
  accountId: string;
  apiBaseUrl: string;
  serviceSecret: string;
}): Promise<YaiHandoffIdentity> {
  const { ticket, accountId, apiBaseUrl, serviceSecret } = options;
  if (!/^[A-Fa-f\d]{24}$/.test(accountId) || !/^[A-Za-z0-9_-]{40,60}$/.test(ticket)) {
    throw new Error('Invalid YAI handoff request');
  }
  if (!apiBaseUrl || !serviceSecret || serviceSecret.length < 32) {
    throw new Error('YAI handoff is not configured');
  }

  const response = await fetch(
    `${apiBaseUrl.replace(/\/$/, '')}/integrations/librechat/tickets/redeem`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-yai-librechat-service-key': serviceSecret,
      },
      body: JSON.stringify({ ticket, accountId }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) {
    throw new Error(`YAI handoff was rejected (${response.status})`);
  }
  const identity = (await response.json()) as YaiHandoffIdentity;
  if (
    identity.accountId !== accountId ||
    !identity.userId ||
    !identity.personaId ||
    !identity.name
  ) {
    throw new Error('YAI returned an invalid chat identity');
  }
  return identity;
}

export function buildYaiLibreChatUser(identity: YaiHandoffIdentity): YaiLibreChatUserData {
  const idOnTheSource = `yai:${identity.userId}:${identity.personaId}`;
  const emailHash = createHash('sha256').update(idOnTheSource).digest('hex').slice(0, 32);
  const username = `yai-${identity.userId.slice(0, 8)}-${identity.personaId.slice(0, 8)}`;
  return {
    idOnTheSource,
    name: identity.name.slice(0, 80),
    username,
    email: `yai-${emailHash}@yai.local`,
    emailVerified: true,
    provider: 'yai',
    yaiSessionVersion: randomUUID(),
  };
}

export async function ensureYaiLibreChatUser(
  accountId: string,
  identity: YaiHandoffIdentity,
  store: {
    findById(id: string): Promise<{ idOnTheSource?: string } | null>;
    create(user: YaiLibreChatUserData & { _id: string }): Promise<unknown>;
    update(id: string, user: YaiLibreChatUserData): Promise<unknown>;
  },
): Promise<void> {
  if (identity.accountId !== accountId) {
    throw new Error('YAI account mapping mismatch');
  }
  const data = buildYaiLibreChatUser(identity);
  const existing = await store.findById(accountId);
  if (existing && existing.idOnTheSource !== data.idOnTheSource) {
    throw new Error('LibreChat account is already linked to another YAI identity');
  }
  if (existing) {
    await store.update(accountId, data);
  } else {
    await store.create({ _id: accountId, ...data });
  }
}

export function isValidYaiServiceSecret(
  candidate: string | undefined,
  expected: string | undefined,
): boolean {
  if (!candidate || !expected) {
    return false;
  }
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return (
    candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes)
  );
}

export async function revokeYaiUserSessions(
  userId: string,
  store: {
    findLinkedAccounts(userId: string): Promise<Array<{ _id: { toString(): string } | string }>>;
    rotateSessionVersion(accountId: string, version: string): Promise<unknown>;
    deleteAllSessions(accountId: string): Promise<unknown>;
  },
): Promise<void> {
  if (!/^[a-f\d-]{36}$/i.test(userId)) {
    throw new Error('Invalid YAI user id');
  }
  const linkedAccounts = await store.findLinkedAccounts(userId);
  await Promise.all(
    linkedAccounts.map(async (account) => {
      const accountId = typeof account._id === 'string' ? account._id : account._id.toString();
      await Promise.all([
        store.rotateSessionVersion(accountId, randomUUID()),
        store.deleteAllSessions(accountId),
      ]);
    }),
  );
}
