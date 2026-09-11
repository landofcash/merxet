import {z} from 'zod';
import {AccountId, Id, Timestamp} from '../domain/records.ts';
import {NetworkSchema} from '../config.ts';

export const ChallengeResponseSchema = z.object({challengeId: Id, accountId: AccountId, network: NetworkSchema, origin: z.string(), message: z.string(), expiresAt: Timestamp});
export const SessionResponseSchema = z.object({accountId: AccountId, network: NetworkSchema, expiresAt: Timestamp, token: z.string()});
export const PreviewResponseSchema = z.object({url: z.string().url(), expiresAt: Timestamp, revisionId: Id});
