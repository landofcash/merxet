import {getCircleApiBaseUrl} from '@/config';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function circleRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getCircleApiBaseUrl();
  if (!baseUrl) throw new Error('Circle API is not configured for this network');
  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new Error(`Circle API request failed with status ${response.status}`);
    return {} as T;
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload?.success) {
    const detail = payload?.error || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  if (!payload?.data) {
    return {} as T;
  }

  return payload.data;
}

export async function fetchPublicKey(): Promise<string | null> {
  const data = await circleRequest<{ publicKey: string | null }>('/public-key', { method: 'GET' });
  return data.publicKey ?? null;
}

export interface CircleUser {
  id: string;
  userId?: string;
}

export async function createUser(): Promise<CircleUser> {
  const data = await circleRequest<{ user: CircleUser }>('/users', { method: 'POST', body: JSON.stringify({}) });
  return data.user;
}

export interface UserTokenResponse {
  userToken: string;
  encryptionKey: string;
  expiresIn?: number;
  cached?: boolean;
}

export async function createUserToken(userId: string): Promise<UserTokenResponse> {
  const data = await circleRequest<UserTokenResponse>('/users/token', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return data;
}

export interface PinWithWalletsResponse {
  challengeId: string;
}

export async function pinWithWallets(params: {
  userToken: string;
  blockchains: string[];
  metadata?: { name?: string }[];
  accountType?: 'EOA' | 'SCA';
  idempotencyKey?: string;
}): Promise<PinWithWalletsResponse> {
  return await circleRequest<PinWithWalletsResponse>('/users/pin-with-wallets', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface ChallengeStatusResponse {
  challenge?: {
    challengeId: string;
    status?: string;
    currentStep?: string;
    result?: unknown;
  };
}

export async function getChallengeStatus(userToken: string, challengeId: string): Promise<ChallengeStatusResponse> {
  return await circleRequest<ChallengeStatusResponse>(`/users/challenges/${encodeURIComponent(challengeId)}?userToken=${encodeURIComponent(userToken)}`, {
    method: 'GET',
  });
}

export interface VerifyPinResponse {
  ok?: boolean;
  submitted?: boolean;
}

export async function verifyPinChallenge(params: { userToken: string; challengeId: string; encryptedPin: string }): Promise<VerifyPinResponse> {
  return await circleRequest<VerifyPinResponse>('/users/challenges/pin/verify', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
