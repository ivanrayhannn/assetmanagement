import { createMockAuth, createSsoAuth, type AuthAdapter } from '../auth/auth';
import { clearDb, loadDb, saveDb, type DemoDb } from './demo/db';
import { buildSeed } from './demo/seed';
import { DemoApi } from './demo/service';
import { HttpApi } from './http';
import type { AmsApi } from './types';

export const API_MODE: 'demo' | 'http' = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'demo';

export interface Backend {
  api: AmsApi;
  auth: AuthAdapter;
  /** Hanya mode demo: kembalikan data ke seed awal. */
  resetDemo?: () => Promise<void>;
}

/** Pilih implementasi API & auth dari konfigurasi build (.env). */
export async function createBackend(): Promise<Backend> {
  const auth = import.meta.env.VITE_AUTH_MODE === 'sso' ? createSsoAuth() : createMockAuth();
  if (API_MODE === 'http') {
    return { api: new HttpApi(import.meta.env.VITE_API_BASE ?? '', () => auth.authHeaders()), auth };
  }
  const db: DemoDb = loadDb() ?? (await buildSeed());
  saveDb(db);
  return {
    api: new DemoApi(db, () => auth.currentUserId(), () => new Date(), () => saveDb(db)),
    auth,
    resetDemo: async () => {
      clearDb();
      Object.assign(db, await buildSeed()); // instance DemoApi tetap, isinya diganti
      saveDb(db);
    },
  };
}
