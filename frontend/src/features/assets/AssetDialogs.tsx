import { useEffect, useState } from 'react';
import { toIso } from '../../api/demo/db';
import { errorMessage } from '../../api/errors';
import type { AssetCondition, AssetDetail, AssetHistory } from '../../api/types';
import { useApp, useLoad } from '../../app/AppContext';
import { AssetTag, Dialog, type DialogAction, Loading, StatusPill, Who } from '../../components/ui';
import { dateLabel, dateTimeLabel, STATUS_LABEL } from '../../domain/labels';
import { AiChip, ClassPill, HealthBadge } from '../ai/common';

const today = () => toIso(new Date()).slice(0, 10);

/** SCR-03 Form Asset: FR-01, FR-02. Nomor dibuat sistem setelah kantor & kategori dipilih. */
export function AssetFormDialog({ onClose }: { onClose: () => void }) {
  const { api, offices, categories, toast, refresh } = useApp();
  const [f, setF] = useState({ officeCd: offices[0]?.officeCd ?? '', categoryCd: categories[0]?.categoryCd ?? '', assetNm: '', brandModel: '', serialNo: '', acqDt: today(), condition: 'BAIK' as AssetCondition });
  const [preview, setPreview] = useState('');
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    api.previewAssetNo(f.officeCd, f.categoryCd).then(setPreview, () => setPreview(''));
  }, [api, f.officeCd, f.categoryCd]);

  const save = async () => {
    if (!f.assetNm.trim()) return setErr('Nama asset wajib diisi.');
    try {
      const a = await api.createAsset(f);
      toast(`Asset ${a.assetNo} tersimpan`);
      refresh();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Dialog title="Tambah asset" onClose={onClose} actions={[{ label: 'Batal', onClick: onClose }, { label: 'Simpan asset', tone: 'primary', onClick: save }]}>
      <div className="field">
        <label>Nomor asset (otomatis)</label>
        <div>{preview && <AssetTag no={preview} big />}</div>
        <span className="hint">Nomor final diberikan saat disimpan dan tidak bisa diubah (BR-01).</span>
      </div>
      <div className="frow">
        <div className="field">
          <label htmlFor="aOff">Kantor</label>
          <select id="aOff" value={f.officeCd} onChange={set('officeCd')}>
            {offices.map((o) => (
              <option key={o.officeCd} value={o.officeCd}>
                {o.officeNm}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="aCat">Kategori</label>
          <select id="aCat" value={f.categoryCd} onChange={set('categoryCd')}>
            {categories.map((c) => (
              <option key={c.categoryCd} value={c.categoryCd}>
                {c.categoryNm}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="aName">Nama asset</label>
        <input id="aName" value={f.assetNm} onChange={set('assetNm')} placeholder="Contoh: Laptop ThinkPad T14" />
      </div>
      <div className="frow">
        <div className="field">
          <label htmlFor="aBrand">Merk / model</label>
          <input id="aBrand" value={f.brandModel} onChange={set('brandModel')} />
        </div>
        <div className="field">
          <label htmlFor="aSn">Serial number</label>
          <input id="aSn" value={f.serialNo} onChange={set('serialNo')} />
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label htmlFor="aAcq">Tanggal perolehan</label>
          <input id="aAcq" type="date" value={f.acqDt} max={today()} onChange={set('acqDt')} />
        </div>
        <div className="field">
          <label htmlFor="aCond">Kondisi</label>
          <select id="aCond" value={f.condition} onChange={set('condition')}>
            <option value="BAIK">Baik</option>
            <option value="RUSAK_RINGAN">Rusak ringan</option>
            <option value="RUSAK_BERAT">Rusak berat</option>
          </select>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
    </Dialog>
  );
}

function historyText(h: AssetHistory, officeNm: (c: string | null) => string, userNm: (u: string | null) => string | null) {
  const who = (u: string | null, o: string | null) => `${userNm(u) ?? 'Stok kantor'}, ${officeNm(o)}`;
  switch (h.action) {
    case 'REGISTER':
      return `Asset didaftarkan di ${officeNm(h.toOffice)}`;
    case 'ASSIGN':
      return `Diserahkan ke ${userNm(h.toUser)}`;
    case 'TRANSFER':
      return `Mutasi: ${who(h.fromUser, h.fromOffice)} ke ${who(h.toUser, h.toOffice)}`;
    case 'RETURN':
      return `Dikembalikan ke stok ${officeNm(h.toOffice)}${h.fromUser ? ` dari ${userNm(h.fromUser)}` : ''}`;
    case 'STATUS_CHANGE':
      return `Status ${h.fromStatus ? STATUS_LABEL[h.fromStatus] : '–'} menjadi ${h.toStatus ? STATUS_LABEL[h.toStatus] : '–'}`;
  }
}

/** SCR-04 Detail & Tracking: info asset, pemakai & kantor saat ini, timeline riwayat, Assign / Mutasi. */
export function AssetDetailDialog({ assetNo, onClose }: { assetNo: string; onClose: () => void }) {
  const { api, me, officeNm, userNm, categoryNm, users, run } = useApp();
  const { data: a, error, loading } = useLoad(() => api.getAsset(assetNo), [assetNo]);
  const [assigning, setAssigning] = useState(false);
  const isAdmin = me.roleCd === 'ADMIN_GA';

  if (assigning && a) return <AssignDialog asset={a} onClose={() => setAssigning(false)} />;

  const u = users.find((x) => x.userId === a?.userId);
  const p = a?.pendingAssignment;
  const actions: DialogAction[] = [{ label: 'Tutup', onClick: onClose }];
  if (a && isAdmin && !p) actions.push({ label: a.userId ? 'Mutasi asset' : 'Assign ke user', tone: 'primary', onClick: () => setAssigning(true) });
  if (a && p && p.toUser === me.userId) {
    actions.push({ label: 'Konfirmasi terima', tone: 'primary', onClick: () => run(() => api.respondAssignment(p.assignmentId, true), 'Asset diterima').then((ok) => ok && onClose()) });
  }

  return (
    <Dialog title={a?.assetNm ?? assetNo} onClose={onClose} actions={actions}>
      {error && <p className="err">{error}</p>}
      {loading && !a && <Loading />}
      {a && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <AssetTag no={a.assetNo} big />
            <StatusPill status={a.status} />
          </div>
          <div style={{ marginTop: 16 }}>
            <Who name={u?.userNm ?? null} sub={`${u?.dept ? u.dept + ', ' : ''}${officeNm(a.officeCd)}`} />
          </div>
          {p && (
            <div className="banner tip" style={{ marginTop: 12, marginBottom: 0 }}>
              <div>
                <b>Menunggu konfirmasi {userNm(p.toUser)}</b> ({p.assignType === 'ASSIGN' ? 'assign' : 'mutasi'} ke {officeNm(p.toOffice)}, diminta {dateTimeLabel(p.requestedDt)}).
                {isAdmin && (
                  <div className="actions">
                    <button className="btn" onClick={() => run(() => api.cancelAssignment(p.assignmentId), 'Permintaan dibatalkan')}>
                      Batalkan permintaan
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="info">
            <div><span>Merk / model</span><b>{a.brandModel ?? '–'}</b></div>
            <div><span>Serial number</span><b>{a.serialNo ?? '–'}</b></div>
            <div><span>Kategori</span><b>{categoryNm(a.categoryCd)}</b></div>
            <div><span>Tanggal perolehan</span><b>{dateLabel(a.acqDt)}</b></div>
            <div><span>Kondisi</span><b>{{ BAIK: 'Baik', RUSAK_RINGAN: 'Rusak ringan', RUSAK_BERAT: 'Rusak berat' }[a.condition]}</b></div>
          </div>
          {me.roleCd !== 'USER' && <AiInsight assetNo={a.assetNo} />}
          <h3 style={{ fontSize: 'var(--text-sm)', margin: '0 0 12px', fontWeight: 800 }}>Riwayat</h3>
          <ul className="timeline">
            {a.history.map((h) => (
              <li key={h.histId}>
                <b>{historyText(h, officeNm, userNm)}</b>
                {h.reason && h.action !== 'REGISTER' && <span className="muted" style={{ display: 'block' }}>{h.reason}</span>}
                <span className="muted">
                  {dateTimeLabel(h.createdDt)}, oleh {userNm(h.createdBy)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

/** FR-03 / FR-04: assign, mutasi antar user/kantor, atau kembalikan ke stok. */
function AssignDialog({ asset: a, onClose }: { asset: AssetDetail; onClose: () => void }) {
  const { api, offices, users, officeNm, userNm, toast, refresh } = useApp();
  const [toOffice, setToOffice] = useState(a.officeCd);
  const [toUser, setToUser] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const { data: active } = useLoad(() => api.listOpnames(), []);
  const frozen = (active ?? []).filter((o) => o.status !== 'APPROVED' && (o.officeCd === a.officeCd || o.officeCd === toOffice));
  const blocked = a.status === 'MISSING' || a.status === 'DISPOSED';

  const save = async () => {
    setErr('');
    try {
      const r = await api.requestAssignment(a.assetNo, { toOfficeCd: toOffice, toUserId: toUser || null, reason });
      toast(r.outcome === 'PENDING' ? `Permintaan dikirim ke ${userNm(toUser)}, menunggu konfirmasi terima` : 'Perubahan asset tersimpan');
      refresh();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Dialog
      title={a.userId ? 'Mutasi asset' : 'Assign ke user'}
      onClose={onClose}
      actions={[{ label: 'Kembali', onClick: onClose }, { label: 'Simpan perubahan', tone: 'primary', onClick: save, disabled: blocked || frozen.length > 0 }]}
    >
      <p style={{ marginTop: 0 }}>
        <AssetTag no={a.assetNo} />
      </p>
      {blocked && <p className="err">Asset berstatus {STATUS_LABEL[a.status]} tidak bisa di-assign atau dimutasi (BR-02).</p>}
      {frozen.length > 0 && (
        <p className="err">
          Stock opname {frozen.map((o) => officeNm(o.officeCd)).join(', ')} sedang berjalan. Mutasi dibuka lagi setelah opname di-approve (BR-04).
        </p>
      )}
      <div className="field">
        <label htmlFor="mOff">Kantor tujuan</label>
        <select id="mOff" value={toOffice} onChange={(e) => (setToOffice(e.target.value), setToUser(''))}>
          {offices.map((o) => (
            <option key={o.officeCd} value={o.officeCd}>
              {o.officeNm}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="mUser">User tujuan</label>
        <select id="mUser" value={toUser} onChange={(e) => setToUser(e.target.value)}>
          <option value="">Stok kantor (tanpa user)</option>
          {users
            .filter((u) => u.officeCd === toOffice && u.isActive && u.userId !== a.userId)
            .map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.userNm} – {u.dept}
              </option>
            ))}
        </select>
        <span className="hint">
          {toUser ? 'User tujuan menerima notifikasi dan harus konfirmasi terima sebelum asset berpindah.' : 'Asset langsung kembali ke stok kantor tujuan.'}
        </span>
      </div>
      <div className="field">
        <label htmlFor="mWhy">Alasan</label>
        <input id="mWhy" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: karyawan baru, rotasi, penggantian" />
      </div>
      {err && <p className="err">{err}</p>}
    </Dialog>
  );
}

/** Ringkasan AI di detail asset: skor kesehatan & dokumen terkait (dibedakan dari data terverifikasi). */
function AiInsight({ assetNo }: { assetNo: string }) {
  const { api } = useApp();
  const { data } = useLoad(async () => {
    const [h, docs] = await Promise.all([api.ai.getHealth(assetNo).catch(() => null), api.ai.listDocuments({ assetNo }).catch(() => [])]);
    return { h, docs };
  }, [assetNo]);
  if (!data?.h) return null;
  const { h, docs } = data;
  return (
    <div className="ai-box" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <AiChip>Kesehatan · {h.ruleVersion}</AiChip>
        <HealthBadge score={h.score} cls={h.healthClass} />
        <ClassPill cls={h.healthClass} />
      </div>
      {h.factors.length > 0 && (
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)' }}>
          {h.factors.map((f) => `${f.label} (${f.impact})`).join(' · ')}
        </p>
      )}
      {docs.length > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)' }}>
          Dokumen: {docs.map((d) => `${d.docNo} ${d.fileName} (${d.status === 'APPROVED' ? 'terverifikasi' : 'belum dikonfirmasi'})`).join(', ')}
        </p>
      )}
    </div>
  );
}
