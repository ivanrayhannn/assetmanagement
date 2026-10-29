import { useState } from 'react';
import type { AssetDocument, DocStatus, DocType } from '../../api/ai-types';
import { errorMessage } from '../../api/errors';
import { useApp, useLoad } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { AssetTag, Banner, Dialog, ErrorBox, Loading, PageHead } from '../../components/ui';
import { dateTimeLabel } from '../../domain/labels';
import { AiChip, AiNotice, DOC_STATUS_LABEL, FIELD_STATUS_LABEL, Kpi, pct, rupiah, Tabs } from './common';

const DOC_TYPE_LABEL: Record<DocType, string> = { INVOICE: 'Invoice supplier', WARRANTY: 'Sertifikat garansi', MAINTENANCE_REPORT: 'Laporan perbaikan', OTHER: 'Lainnya' };
const STATUS_TONE: Record<DocStatus, string> = { EXTRACTED: 's-Available', NEEDS_VERIFICATION: 's-UnderRepair', APPROVED: 's-InUse', REJECTED: 's-Disposed' };
const MONEY_KEYS = ['unitPrice', 'taxAmount', 'totalAmount', 'partsCost', 'laborCost'];

/** Modul B – Document Intelligence: upload, antrian, review & konfirmasi, metrik. */
export function DocumentsPage() {
  const { api, me } = useApp();
  const [filter, setFilter] = useState<DocStatus | 'ALL'>('ALL');
  const [open, setOpen] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const { data: docs, error, reload } = useLoad(() => api.ai.listDocuments(), [me.userId]);
  const { data: m } = useLoad(() => api.ai.docMetrics(), [me.userId]);

  if (open !== null) return <DocumentReview docId={open} onBack={() => setOpen(null)} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!docs || !m) return <Loading />;
  const list = docs.filter((d) => filter === 'ALL' || d.status === filter);
  const canUpload = me.roleCd === 'ADMIN_GA' || me.roleCd === 'PIC';

  return (
    <>
      <PageHead
        title="Dokumen asset"
        desc="Unggah invoice, garansi, atau laporan perbaikan. Data hasil baca harus dikonfirmasi manusia sebelum masuk ke data asset."
        actions={
          canUpload && (
            <button className="btn primary" onClick={() => setUploading(true)}>
              <Icon name="plus" />
              Unggah dokumen
            </button>
          )
        }
      />
      <AiNotice>
        Demo ini <b>tidak menjalankan OCR atau LLM</b>: isi hasil baca diambil dari template contoh agar alur klasifikasi, ekstraksi, validasi, deteksi duplikat, dan review
        bisa dicoba. File yang diunggah hanya dicek tipe, ukuran, dan hash-nya. Isi dokumen diperlakukan sebagai input tidak tepercaya; instruksi di dalamnya tidak pernah dijalankan.
      </AiNotice>
      <div className="prog">
        <div className="stats">
          <Kpi n={m.total} l="Dokumen" />
          <Kpi n={m.byStatus.NEEDS_VERIFICATION} l="Perlu verifikasi" tone={m.byStatus.NEEDS_VERIFICATION ? 'warn' : undefined} />
          <Kpi n={m.byStatus.EXTRACTED} l="Siap direview" />
          <Kpi n={m.duplicates} l="Duplikat terdeteksi" tone={m.duplicates ? 'bad' : undefined} />
          <Kpi n={m.securityFlagged} l="Instruksi mencurigakan" tone={m.securityFlagged ? 'bad' : undefined} />
        </div>
        <p className="note" style={{ marginBottom: 0 }}>
          Rata-rata keyakinan field {pct(m.avgConfidence)} · tingkat koreksi manual pada dokumen disetujui {pct(m.correctionRate)} · disetujui {m.byStatus.APPROVED}, ditolak {m.byStatus.REJECTED}
        </p>
      </div>
      <Tabs
        value={filter}
        onChange={setFilter}
        items={[['ALL', 'Semua'], ['NEEDS_VERIFICATION', 'Perlu verifikasi'], ['EXTRACTED', 'Siap direview'], ['APPROVED', 'Disetujui'], ['REJECTED', 'Ditolak']]}
      />
      <div className="list">
        <table className="rt">
          <thead>
            <tr>
              <th>Dokumen</th>
              <th>File</th>
              <th>Jenis (keyakinan)</th>
              <th>Catatan sistem</th>
              <th>Diunggah</th>
            </tr>
          </thead>
          <tbody>
            {!list.length && (
              <tr>
                <td className="empty" data-k="wide" colSpan={5}>
                  Tidak ada dokumen.
                </td>
              </tr>
            )}
            {list.map((d) => (
              <tr key={d.docId} className="click" tabIndex={0} onClick={() => setOpen(d.docId)} onKeyDown={(e) => e.key === 'Enter' && setOpen(d.docId)}>
                <td data-k="main">
                  <b>{d.docNo}</b>
                  <span className={`pill ${STATUS_TONE[d.status]}`}>{DOC_STATUS_LABEL[d.status]}</span>
                </td>
                <td data-k="title">{d.fileName}</td>
                <td data-l="Jenis">
                  {DOC_TYPE_LABEL[d.docType]} <span className="muted">({pct(d.docTypeConfidence)})</span>
                </td>
                <td data-l="Catatan">
                  {d.securityFlags.length > 0 && <span className="pill s-Missing">Instruksi tersembunyi</span>} {d.duplicateOfDocNo && <span className="pill s-Missing">Duplikat {d.duplicateOfDocNo}</span>}{' '}
                  {!d.securityFlags.length && !d.duplicateOfDocNo && (d.resultNote ?? (d.fields.filter((f) => f.status !== 'OK').length ? `${d.fields.filter((f) => f.status !== 'OK').length} field perlu dicek` : 'Semua field OK'))}
                </td>
                <td data-l="Diunggah">{dateTimeLabel(d.uploadedDt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {uploading && <UploadDialog onClose={() => setUploading(false)} onDone={(id) => (setUploading(false), setOpen(id))} />}
    </>
  );
}

/** B1: unggah + validasi file di sisi klien (server tetap memvalidasi ulang). */
function UploadDialog({ onClose, onDone }: { onClose: () => void; onDone: (docId: number) => void }) {
  const { api, refresh } = useApp();
  const { data: templates } = useLoad(() => api.ai.docTemplates(), []);
  const [file, setFile] = useState<File | null>(null);
  const [tpl, setTpl] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr('');
    if (!file) return setErr('Pilih file dulu.');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return setErr('Format tidak didukung. Gunakan PDF, JPG, atau PNG.');
    if (file.size > 10 * 1024 * 1024) return setErr('Ukuran file maksimal 10 MB.');
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const hash = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const d = await api.ai.uploadDocument({ name: file.name, size: file.size, type: file.type, hash }, tpl || templates![0].templateId);
      refresh();
      onDone(d.docId);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Unggah dokumen" onClose={onClose} actions={[{ label: 'Batal', onClick: onClose }, { label: busy ? 'Memproses…' : 'Unggah & proses', tone: 'primary', onClick: submit, disabled: busy }]}>
      <div className="field">
        <label htmlFor="df">File (PDF, JPG, PNG, maks 10 MB)</label>
        <input id="df" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="field">
        <label htmlFor="dt">Isi simulasi hasil baca (pengganti OCR di demo)</label>
        <select id="dt" value={tpl} onChange={(e) => setTpl(e.target.value)}>
          {templates?.map((t) => (
            <option key={t.templateId} value={t.templateId}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="hint">Di produksi, isi dibaca dari file oleh layanan OCR/ekstraksi; pilihan ini tidak ada.</span>
      </div>
      {err && <p className="err">{err}</p>}
    </Dialog>
  );
}

/** B5: layar review – pratinjau, field + keyakinan + sumber + status, koreksi, approve/tolak. */
function DocumentReview({ docId, onBack }: { docId: number; onBack: () => void }) {
  const { api, me, userNm, run } = useApp();
  const { data: d, error } = useLoad(() => api.ai.getDocument(docId), [docId]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState(false);
  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;
  const editable = (me.roleCd === 'ADMIN_GA' || me.roleCd === 'PIC') && (d.status === 'EXTRACTED' || d.status === 'NEEDS_VERIFICATION');
  const dirty = Object.keys(edits).length > 0;
  const save = (extra?: { docType?: DocType }) => run(() => api.ai.updateDocument(d.docId, { fields: edits, ...extra }), 'Koreksi disimpan & divalidasi ulang').then(() => setEdits({}));
  const confirm = (key: string, value: string | null) => run(() => api.ai.updateDocument(d.docId, { fields: { [key]: value } }), 'Field dikonfirmasi');

  return (
    <>
      <PageHead
        title={d.docNo}
        desc={`${d.fileName} · ${(d.fileSize / 1024).toFixed(0)} KB · diunggah ${userNm(d.uploadedBy)} ${dateTimeLabel(d.uploadedDt)}`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={onBack}>
              Kembali
            </button>
            {me.roleCd === 'ADMIN_GA' && editable && (
              <>
                <button className="btn" onClick={() => setRejecting(true)}>
                  Tolak
                </button>
                <button className="btn primary" disabled={d.status !== 'EXTRACTED' || dirty} onClick={() => run(() => api.ai.reviewDocument(d.docId, true), 'Dokumen disetujui & diterapkan ke data asset')}>
                  Konfirmasi & simpan ke AMS
                </button>
              </>
            )}
          </div>
        }
      />
      {d.securityFlags.map((s) => (
        <Banner key={s} tone="bad">
          <strong>Peringatan keamanan.</strong> {s}
        </Banner>
      ))}
      {d.issues.map((s) => (
        <Banner key={s} tone="info">
          {s}
        </Banner>
      ))}
      {d.status === 'APPROVED' && <Banner tone="good">Disetujui {userNm(d.reviewedBy)} {dateTimeLabel(d.reviewedDt!)}. {d.resultNote}</Banner>}
      {d.status === 'REJECTED' && <Banner tone="bad">Ditolak {userNm(d.reviewedBy)}: {d.reviewNote}</Banner>}
      {me.roleCd === 'ADMIN_GA' && editable && d.status !== 'EXTRACTED' && (
        <p className="note" style={{ marginTop: 0 }}>Tombol konfirmasi aktif setelah semua field berstatus OK dan tidak ada duplikat / peringatan keamanan.</p>
      )}

      <div className="split">
        <div className="card">
          <h3>Pratinjau teks dokumen</h3>
          <p className="sub">
            Hasil baca simulasi · {d.modelVersion}
          </p>
          <div className="ocr">{d.text}</div>
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>Hash file</dt>
            <dd>{d.fileHash}</dd>
            <dt>Asset terkait</dt>
            <dd>{d.linkedAssetNo ? <AssetTag no={d.linkedAssetNo} /> : '–'}</dd>
          </dl>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3>Data hasil ekstraksi</h3>
            <AiChip>Keyakinan jenis {pct(d.docTypeConfidence)}</AiChip>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="dtype">Jenis dokumen</label>
            <select id="dtype" value={d.docType} disabled={!editable} onChange={(e) => run(() => api.ai.updateDocument(d.docId, { docType: e.target.value as DocType }), 'Jenis dokumen diubah manual')}>
              {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          {d.fields.length === 0 && <p className="muted">Jenis dokumen tidak punya field ekstraksi.</p>}
          {d.fields.map((f) => (
            <div key={f.key} className="fld">
              <div className="top">
                <span>
                  {f.label}
                  {f.mandatory ? ' *' : ''}
                </span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {f.confidence !== null && <span>{pct(f.confidence)}</span>}
                  {f.edited && <span className="pill s-Available">Diverifikasi manusia</span>}
                  <span className={`pill fs-${f.status}`}>{FIELD_STATUS_LABEL[f.status]}</span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={edits[f.key] ?? f.value ?? ''}
                  disabled={!editable}
                  placeholder={f.status === 'UNREADABLE' ? 'Tidak terbaca – isi manual' : 'Tidak ditemukan'}
                  onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                  aria-label={f.label}
                />
                {editable && f.status === 'VERIFY' && edits[f.key] === undefined && (
                  <button className="btn" onClick={() => confirm(f.key, f.value)}>
                    Benar
                  </button>
                )}
              </div>
              <span className="msg">
                {MONEY_KEYS.includes(f.key) && f.value && !isNaN(Number(f.value)) ? `${rupiah(Number(f.value))} · ` : ''}
                {f.source ? `Sumber: ${f.source}` : ''}
                {f.message ? ` · ${f.message}` : ''}
              </span>
            </div>
          ))}
          {editable && (
            <button className="btn primary" style={{ marginTop: 12, width: '100%' }} disabled={!dirty} onClick={() => save()}>
              Simpan koreksi & validasi ulang
            </button>
          )}
        </div>
      </div>
      {rejecting && <RejectDialog doc={d} onClose={() => setRejecting(false)} />}
    </>
  );
}

function RejectDialog({ doc, onClose }: { doc: AssetDocument; onClose: () => void }) {
  const { api, run } = useApp();
  const [note, setNote] = useState('');
  return (
    <Dialog
      title={`Tolak ${doc.docNo}`}
      onClose={onClose}
      actions={[
        { label: 'Batal', onClick: onClose },
        { label: 'Tolak dokumen', tone: 'danger', disabled: !note.trim(), onClick: () => run(() => api.ai.reviewDocument(doc.docId, false, note), 'Dokumen ditolak').then((ok) => ok && onClose()) },
      ]}
    >
      <div className="field">
        <label htmlFor="rjn">Alasan (wajib, mis. duplikat, minta dokumen asli ke vendor)</label>
        <textarea id="rjn" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}
