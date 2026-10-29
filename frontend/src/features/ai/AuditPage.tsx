import { useState } from 'react';
import type { AlertCategory, AnomalyAlert, AssistantAnswer, AssistantQuestion, AuditCase, CaseStatus } from '../../api/ai-types';
import { useApp, useLoad } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { Dialog, type DialogAction, ErrorBox, Loading, PageHead } from '../../components/ui';
import { dateLabel, dateTimeLabel } from '../../domain/labels';
import { AiChip, AiNotice, CASE_LABEL, CATEGORY_LABEL, Kpi, NATURE_LABEL, pct, SeverityPill, Tabs } from './common';

type Tab = 'alerts' | 'cases' | 'activity';

/** Modul C – Audit & Anomaly Detection: deteksi, bukti, kasus, tindakan korektif, asisten investigasi. */
export function AuditPage() {
  const { api, me, run, toast } = useApp();
  const [tab, setTab] = useState<Tab>('alerts');
  const [cat, setCat] = useState<AlertCategory | ''>('');
  const [alertId, setAlertId] = useState<number | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);
  const { data: alerts, error, reload } = useLoad(() => api.ai.listAlerts(), [me.userId]);
  const { data: cases } = useLoad(() => api.ai.listCases(), [me.userId]);
  const isAuditor = me.roleCd === 'AUDITOR';

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!alerts || !cases) return <Loading />;

  const dismissed = alerts.filter((a) => a.status === 'DISMISSED').length;
  const decided = dismissed + cases.filter((c) => c.status === 'CONFIRMED' || c.status === 'REMEDIATION' || c.status === 'CLOSED').length;
  const closed = cases.filter((c) => c.closedDt);
  const avgDays = closed.length ? closed.reduce((t, c) => t + (new Date(c.closedDt!).getTime() - new Date(c.createdDt).getTime()) / 864e5, 0) / closed.length : null;
  const actions = cases.flatMap((c) => c.actions);
  const list = alerts.filter((a) => !cat || a.category === cat);

  return (
    <>
      <PageHead
        title="Audit & anomali"
        desc="Temuan dari aturan deteksi untuk ditinjau auditor. Anomali bukan bukti kecurangan; setiap keputusan dicatat dengan alasan."
        actions={
          isAuditor && (
            <button className="btn primary" onClick={() => run(async () => { const r = await api.ai.runDetection(); toast(`${r.created} alert baru`); })}>
              <Icon name="spark" />
              Jalankan deteksi
            </button>
          )
        }
      />
      <AiNotice>
        Deteksi memakai aturan berversi (DUP-01, TRX-01/02, MNT-01, OPN-01..03 v1.0). <b>Skor risiko 0–100 adalah skor aturan, bukan probabilitas.</b> Alert dibedakan:
        pelanggaran kebijakan, anomali pola, kualitas data, proses belum selesai, dan selisih terkonfirmasi. Data tidak pernah digabung, dihapus, atau dieskalasi otomatis.
      </AiNotice>
      <div className="prog">
        <div className="stats">
          <Kpi n={alerts.length} l="Total alert" />
          <Kpi n={alerts.filter((a) => a.status === 'OPEN' && (a.severity === 'HIGH' || a.severity === 'CRITICAL')).length} l="Tinggi/kritis terbuka" tone="bad" />
          <Kpi n={cases.filter((c) => !c.closedDt).length} l="Kasus aktif" />
          <Kpi n={decided ? pct(dismissed / decided) : '–'} l="Rasio false positive" />
          <Kpi n={actions.length ? pct(actions.filter((x) => x.status === 'DONE').length / actions.length) : '–'} l="Tindakan korektif selesai" />
        </div>
        <p className="note" style={{ marginBottom: 0 }}>
          Per kategori: {(Object.keys(CATEGORY_LABEL) as AlertCategory[]).map((c) => `${CATEGORY_LABEL[c]} ${alerts.filter((a) => a.category === c).length}`).join(' · ')}
          {avgDays !== null && ` · rata-rata penyelesaian kasus ${avgDays.toFixed(1)} hari`}
        </p>
      </div>
      <Tabs value={tab} onChange={setTab} items={[['alerts', 'Alert'], ['cases', `Kasus (${cases.length})`], ['activity', 'Aktivitas AI']]} />

      {tab === 'alerts' && (
        <>
          <div className="toolbar">
            <div className="chips">
              <select value={cat} onChange={(e) => setCat(e.target.value as AlertCategory | '')} aria-label="Kategori">
                <option value="">Semua kategori</option>
                {(Object.keys(CATEGORY_LABEL) as AlertCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="list">
            <table className="rt">
              <thead>
                <tr>
                  <th>Risiko</th>
                  <th>Temuan</th>
                  <th>Kategori</th>
                  <th>Sifat</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!list.length && (
                  <tr>
                    <td className="empty" data-k="wide" colSpan={5}>
                      Belum ada alert. {isAuditor && 'Jalankan deteksi.'}
                    </td>
                  </tr>
                )}
                {list.map((a) => (
                  <tr key={a.alertId} className="click" tabIndex={0} onClick={() => setAlertId(a.alertId)} onKeyDown={(e) => e.key === 'Enter' && setAlertId(a.alertId)}>
                    <td data-k="main">
                      <SeverityPill s={a.severity} score={a.riskScore} />
                      <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{a.alertNo}</span>
                    </td>
                    <td data-k="title">
                      {a.title}
                      <span className="sub2">
                        {a.ruleVersion} · {a.method === 'RULE' ? 'aturan' : 'statistik'} · {dateLabel(a.detectedDt)}
                      </span>
                    </td>
                    <td data-l="Kategori">{CATEGORY_LABEL[a.category]}</td>
                    <td data-l="Sifat">{NATURE_LABEL[a.nature]}</td>
                    <td data-l="Status">{{ OPEN: 'Terbuka', IN_CASE: 'Dalam kasus', DISMISSED: 'Di-dismiss' }[a.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'cases' && <CaseList cases={cases} onOpen={setCaseId} />}
      {tab === 'activity' && <Activity />}
      {alertId !== null && <AlertDetail alertId={alertId} onClose={() => setAlertId(null)} onCase={(id) => (setAlertId(null), setCaseId(id), setTab('cases'))} />}
      {caseId !== null && <CaseDetail caseId={caseId} onClose={() => setCaseId(null)} onAlert={(id) => (setCaseId(null), setAlertId(id))} />}
    </>
  );
}

const QUESTIONS: [AssistantQuestion, string][] = [
  ['WHY', 'Kenapa ditandai?'],
  ['RECORDS', 'Record pendukung?'],
  ['SIMILAR', 'Kasus serupa?'],
  ['EVIDENCE_NEEDED', 'Bukti tambahan?'],
  ['NEXT_STEP', 'Cek apa berikutnya?'],
  ['OPEN_ACTIONS', 'Tindakan terbuka?'],
];

/** Alert Detail & Evidence + asisten investigasi (C5, C6). */
function AlertDetail({ alertId, onClose, onCase }: { alertId: number; onClose: () => void; onCase: (caseId: number) => void }) {
  const { api, me, run } = useApp();
  const { data: a } = useLoad(() => api.ai.getAlert(alertId), [alertId]);
  const [chat, setChat] = useState<AssistantAnswer[]>([]);
  const [dismiss, setDismiss] = useState(false);
  const [reason, setReason] = useState('');
  const isAuditor = me.roleCd === 'AUDITOR';
  if (!a) return null;
  const ask = async (q: AssistantQuestion) => {
    const ans = await api.ai.ask(a.alertId, q);
    setChat((c) => [...c, ans]);
  };
  const actions: DialogAction[] = [{ label: 'Tutup', onClick: onClose }];
  if (isAuditor && a.status === 'OPEN')
    actions.push(
      { label: 'Dismiss', onClick: () => setDismiss(true) },
      { label: 'Buat kasus', tone: 'primary', onClick: async () => { const c = await api.ai.createCase(a.alertId, me.userId); await run(async () => {}, `${c.caseNo} dibuat`); onCase(c.caseId); } },
    );
  if (a.caseId) actions.push({ label: 'Buka kasus', tone: 'primary', onClick: () => onCase(a.caseId!) });

  return (
    <Dialog title={a.alertNo} onClose={onClose} actions={actions}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <SeverityPill s={a.severity} score={a.riskScore} />
        <span className="pill s-Available">{CATEGORY_LABEL[a.category]}</span>
        <span className="pill s-Disposed">{NATURE_LABEL[a.nature]}</span>
      </div>
      <h3 style={{ fontSize: 'var(--text-base)', margin: '14px 0 6px' }}>{a.title}</h3>
      <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>{a.explanation}</p>
      <dl className="kv" style={{ margin: '14px 0' }}>
        {a.evidence.map((e, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <dt>{e.label}</dt>
            <dd>{e.value}</dd>
          </div>
        ))}
        <dt>Metode</dt>
        <dd>
          {a.method === 'RULE' ? 'Aturan' : 'Statistik'} · {a.ruleVersion} · {dateTimeLabel(a.detectedDt)}
        </dd>
        <dt>Saran tindakan</dt>
        <dd>{a.recommendedAction}</dd>
        {a.dismissReason && (
          <>
            <dt>Alasan dismiss</dt>
            <dd>{a.dismissReason}</dd>
          </>
        )}
      </dl>
      <div style={{ marginBottom: 14 }}>
        {a.records.map((r) => (
          <span key={r.type + r.id} className="ref" title={r.type}>
            {r.label}
          </span>
        ))}
      </div>
      <div className="ai-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <b style={{ fontSize: 'var(--text-sm)' }}>Asisten investigasi</b>
          <AiChip>template · bukan LLM</AiChip>
        </div>
        <div className="seg" style={{ marginBottom: 10 }}>
          {QUESTIONS.map(([q, l]) => (
            <button key={q} onClick={() => ask(q)}>
              {l}
            </button>
          ))}
        </div>
        <div className="chat">
          {chat.map((c, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <div className="q">{c.question}</div>
              <div className="a">
                <b style={{ fontSize: 'var(--text-xs)' }}>Fakta dari data AMS</b>
                <ul>
                  {c.facts.map((f, j) => (
                    <li key={j}>
                      {f.text} {f.refs.map((r) => <span key={r.id} className="ref">{r.id}</span>)}
                    </li>
                  ))}
                </ul>
                {c.hypotheses.length > 0 && (
                  <>
                    <b style={{ fontSize: 'var(--text-xs)', display: 'block', marginTop: 8 }}>Hipotesis / perlu dibuktikan</b>
                    <ul>
                      {c.hypotheses.map((h) => (
                        <li key={h} className="muted">{h}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {dismiss && (
        <Dialog
          title="Dismiss alert"
          onClose={() => setDismiss(false)}
          actions={[
            { label: 'Batal', onClick: () => setDismiss(false) },
            { label: 'Dismiss', tone: 'danger', disabled: !reason.trim(), onClick: () => run(() => api.ai.dismissAlert(a.alertId, reason), 'Alert di-dismiss').then((ok) => ok && onClose()) },
          ]}
        >
          <div className="field">
            <label htmlFor="dr">Alasan (wajib, mis. false positive karena …)</label>
            <textarea id="dr" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}

function CaseList({ cases, onOpen }: { cases: AuditCase[]; onOpen: (id: number) => void }) {
  const { userNm } = useApp();
  if (!cases.length) return <div className="card empty">Belum ada kasus. Buat kasus dari alert.</div>;
  return (
    <div className="list">
      <table className="rt">
        <thead>
          <tr>
            <th>Kasus</th>
            <th>Judul</th>
            <th>Investigator</th>
            <th>Tindakan korektif</th>
            <th>Dibuat</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.caseId} className="click" tabIndex={0} onClick={() => onOpen(c.caseId)} onKeyDown={(e) => e.key === 'Enter' && onOpen(c.caseId)}>
              <td data-k="main">
                <b>{c.caseNo}</b>
                <span className="pill s-UnderRepair">{CASE_LABEL[c.status]}</span>
              </td>
              <td data-k="title">{c.title}</td>
              <td data-l="Investigator">{userNm(c.investigator)}</td>
              <td data-l="Tindakan">
                {c.actions.filter((x) => x.status === 'DONE').length}/{c.actions.length} selesai
              </td>
              <td data-l="Dibuat">{dateLabel(c.createdDt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Investigation Case Detail + Corrective Action Tracking (C7). */
function CaseDetail({ caseId, onClose, onAlert }: { caseId: number; onClose: () => void; onAlert: (id: number) => void }) {
  const { api, me, users, userNm, run } = useApp();
  const { data: c } = useLoad(() => api.ai.getCase(caseId), [caseId]);
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [note, setNote] = useState('');
  const [act, setAct] = useState({ description: '', ownerUserId: 'EMP001', dueDt: '' });
  const isAuditor = me.roleCd === 'AUDITOR';
  if (!c) return null;
  const open = c.status !== 'CLOSED';
  return (
    <Dialog title={c.caseNo} onClose={onClose} actions={[{ label: 'Tutup', onClick: onClose }]}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="pill s-UnderRepair">{CASE_LABEL[c.status]}</span>
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>Investigator: {userNm(c.investigator)}</span>
      </div>
      <h3 style={{ fontSize: 'var(--text-base)', margin: '12px 0' }}>{c.title}</h3>
      <div style={{ marginBottom: 12 }}>
        {c.alerts.map((a: AnomalyAlert) => (
          <button key={a.alertId} className="ref" style={{ border: 0, cursor: 'pointer' }} onClick={() => onAlert(a.alertId)}>
            {a.alertNo}
          </button>
        ))}
      </div>
      <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 10px', fontWeight: 800 }}>Catatan & temuan</h3>
      <ul className="timeline">
        {c.notes.map((n, i) => (
          <li key={i}>
            <b>{n.text}</b>
            <span className="muted">
              {{ FINDING: 'Temuan', STATUS: 'Status', CLARIFICATION: 'Permintaan klarifikasi' }[n.kind]} · {userNm(n.by)} · {dateTimeLabel(n.at)}
            </span>
          </li>
        ))}
      </ul>
      {isAuditor && open && (
        <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--line)', marginBottom: 14 }}>
          <div className="frow">
            <div className="field">
              <label htmlFor="cs">Ubah status</label>
              <select id="cs" value={status} onChange={(e) => setStatus(e.target.value as CaseStatus | '')}>
                <option value="">(tetap {CASE_LABEL[c.status]})</option>
                {(Object.keys(CASE_LABEL) as CaseStatus[]).filter((s) => s !== c.status && s !== 'NEW').map((s) => (
                  <option key={s} value={s}>
                    {CASE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cn">Catatan / temuan / alasan</label>
            <textarea id="cn" value={note} onChange={(e) => setNote(e.target.value)} />
            <span className="hint">False positive, eskalasi, temuan terkonfirmasi, dan penutupan wajib beralasan. Eskalasi tetap diputuskan manusia.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => run(() => api.ai.updateCase(c.caseId, { status: status || undefined, note }), 'Kasus diperbarui').then((ok) => ok && (setNote(''), setStatus('')))}>
              Simpan
            </button>
            <button className="btn" disabled={!note.trim()} onClick={() => run(() => api.ai.updateCase(c.caseId, { note, noteKind: 'CLARIFICATION' }), 'Permintaan klarifikasi dicatat').then((ok) => ok && setNote(''))}>
              Minta klarifikasi
            </button>
          </div>
        </div>
      )}
      <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 6px', fontWeight: 800 }}>Tindakan korektif</h3>
      {c.actions.map((x) => (
        <div key={x.actionId} className="minirow">
          <span className={`pill ${x.status === 'DONE' ? 's-InUse' : 's-UnderRepair'}`}>{x.status === 'DONE' ? 'Selesai' : 'Terbuka'}</span>
          <span style={{ flex: 1 }}>{x.description}</span>
          <span className="muted">
            PJ {userNm(x.ownerUserId)} · tenggat {dateLabel(x.dueDt)}
          </span>
          {isAuditor && x.status === 'OPEN' && (
            <button className="btn" onClick={() => run(() => api.ai.completeCorrectiveAction(c.caseId, x.actionId), 'Tindakan ditandai selesai')}>
              Verifikasi selesai
            </button>
          )}
        </div>
      ))}
      {!c.actions.length && <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Belum ada.</p>}
      {isAuditor && open && (
        <div className="frow" style={{ marginTop: 10 }}>
          <div className="field">
            <label htmlFor="ad">Tindakan baru</label>
            <input id="ad" value={act.description} onChange={(e) => setAct({ ...act, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ao">Penanggung jawab</label>
            <select id="ao" value={act.ownerUserId} onChange={(e) => setAct({ ...act, ownerUserId: e.target.value })}>
              {users.filter((u) => u.isActive && u.roleCd !== 'USER').map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.userNm}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="adt">Tenggat</label>
            <input id="adt" type="date" value={act.dueDt} onChange={(e) => setAct({ ...act, dueDt: e.target.value })} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => run(() => api.ai.addCorrectiveAction(c.caseId, act), 'Tindakan korektif ditambahkan').then((ok) => ok && setAct({ ...act, description: '', dueDt: '' }))}>
              Tambah tindakan
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** AI Activity & Audit History: setiap proses AI dan akses bukti tercatat. */
function Activity() {
  const { api, userNm, me } = useApp();
  const { data } = useLoad(() => api.ai.activity(), [me.userId]);
  if (!data) return <Loading />;
  return (
    <div className="list">
      <table className="rt">
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Aksi</th>
            <th>Modul</th>
            <th>Subjek</th>
            <th>Versi aturan/model</th>
          </tr>
        </thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.logId}>
              <td data-k="main">
                <b>{dateTimeLabel(l.at)}</b>
                <span className="muted">{userNm(l.actor)}</span>
              </td>
              <td data-k="title">
                {l.action}
                <span className="sub2">{l.summary}</span>
              </td>
              <td data-l="Modul">{{ PM: 'Predictive', DOC: 'Dokumen', AUDIT: 'Audit' }[l.module]}</td>
              <td data-l="Subjek">{l.subject}</td>
              <td data-l="Versi">{l.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
