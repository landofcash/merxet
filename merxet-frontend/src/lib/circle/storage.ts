import {CIRCLE_APP_ID} from '@/config';

export interface CircleStoredState {
  userId?: string | null;
  walletId?: string | null;
  userToken?: string | null;
  tokenExpiresAt?: number | null;
  encryptionKey?: string | null;
}

const STORAGE_KEY = `circle.state.v1.${CIRCLE_APP_ID || 'default'}`;

type State = Required<CircleStoredState>;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Circle storage unavailable:', error);
    return null;
  }
}

function parseState(raw: string | null): CircleStoredState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as CircleStoredState;
  } catch (error) {
    console.warn('Circle storage parse error:', error);
  }
  return {};
}

export function loadState(): CircleStoredState {
  const storage = getStorage();
  if (!storage) return {};
  const raw = storage.getItem(STORAGE_KEY);
  return parseState(raw);
}

function writeState(state: CircleStoredState) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const payload = JSON.stringify(state);
    storage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    console.warn('Circle storage write failed:', error);
  }
}

export function updateState(update: Partial<State>): CircleStoredState {
  const current = loadState();
  const next: CircleStoredState = {
    userId: update.userId ?? current.userId ?? null,
    walletId: update.walletId ?? current.walletId ?? null,
    userToken: update.userToken ?? current.userToken ?? null,
    tokenExpiresAt: update.tokenExpiresAt ?? current.tokenExpiresAt ?? null,
    encryptionKey: update.encryptionKey ?? current.encryptionKey ?? null,
  };
  writeState(next);
  return next;
}

export function clearState(keys?: Array<keyof CircleStoredState>) {
  if (!keys || keys.length === 0) {
    writeState({});
    return;
  }
  const current = loadState();
  const next = {...current};
  for (const key of keys) {
    (next as any)[key] = null;
  }
  writeState(next);
}

export function getStoredWalletId(): string | null {
  const state = loadState();
  return state.walletId ?? null;
}

export function setStoredWalletId(walletId: string | null) {
  updateState({walletId});
}

export function getStoredUserId(): string | null {
  const state = loadState();
  return state.userId ?? null;
}

export function setStoredUserId(userId: string | null) {
  updateState({userId});
}

export function getStoredToken(): { userToken: string; encryptionKey: string; tokenExpiresAt: number } | null {
  const state = loadState();
  if (!state.userToken || !state.encryptionKey || !state.tokenExpiresAt) return null;
  return {
    userToken: state.userToken,
    encryptionKey: state.encryptionKey,
    tokenExpiresAt: state.tokenExpiresAt,
  };
}

export function setStoredToken(params: { userToken: string; encryptionKey: string; tokenExpiresAt: number }) {
  updateState({
    userToken: params.userToken,
    encryptionKey: params.encryptionKey,
    tokenExpiresAt: params.tokenExpiresAt,
  });
}
