import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Backend } from '../api';
import { errorMessage } from '../api/errors';
import type { AmsApi, Category, Office, RoleCd, User } from '../api/types';

export type TabKey = 'dashboard' | 'assets' | 'tracking' | 'opname' | 'laporan' | 'health' | 'documents' | 'audit';

/** Menu per role (FSD §2 role matrix, mengikuti prototipe). */
export const TABS_BY_ROLE: Record<RoleCd, TabKey[]> = {
  ADMIN_GA: ['dashboard', 'assets', 'tracking', 'opname', 'laporan', 'health', 'documents'],
  PIC: ['dashboard', 'assets', 'tracking', 'opname', 'health', 'documents'],
  USER: ['tracking'],
  EXEC: ['dashboard', 'assets', 'tracking', 'laporan', 'health', 'audit'],
  AUDITOR: ['audit', 'dashboard', 'assets', 'laporan'],
};

interface AppState {
  api: AmsApi;
  backend: Backend;
  me: User;
  users: User[];
  offices: Office[];
  categories: Category[];
  officeNm: (cd: string | null | undefined) => string;
  categoryNm: (cd: string) => string;
  userNm: (id: string | null | undefined) => string | null;
  /** Naik setiap ada perubahan data; dipakai sebagai dependency reload. */
  version: number;
  refresh: () => void;
  switchUser: (userId: string) => Promise<void>;
  toast: (msg: string) => void;
  /** Jalankan aksi, tampilkan toast sukses / pesan error. Return true bila berhasil. */
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp di luar AppProvider');
  return v;
};

export function AppProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const { api, auth } = backend;
  const [master, setMaster] = useState<{ users: User[]; offices: Office[]; categories: Category[] } | null>(null);
  const [meId, setMeId] = useState(auth.currentUserId());
  const [version, setVersion] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const timer = useRef<number>();

  useEffect(() => {
    Promise.all([api.listUsers(), api.listOffices(), api.listCategories()])
      .then(([users, offices, categories]) => setMaster({ users, offices, categories }))
      .catch((e) => setFatal(errorMessage(e)));
  }, [api, version]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  if (fatal) return <div className="loading">Gagal memuat aplikasi: {fatal}</div>;
  if (!master) return <div className="loading">Memuat…</div>;
  const me = master.users.find((u) => u.userId === meId) ?? master.users[0];

  const state: AppState = {
    api,
    backend,
    me,
    ...master,
    officeNm: (cd) => master.offices.find((o) => o.officeCd === cd)?.officeNm ?? cd ?? '–',
    categoryNm: (cd) => master.categories.find((c) => c.categoryCd === cd)?.categoryNm ?? cd,
    userNm: (id) => (id ? master.users.find((u) => u.userId === id)?.userNm ?? id : null),
    version,
    refresh,
    toast,
    switchUser: async (userId) => {
      await auth.signIn(userId);
      setMeId(userId);
      refresh();
    },
    run: async (action, success) => {
      try {
        await action();
        if (success) toast(success);
        refresh();
        return true;
      } catch (e) {
        toast(errorMessage(e));
        return false;
      }
    },
  };

  return (
    <Ctx.Provider value={state}>
      {children}
      <div className={`toast${toastMsg ? ' show' : ''}`} role="status">
        {toastMsg}
      </div>
    </Ctx.Provider>
  );
}

/** Muat data async; dimuat ulang saat deps atau `version` berubah. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const { version } = useApp();
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (e) => alive && setState({ error: errorMessage(e), loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}
