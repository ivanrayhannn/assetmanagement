import { useState, type ReactNode } from 'react';
import { API_MODE } from '../api';
import { userLabel } from '../auth/auth';
import { shortOffice } from '../domain/labels';
import { Icon } from '../components/Icon';
import { Dialog } from '../components/ui';
import { TABS_BY_ROLE, useApp, type TabKey } from './AppContext';

const TAB_LABEL: Record<TabKey, string> = {
  dashboard: 'Dashboard',
  assets: 'Daftar Asset',
  tracking: 'Tracking',
  opname: 'Stock Opname',
  laporan: 'Laporan Selisih',
  health: 'Kesehatan Asset',
  documents: 'Dokumen AI',
  audit: 'Audit & Anomali',
};
const AI_TABS: TabKey[] = ['health', 'documents', 'audit'];
const TAB_SHORT: Record<TabKey, string> = { dashboard: 'Dashboard', assets: 'Asset', tracking: 'Tracking', opname: 'Opname', laporan: 'Laporan', health: 'Kesehatan', documents: 'Dokumen', audit: 'Audit' };

/** App shell responsif: sidebar di desktop, top bar + bottom nav di HP (prototipe). */
export function Shell({ tab, onTab, children }: { tab: TabKey; onTab: (t: TabKey) => void; children: ReactNode }) {
  const { me, users, officeNm, switchUser, backend, refresh, toast } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const tabs = TABS_BY_ROLE[me.roleCd];
  const mock = backend.auth.mode === 'mock';

  const userSelect = (id: string, cls?: string) =>
    mock ? (
      <select id={id} className={cls} value={me.userId} onChange={(e) => switchUser(e.target.value)} aria-label="Masuk sebagai">
        {(['ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR', 'USER'] as const).map((r) => (
          <optgroup key={r} label={{ ADMIN_GA: 'Admin GA', PIC: 'PIC Kantor', EXEC: 'Executive Management', AUDITOR: 'Internal Auditor', USER: 'User / Karyawan' }[r]}>
            {users
              .filter((u) => u.roleCd === r && u.isActive)
              .map((u) => (
                <option key={u.userId} value={u.userId}>
                  {userLabel(u, shortOffice(officeNm(u.officeCd)))}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    ) : (
      <span>{me.userNm}</span>
    );

  const btn = (k: TabKey, short: boolean) => (
    <button key={k} onClick={() => onTab(k)} aria-current={k === tab ? 'page' : undefined}>
      <Icon name={k} />
      <span>{short ? TAB_SHORT[k] : TAB_LABEL[k]}</span>
    </button>
  );
  const core = tabs.filter((k) => !AI_TABS.includes(k));
  const ai = tabs.filter((k) => AI_TABS.includes(k));
  const nav = (short: boolean) =>
    short ? (
      tabs.map((k) => btn(k, true))
    ) : (
      <>
        {core.map((k) => btn(k, false))}
        {ai.length > 0 && (
          <>
            <div className="navsec">
              AI Insight <span className="ai-chip">Simulasi</span>
            </div>
            {ai.map((k) => btn(k, false))}
          </>
        )}
      </>
    );

  return (
    <>
      <div className="shell">
        <aside className="side">
          <div className="brand">
            <div className="logo">
              <Icon name="logo" />
            </div>
            <div>
              <b>Asset Management</b>
              <small>Aset perkantoran</small>
            </div>
          </div>
          <nav aria-label="Menu utama">{nav(false)}</nav>
          <div className="foot">
            <label htmlFor="roleSel">{mock ? 'Masuk sebagai (mock login)' : 'Login sebagai'}</label>
            {userSelect('roleSel')}
            {API_MODE === 'demo' && (
              <>
                <span className="demo-badge">Mode demo: data di browser ini</span>
                <button className="btn ghost" onClick={() => setConfirmReset(true)}>
                  Reset data contoh
                </button>
              </>
            )}
          </div>
        </aside>
        <div>
          <header className="mtop">
            <div className="logo">
              <Icon name="logo" />
            </div>
            <span className="ttl">AMS</span>
            <label className="rolechip">
              <span className="sr">Masuk sebagai</span>
              {userSelect('roleSelM')}
            </label>
          </header>
          <main>{children}</main>
        </div>
      </div>
      {tabs.length > 1 && (
        <nav className="bnav" aria-label="Menu utama">
          {nav(true)}
        </nav>
      )}
      {confirmReset && backend.resetDemo && (
        <Dialog
          title="Reset data contoh"
          onClose={() => setConfirmReset(false)}
          actions={[
            { label: 'Batal', onClick: () => setConfirmReset(false) },
            {
              label: 'Reset data',
              tone: 'danger',
              onClick: async () => {
                await backend.resetDemo!();
                setConfirmReset(false);
                refresh();
                toast('Data contoh dipulihkan');
              },
            },
          ]}
        >
          <p style={{ margin: 0 }}>Semua perubahan di browser ini akan hilang dan data kembali ke contoh awal.</p>
        </Dialog>
      )}
    </>
  );
}
