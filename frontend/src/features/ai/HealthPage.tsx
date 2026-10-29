import { useState } from 'react';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { HealthClass, Recommendation, Urgency, WorkOrder } from '../../api/ai-types';
import { errorMessage } from '../../api/errors';
import { useApp, useLoad } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { AssetTag, Dialog, ErrorBox, Loading, PageHead } from '../../components/ui';
import { dateLabel, dateTimeLabel, periodLabel } from '../../domain/labels';
import { AiChip, AiNotice, ClassPill, HEALTH_LABEL, HealthBadge, Kpi, REC_LABEL, rupiah, Tabs, URGENCY_LABEL, UrgencyPill, WO_LABEL } from './common';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type Tab = 'assets' | 'recs' | 'wo';

/** Modul A – Predictive Maintenance: A1 kesehatan, A3 rekomendasi, A4 work order, A5 dashboard. */
export function HealthPage() {
  const { api, me, run, toast } = useApp();
  const [tab, setTab] = useState<Tab>('assets');
  const [cls, setCls] = useState<HealthClass | ''>('');
  const [detail, setDetail] = useState<string | null>(null);
  const { data: health, error, reload } = useLoad(() => api.ai.listHealth(), [me.userId]);
  const { data: recs } = useLoad(() => api.ai.listRecommendations(), [me.userId]);
  const { data: wos } = useLoad(() => api.ai.listWorkOrders(), [me.userId]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!health || !recs || !wos) return <Loading />;

  const monitored = health.filter((h) => h.healthClass !== 'INSUFFICIENT_DATA');
  const count = (c: HealthClass) => health.filter((h) => h.healthClass === c).length;
  const list = health.filter((h) => !cls || h.healthClass === cls);

  return (
    <>
      <PageHead
        title="Kesehatan asset"
        desc="Skor kesehatan, rekomendasi maintenance, dan work order. Rekomendasi hanya dijalankan setelah diputuskan manusia."
        actions={
          me.roleCd === 'ADMIN_GA' && (
            <button className="btn primary" onClick={() => run(async () => toast(`${await api.ai.generateRecommendations()} rekomendasi baru`))}>
              <Icon name="spark" />
              Hitung ulang rekomendasi
            </button>
          )
        }
      />
      <AiNotice>
        Skor 0–100 dihitung dengan aturan transparan <b>RULE-HEALTH v1.0</b> (umur, kerusakan 12 bulan, kondisi, hasil inspeksi, PM terlambat), bukan model ML.
        Asset tanpa riwayat maintenance/inspeksi ditandai <b>Data belum cukup</b>. <b>Prediksi probabilitas kegagalan 7/30/90 hari belum ditampilkan</b> karena belum ada model
        yang dilatih dan divalidasi.
      </AiNotice>

      <div className="prog">
        <div className="stats">
          <Kpi n={monitored.length} l="Asset dimonitor" />
          <Kpi n={count('CRITICAL')} l="Kritis" tone={count('CRITICAL') ? 'bad' : undefined} />
          <Kpi n={count('AT_RISK')} l="Berisiko" tone={count('AT_RISK') ? 'warn' : undefined} />
          <Kpi n={health.filter((h) => h.pmOverdueDays > 0 && h.healthClass !== 'INSUFFICIENT_DATA').length} l="PM terlambat" />
          <Kpi n={count('INSUFFICIENT_DATA')} l="Data belum cukup" />
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['assets', 'Kesehatan asset'],
          ['recs', `Rekomendasi (${recs.filter((r) => r.status === 'PROPOSED').length})`],
          ['wo', `Work order (${wos.filter((w) => w.status === 'DRAFT' || w.status === 'APPROVED').length})`],
        ]}
      />

      {tab === 'assets' && (
        <>
          <CostChart />
          <div className="toolbar" style={{ marginTop: 'var(--space-md)' }}>
            <div className="chips">
              <select value={cls} onChange={(e) => setCls(e.target.value as HealthClass | '')} aria-label="Kelas kesehatan">
                <option value="">Semua kelas</option>
                {(Object.keys(HEALTH_LABEL) as HealthClass[]).map((c) => (
                  <option key={c} value={c}>
                    {HEALTH_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="list">
            <table className="rt">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Nama</th>
                  <th>Skor</th>
                  <th>Faktor terbesar</th>
                  <th>PM berikutnya</th>
                </tr>
              </thead>
              <tbody>
                {list.map((h) => {
                  const top = [...h.factors].sort((a, b) => a.impact - b.impact)[0];
                  return (
                    <tr key={h.assetNo} className="click" tabIndex={0} onClick={() => setDetail(h.assetNo)} onKeyDown={(e) => e.key === 'Enter' && setDetail(h.assetNo)}>
                      <td data-k="main">
                        <AssetTag no={h.assetNo} />
                        <ClassPill cls={h.healthClass} />
                      </td>
                      <td data-k="title">
                        {h.assetNm}
                        <span className="sub2">{h.officeCd} · umur {h.ageYears} th</span>
                      </td>
                      <td data-l="Skor">
                        <HealthBadge score={h.score} cls={h.healthClass} /> <span className="muted hide-sm">{HEALTH_LABEL[h.healthClass]}</span>
                      </td>
                      <td data-l="Faktor terbesar">{top ? `${top.label} (${top.impact})` : <span className="muted">–</span>}</td>
                      <td data-l="PM berikutnya">
                        {h.healthClass === 'INSUFFICIENT_DATA' ? (
                          <span className="muted">–</span>
                        ) : h.pmOverdueDays > 0 ? (
                          <span style={{ color: 'var(--minus)', fontWeight: 700 }}>Terlambat {h.pmOverdueDays} hr</span>
                        ) : (
                          dateLabel(h.nextPmDueDt!)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'recs' && <RecommendationList recs={recs} onOpen={setDetail} />}
      {tab === 'wo' && <WorkOrderList wos={wos} onOpen={setDetail} />}
      {detail && <HealthDetail assetNo={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/** A5: tren biaya & downtime maintenance per bulan (12 bulan). */
function CostChart() {
  const { api, me } = useApp();
  const { data } = useLoad(async () => {
    const h = await api.ai.listHealth();
    const details = await Promise.all(h.filter((x) => x.dataPoints > 0).map((x) => api.ai.getHealth(x.assetNo)));
    return details.flatMap((d) => d.maintenance);
  }, [me.userId]);
  if (!data) return null;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return (
    <div className="card">
      <h3>Biaya & downtime maintenance</h3>
      <p className="sub">12 bulan terakhir, dari riwayat maintenance tercatat (data fakta, bukan prediksi).</p>
      <div className="chartbox" style={{ height: 220 }}>
        <Bar
          data={{
            labels: months.map(periodLabel),
            datasets: [
              { label: 'Biaya (juta Rp)', data: months.map((m) => data.filter((x) => x.maintDt.startsWith(m)).reduce((t, x) => t + x.partsCost + x.laborCost, 0) / 1e6), backgroundColor: css('--c1'), borderRadius: 6, yAxisID: 'y' },
              { label: 'Downtime (jam)', data: months.map((m) => data.filter((x) => x.maintDt.startsWith(m)).reduce((t, x) => t + x.downtimeHours, 0)), backgroundColor: css('--c4'), borderRadius: 6, yAxisID: 'y1' },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, usePointStyle: true } } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true, position: 'left' }, y1: { beginAtZero: true, position: 'right', grid: { display: false } } },
          }}
        />
      </div>
    </div>
  );
}

function RecommendationList({ recs, onOpen }: { recs: Recommendation[]; onOpen: (no: string) => void }) {
  const { me } = useApp();
  const [deciding, setDeciding] = useState<{ rec: Recommendation; mode: 'REJECT' | 'MODIFY' } | null>(null);
  const { api, run } = useApp();
  if (!recs.length) return <div className="card empty">Belum ada rekomendasi.</div>;
  return (
    <div className="cards">
      {recs.map((r) => (
        <div key={r.recId} className="acard" style={{ cursor: 'default' }}>
          <div className="top">
            <button className="tag" style={{ cursor: 'pointer' }} onClick={() => onOpen(r.assetNo)}>
              {r.assetNo}
            </button>
            <UrgencyPill u={r.urgency} />
          </div>
          <div>
            <AiChip>Rekomendasi · {r.ruleVersion}</AiChip>
            <h4 style={{ marginTop: 6 }}>
              {REC_LABEL[r.recType]}: {r.action}
            </h4>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>
              {r.reason} {r.impact && `Dampak: ${r.impact}.`}
            </p>
          </div>
          <details style={{ fontSize: 'var(--text-xs)' }}>
            <summary className="muted" style={{ cursor: 'pointer', fontWeight: 700 }}>
              Bukti ({r.evidence.length})
            </summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {r.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
          {r.status === 'PROPOSED' ? (
            me.roleCd === 'ADMIN_GA' ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={() => run(() => api.ai.decideRecommendation(r.recId, 'ACCEPT', {}), 'Diterima, draft work order dibuat')}>
                  Terima
                </button>
                <button className="btn" onClick={() => setDeciding({ rec: r, mode: 'MODIFY' })}>
                  Ubah
                </button>
                <button className="btn ghost" onClick={() => setDeciding({ rec: r, mode: 'REJECT' })}>
                  Tolak
                </button>
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Menunggu keputusan Admin GA
              </span>
            )
          ) : (
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              {{ ACCEPTED: 'Diterima', MODIFIED: 'Diubah', REJECTED: 'Ditolak', PROPOSED: '' }[r.status]} {r.decidedDt && dateTimeLabel(r.decidedDt)}
              {r.decisionNote && ` – ${r.decisionNote}`}
            </span>
          )}
        </div>
      ))}
      {deciding && <DecideDialog rec={deciding.rec} mode={deciding.mode} onClose={() => setDeciding(null)} />}
    </div>
  );
}

function DecideDialog({ rec, mode, onClose }: { rec: Recommendation; mode: 'REJECT' | 'MODIFY'; onClose: () => void }) {
  const { api, run } = useApp();
  const [f, setF] = useState({ note: '', action: rec.action, urgency: rec.urgency as Urgency });
  return (
    <Dialog
      title={mode === 'REJECT' ? 'Tolak rekomendasi' : 'Ubah rekomendasi'}
      onClose={onClose}
      actions={[
        { label: 'Batal', onClick: onClose },
        {
          label: mode === 'REJECT' ? 'Tolak' : 'Simpan & buat draft WO',
          tone: mode === 'REJECT' ? 'danger' : 'primary',
          disabled: !f.note.trim(),
          onClick: () => run(() => api.ai.decideRecommendation(rec.recId, mode, f), mode === 'REJECT' ? 'Rekomendasi ditolak' : 'Draft work order dibuat').then((ok) => ok && onClose()),
        },
      ]}
    >
      <p style={{ marginTop: 0 }}>
        <AssetTag no={rec.assetNo} /> {rec.action}
      </p>
      {mode === 'MODIFY' && (
        <div className="frow">
          <div className="field">
            <label htmlFor="ra">Tindakan</label>
            <input id="ra" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ru">Urgensi</label>
            <select id="ru" value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value as Urgency })}>
              {(['HIGH', 'MEDIUM', 'LOW'] as Urgency[]).map((u) => (
                <option key={u} value={u}>
                  {URGENCY_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="rn">Alasan (wajib, tercatat di audit trail)</label>
        <textarea id="rn" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
    </Dialog>
  );
}

function WorkOrderList({ wos, onOpen }: { wos: WorkOrder[]; onOpen: (no: string) => void }) {
  const { me, userNm } = useApp();
  const [act, setAct] = useState<{ wo: WorkOrder; mode: 'APPROVE' | 'REJECT' | 'COMPLETE' } | null>(null);
  if (!wos.length) return <div className="card empty">Belum ada work order. Terima rekomendasi untuk membuat draft.</div>;
  return (
    <>
      <div className="list">
        <table className="rt">
          <thead>
            <tr>
              <th>Work order</th>
              <th>Tindakan</th>
              <th>Prioritas</th>
              <th>Target</th>
              <th>Pelaksana</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {wos.map((w) => (
              <tr key={w.woId}>
                <td data-k="main">
                  <b>{w.woNo}</b>
                  <button className="tag" style={{ cursor: 'pointer' }} onClick={() => onOpen(w.assetNo)}>
                    {w.assetNo}
                  </button>
                </td>
                <td data-k="title">
                  {w.action}
                  <span className="sub2">Dibuat {userNm(w.createdBy)} {dateLabel(w.createdDt)}</span>
                </td>
                <td data-l="Prioritas">
                  <UrgencyPill u={w.priority} />
                </td>
                <td data-l="Target">{dateLabel(w.targetDt)}</td>
                <td data-l="Pelaksana">{w.assignee}</td>
                <td data-l="Status">
                  {WO_LABEL[w.status]}
                  {w.approvedBy && <span className="sub2">oleh {userNm(w.approvedBy)}{w.approvalNote ? ` – ${w.approvalNote}` : ''}</span>}
                  {w.status === 'COMPLETED' && <span className="sub2">Biaya {rupiah(w.actualCost)} – {w.outcome}</span>}
                </td>
                <td data-k="wide">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {w.status === 'DRAFT' && me.roleCd === 'EXEC' && (
                      <>
                        <button className="btn primary" onClick={() => setAct({ wo: w, mode: 'APPROVE' })}>
                          Setujui
                        </button>
                        <button className="btn ghost" onClick={() => setAct({ wo: w, mode: 'REJECT' })}>
                          Tolak
                        </button>
                      </>
                    )}
                    {w.status === 'APPROVED' && me.roleCd === 'ADMIN_GA' && (
                      <button className="btn" onClick={() => setAct({ wo: w, mode: 'COMPLETE' })}>
                        Catat selesai
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {me.roleCd === 'ADMIN_GA' && wos.some((w) => w.status === 'DRAFT') && (
        <p className="note">Draft work order disetujui oleh manajemen (Executive), bukan oleh pembuatnya (segregation of duty).</p>
      )}
      {act && <WoDialog {...act} onClose={() => setAct(null)} />}
    </>
  );
}

function WoDialog({ wo, mode, onClose }: { wo: WorkOrder; mode: 'APPROVE' | 'REJECT' | 'COMPLETE'; onClose: () => void }) {
  const { api, run } = useApp();
  const [f, setF] = useState({ note: '', cost: '', downtime: '0', outcome: '' });
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try {
      if (mode === 'COMPLETE') await api.ai.completeWorkOrder(wo.woId, { actualCost: Number(f.cost), downtimeHours: Number(f.downtime), outcome: f.outcome });
      else await api.ai.approveWorkOrder(wo.woId, mode === 'APPROVE', f.note);
      await run(async () => {}, mode === 'COMPLETE' ? 'Work order selesai, riwayat maintenance diperbarui' : mode === 'APPROVE' ? 'Work order disetujui' : 'Work order ditolak');
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <Dialog
      title={mode === 'COMPLETE' ? `Selesaikan ${wo.woNo}` : mode === 'APPROVE' ? `Setujui ${wo.woNo}` : `Tolak ${wo.woNo}`}
      onClose={onClose}
      actions={[{ label: 'Batal', onClick: onClose }, { label: 'Simpan', tone: mode === 'REJECT' ? 'danger' : 'primary', onClick: submit }]}
    >
      <p style={{ marginTop: 0 }}>
        <AssetTag no={wo.assetNo} /> {wo.action}
      </p>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Masalah: {wo.issue}</p>
      {mode === 'COMPLETE' ? (
        <>
          <div className="frow">
            <div className="field">
              <label htmlFor="wc">Biaya aktual (Rp)</label>
              <input id="wc" inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div className="field">
              <label htmlFor="wd">Downtime (jam)</label>
              <input id="wd" inputMode="numeric" value={f.downtime} onChange={(e) => setF({ ...f, downtime: e.target.value.replace(/\D/g, '') })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="wo">Hasil pekerjaan</label>
            <textarea id="wo" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} />
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="wn">Catatan {mode === 'REJECT' ? '(wajib)' : '(opsional)'}</label>
          <textarea id="wn" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </Dialog>
  );
}

/** Asset Health Detail: skor, faktor, riwayat maintenance, rekomendasi & WO terkait. */
export function HealthDetail({ assetNo, onClose }: { assetNo: string; onClose: () => void }) {
  const { api } = useApp();
  const { data: h, error } = useLoad(() => api.ai.getHealth(assetNo), [assetNo]);
  return (
    <Dialog title={h ? `Kesehatan ${h.assetNm}` : assetNo} onClose={onClose} actions={[{ label: 'Tutup', onClick: onClose }]}>
      {error && <p className="err">{error}</p>}
      {!h && !error && <Loading />}
      {h && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <AssetTag no={h.assetNo} big />
            <HealthBadge score={h.score} cls={h.healthClass} />
            <ClassPill cls={h.healthClass} />
            <AiChip>{h.ruleVersion}</AiChip>
          </div>
          <div className="info">
            <div><span>Umur</span><b>{h.ageYears} th</b></div>
            <div><span>Kerusakan 12 bln</span><b>{h.failures12m}</b></div>
            <div><span>Biaya 12 bln</span><b>{rupiah(h.cost12m)}</b></div>
            <div><span>Downtime 12 bln</span><b>{h.downtime12m} jam</b></div>
            <div><span>PM berikutnya</span><b>{h.healthClass === 'INSUFFICIENT_DATA' ? '–' : h.pmOverdueDays > 0 ? `Terlambat ${h.pmOverdueDays} hari` : dateLabel(h.nextPmDueDt!)}</b></div>
          </div>
          <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 6px', fontWeight: 800 }}>Faktor yang mempengaruhi skor</h3>
          {h.healthClass === 'INSUFFICIENT_DATA' ? (
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Belum ada riwayat maintenance/inspeksi – skor tidak dihitung agar tidak menyesatkan.</p>
          ) : h.factors.length ? (
            h.factors.map((f) => (
              <div key={f.code} className="factor">
                <span>
                  {f.label}
                  <span className="sub2 muted" style={{ display: 'block', fontSize: 'var(--text-xs)' }}>{f.evidence}</span>
                </span>
                <b>{f.impact}</b>
              </div>
            ))
          ) : (
            <p className="muted">Tidak ada faktor pengurang.</p>
          )}
          <p className="note">{h.predictionNote}</p>
          <h3 style={{ fontSize: 'var(--text-sm)', margin: '16px 0 10px', fontWeight: 800 }}>Riwayat maintenance (data tercatat)</h3>
          <ul className="timeline">
            {h.maintenance.map((m) => (
              <li key={m.maintId}>
                <b>
                  {{ PREVENTIVE: 'Preventive', CORRECTIVE: 'Perbaikan', INSPECTION: 'Inspeksi' }[m.maintType]}: {m.issue}
                </b>
                <span className="muted" style={{ display: 'block' }}>
                  {m.action}
                  {m.failureCd ? ` · kode ${m.failureCd}` : ''}
                  {m.inspectionResult ? ` · hasil ${m.inspectionResult.replace('_', ' ').toLowerCase()}` : ''}
                </span>
                <span className="muted">
                  {dateLabel(m.maintDt)} · {rupiah(m.partsCost + m.laborCost)} · {m.vendor ?? '–'}
                  {m.sourceDocId ? ' · dari dokumen' : ''}
                </span>
              </li>
            ))}
            {!h.maintenance.length && <li><span className="muted">Belum ada.</span></li>}
          </ul>
          {h.recommendations.length > 0 && (
            <>
              <h3 style={{ fontSize: 'var(--text-sm)', margin: '8px 0 6px', fontWeight: 800 }}>Rekomendasi</h3>
              {h.recommendations.map((r) => (
                <div key={r.recId} className="minirow">
                  <UrgencyPill u={r.urgency} />
                  <span>{r.action}</span>
                  <span className="muted">{r.status}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
