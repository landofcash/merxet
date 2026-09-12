import type {RpContext} from '@worldcoin/idkit-core';

export type Environment = 'sandbox' | 'production';
export interface PublicConfig {
  enabled: boolean;
  configured: boolean;
  missing: string[];
  environment: Environment;
}
export interface RequestContext {
  id: string;
  appId: `app_${string}`;
  action: string;
  environment: Environment;
  signal: string;
  rpContext: RpContext;
  expiresAt: string;
}
export interface Verification {
  requestId: string;
  completedAt: string;
  environment: Environment;
  credential: 'face';
  protocolVersion: '3.0';
}
export interface ProviderObservation {
  httpStatus: number;
  environment: string | null;
  identifiers: string[];
  code: string | null;
}
export interface RequestStatus {
  id: string;
  state: 'waiting' | 'verifying' | 'verified' | 'canceled' | 'expired' | 'rejected' | 'unavailable';
  expiresAt: string;
  observation: ProviderObservation | null;
}
export interface SessionStatus {
  account?: {network: string; accountId: string};
  expiresAt: string;
  config: PublicConfig;
  request: RequestStatus | null;
  verification: Verification | null;
}

export interface AccountVerification {
  enabled: boolean;
  network: string;
  accountId: string;
  verified: boolean;
  source: 'preset' | 'world' | null;
  environment: Environment | null;
  verifiedAt: string | null;
  expiresAt: string | null;
}
