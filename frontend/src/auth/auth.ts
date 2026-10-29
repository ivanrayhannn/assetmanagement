import type { User } from '../api/types';

/**
 * Hook autentikasi. Mock (dev/demo) dan AD SSO memakai interface yang sama;
 * dipilih lewat VITE_AUTH_MODE tanpa mengubah komponen lain.
 */
export interface AuthAdapter {
  readonly mode: 'mock' | 'sso';
  /** User yang sedang login, atau null bila belum. */
  currentUserId(): string | null;
  /** Mock: pilih user seed. SSO: redirect ke login AD (userId diabaikan). */
  signIn(userId?: string): Promise<void>;
  signOut(): Promise<void>;
  /** Header yang dikirim ke API pada setiap request. */
  authHeaders(): Promise<Record<string, string>>;
}

const KEY = 'ams-mock-user';
const DEFAULT_USER = 'EMP001';

/** Mock role: user dipilih dari seed (EMP001 Admin GA, EMP002–004 PIC, EMP005 Executive, EMP006+ User). */
export function createMockAuth(): AuthAdapter {
  let userId: string | null = null;
  try {
    userId = localStorage.getItem(KEY);
  } catch {
    /* storage tidak tersedia */
  }
  userId ??= DEFAULT_USER;
  return {
    mode: 'mock',
    currentUserId: () => userId,
    async signIn(id?: string) {
      userId = id ?? DEFAULT_USER;
      try {
        localStorage.setItem(KEY, userId);
      } catch {
        /* abaikan */
      }
    },
    async signOut() {
      userId = DEFAULT_USER;
    },
    authHeaders: async (): Promise<Record<string, string>> => (userId ? { 'X-Ams-Mock-User': userId } : {}),
  };
}

/**
 * Titik sambung AD SSO (OIDC). Diisi saat API & app registration AD siap:
 * - signIn: redirect ke authority OIDC (mis. ADFS / Entra ID) dengan PKCE
 * - currentUserId: klaim `samaccountname`/`preferred_username` dari ID token
 * - authHeaders: { Authorization: `Bearer ${accessToken}` }
 * Role AMS dipetakan dari AD group di API, bukan di frontend.
 */
export function createSsoAuth(): AuthAdapter {
  const notReady = () => {
    throw new Error('Login AD SSO belum dikonfigurasi. Gunakan VITE_AUTH_MODE=mock.');
  };
  return {
    mode: 'sso',
    currentUserId: () => null,
    signIn: async () => notReady(),
    signOut: async () => {},
    authHeaders: async () => ({}),
  };
}

export const userLabel = (u: User, officeNm?: string) =>
  u.roleCd === 'ADMIN_GA'
    ? `${u.userNm} – Admin GA`
    : u.roleCd === 'PIC'
      ? `${u.userNm} – PIC ${officeNm ?? u.officeCd}`
      : u.roleCd === 'EXEC'
        ? `${u.userNm} – Executive`
        : u.roleCd === 'AUDITOR'
          ? `${u.userNm} – Internal Auditor`
          : `${u.userNm} – User (${u.officeCd})`;
