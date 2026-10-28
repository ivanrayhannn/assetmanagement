import { useEffect, useMemo, useState } from 'react';
import { periodOf } from '../../api/demo/db';
import { errorMessage } from '../../api/errors';
import type { CheckResult, OpnameDetail, OpnameHeader } from '../../api/types';
import { useApp, useLoad, type TabKey } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { AssetTag, Banner, Dialog, ErrorBox, Loading, PageHead, Pill } from '../../components/ui';
import { CHECK_RESULTS, dateTimeLabel, periodLabel, RESULT_LABEL } from '../../domain/labels';

const isActive = (o: OpnameHeader) => o.status === 'OPEN' || o.status === 'SUBMITTED';

/** SCR-05 Stock Opname: FR-06–FR-10, BR-04–BR-07. */
export function OpnamePage({ onGo }: { onGo: (t: TabKey) => void }) {
  const { api, me, officeNm } = useApp();
  const { data: sessions, error, reload } = useLoad(() => api.listOpnames(), [me.userId]);
  const active = useMemo(() => (sessions ?? []).filter(isActive), [sessions]);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!active.some((o) => o.opnameId === selected)) setSelected(active[0]?.opnameId ?? null);
  }, [active, selected]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!sessions) return <Loading />;

  const isAdmin = me.roleCd === 'ADMIN_GA';
  return (
    <>
      {isAdmin && active.length > 0 && (
        <div className="sessions" role="group" aria-label="Sesi opname berjalan">
          {active.map((o) => (
            <button key={o.opnameId} aria-pressed={o.opnameId === selected} onClick={() => setSelected(o.opnameId)}>
              <b>{officeNm(o.officeCd)}</b>
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                {periodLabel(o.period)} · {o.status === 'OPEN' ? `${o.qtyChecked}/${o.qtySystem} dicek` : 'Menunggu approval'}
              </span>
            </button>
          ))}
        </div>
      )}
      {selected !== null ? (
        <OpnameSession opnameId={selected} onApproved={() => onGo('laporan')} />
      ) : (
        <PageHead title="Stock opname" desc="Pemeriksaan kondisi aktual: cocokkan asset yang tercatat di sistem dengan fisik di kantor." />
      )}
      {isAdmin ? (
        <CreateSession sessions={sessions} onCreated={setSelected} />
      ) : (
        selected === null && (
          <div className="card start">
            <h3>Belum ada sesi opname</h3>
            <p className="sub" style={{ marginBottom: 0 }}>
              Sesi untuk {officeNm(me.officeCd)} dibuat oleh Admin GA. Anda akan menerima email saat sesi dibuka.
            </p>
          </div>
        )
      )}
    </>
  );
}

/** FR-06: Admin GA buat sesi per kantor; sistem snapshot daftar asset & membekukan mutasi (BR-04). */
function CreateSession({ sessions, onCreated }: { sessions: OpnameHeader[]; onCreated: (id: number) => void }) {
  const { api, offices, toast, refresh } = useApp();
  const { data: summary } = useLoad(() => api.dashboardSummary(), []);
  const period = periodOf(new Date());
  const available = offices.filter((o) => !sessions.some((s) => s.officeCd === o.officeCd && (isActive(s) || s.period === period)));
  const [office, setOffice] = useState('');
  const [err, setErr] = useState('');
  const pick = available.some((o) => o.officeCd === office) ? office : available[0]?.officeCd ?? '';
  const count = (cd: string) => summary?.byOffice.filter((b) => b.officeCd === cd && b.status !== 'MISSING').reduce((t, b) => t + b.qty, 0);

  const create = async () => {
    setErr('');
    try {
      const h = await api.createOpname(pick);
      toast(`Sesi opname ${h.officeCd} ${periodLabel(h.period)} dibuat, ${h.qtySystem} asset di-snapshot`);
      refresh();
      onCreated(h.opnameId);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <div className="card start" style={{ marginTop: 'var(--space-md)' }}>
      <h3>Buat sesi opname {periodLabel(period)}</h3>
      {available.length === 0 ? (
        <p className="sub" style={{ marginBottom: 0 }}>
          Semua kantor sudah punya sesi untuk periode ini atau sesi yang belum di-approve.
        </p>
      ) : (
        <>
          <p className="sub">Pilih kantor yang akan diperiksa.</p>
          <div className="officepick">
            {available.map((o) => (
              <label key={o.officeCd}>
                <input type="radio" name="oOff" value={o.officeCd} checked={pick === o.officeCd} onChange={() => setOffice(o.officeCd)} />
                <span>
                  {o.officeNm}
                  <small>{count(o.officeCd) ?? '…'} asset akan diperiksa</small>
                </span>
              </label>
            ))}
          </div>
          <button className="btn primary" style={{ width: '100%' }} onClick={create}>
            Buat sesi opname
          </button>
          {err && <p className="err">{err}</p>}
          <p className="note">Sistem menyimpan snapshot daftar asset (Qty Sistem) dan membekukan mutasi kantor tsb sampai opname di-approve (BR-04).</p>
        </>
      )}
    </div>
  );
}

function OpnameSession({ opnameId, onApproved }: { opnameId: number; onApproved: () => void }) {
  const { api, me, officeNm, userNm, users, run, toast } = useApp();
  const { data: o, error, reload } = useLoad(() => api.getOpname(opnameId), [opnameId]);
  const [err, setErr] = useState('');
  const [scan, setScan] = useState('');
  const [hl, setHl] = useState<string | null>(null);
  const [plus, setPlus] = useState(false);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!o) return <Loading />;

  const canCheck = me.roleCd === 'PIC' && me.officeCd === o.officeCd && o.status === 'OPEN';
  const canApprove = me.roleCd === 'ADMIN_GA' && o.status === 'SUBMITTED';
  const assets = o.items.filter((i) => i.assetNo);
  const plusItems = o.items.filter((i) => !i.assetNo);
  const pct = (n: number) => `${o.qtySystem ? (n / o.qtySystem) * 100 : 0}%`;
  const foundChecked = assets.filter((i) => i.result && i.result !== 'TIDAK_DITEMUKAN').length;

  const check = (assetNo: string, result: Exclude<CheckResult, 'PLUS'> | null, extra?: { actualUserId?: string | null; remark?: string | null }) =>
    run(() => api.saveCheck(o.opnameId, assetNo, { result, ...extra }));

  /** FR-07: scan QR / ketik nomor -> asset ditandai Sesuai (scan beruntun). */
  const onScan = async () => {
    const no = scan.trim().toUpperCase();
    if (!no) return;
    const item = assets.find((i) => i.assetNo === no);
    if (!item) {
      toast(`${no} tidak ada di daftar opname ini. Bila barangnya ada, catat sebagai temuan plus.`);
      return;
    }
    setHl(no);
    setScan('');
    if (!item.result) await check(no, 'SESUAI');
    document.getElementById(`row-${no}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const submit = async () => {
    setErr('');
    try {
      await api.submitOpname(o.opnameId);
      toast('Hasil opname disubmit, menunggu approval Admin GA');
      reload();
    } catch (e) {
      setErr(errorMessage(e));
      document.getElementById('oErr')?.scrollIntoView({ block: 'center' });
    }
  };

  const approve = async () => {
    const ok = await run(() => api.approveOpname(o.opnameId), o.qtyMinus ? `Approved: ${o.qtyMinus} asset menjadi Hilang` : 'Approved: tidak ada selisih');
    if (ok) onApproved();
  };

  return (
    <>
      <PageHead
        title={`Opname ${officeNm(o.officeCd)}`}
        desc={
          <>
            Periode {periodLabel(o.period)}.{' '}
            {o.status === 'OPEN'
              ? canCheck
                ? 'Pilih hasil cek fisik untuk setiap asset, atau scan label QR.'
                : `Menunggu PIC ${officeNm(o.officeCd)} menyelesaikan pemeriksaan.`
              : o.status === 'SUBMITTED'
                ? `Disubmit ${userNm(o.submittedBy)} ${dateTimeLabel(o.submittedDt!)}. Menunggu approval Admin GA.`
                : 'Sudah di-approve.'}
          </>
        }
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canCheck && (
              <button className="btn primary" onClick={submit}>
                Submit hasil
              </button>
            )}
            {canApprove && (
              <button className="btn primary" onClick={approve}>
                Approve & update status
              </button>
            )}
          </div>
        }
      />
      {canApprove && o.qtyMinus > 0 && (
        <Banner tone="bad">
          Approve akan mengubah <strong>{o.qtyMinus} asset menjadi Hilang</strong>, asset Rusak menjadi Perbaikan, dan memindahkan asset Beda lokasi ke user aktual (BR-07).
        </Banner>
      )}
      <div className="prog">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          <span>Progres pemeriksaan</span>
          <span>
            {o.qtyChecked} dari {o.qtySystem}
          </span>
        </div>
        <div className="bar" aria-hidden="true">
          <span style={{ width: pct(foundChecked), background: 'var(--ok)' }} />
          <span style={{ width: pct(o.qtyMinus), background: 'var(--minus)' }} />
        </div>
        <div className="stats">
          <div className="stat"><b>{o.qtySystem}</b><span>Asset di sistem</span></div>
          <div className="stat"><b>{o.qtyChecked}</b><span>Sudah dicek</span></div>
          <div className="stat"><b>{foundChecked}</b><span>Fisik ditemukan</span></div>
          <div className={`stat${o.qtyMinus ? ' neg' : ''}`}><b>{o.qtyMinus ? `−${o.qtyMinus}` : '0'}</b><span>Selisih minus</span></div>
          <div className="stat"><b>{o.qtyPlus ? `+${o.qtyPlus}` : '0'}</b><span>Temuan plus</span></div>
        </div>
      </div>

      {canCheck && (
        <div className="toolbar">
          <form className="scan" onSubmit={(e) => (e.preventDefault(), onScan())}>
            <input value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan QR / ketik nomor asset lalu Enter" aria-label="Scan nomor asset" autoCapitalize="characters" />
            <button className="btn" type="submit">
              <Icon name="check" />
              Sesuai
            </button>
          </form>
          <button className="btn" onClick={() => run(async () => toast(`${await api.markRemainingOk(o.opnameId)} asset ditandai sesuai`))}>
            <Icon name="check" />
            Tandai sisa sesuai
          </button>
          <button className="btn" onClick={() => setPlus(true)}>
            <Icon name="plus" />
            Catat temuan plus
          </button>
        </div>
      )}
      <p className="err" id="oErr">
        {err}
      </p>

      <div className="list">
        <table className="rt">
          <thead>
            <tr>
              <th>Nomor asset</th>
              <th>Nama asset</th>
              <th>User di sistem</th>
              <th>Hasil cek fisik</th>
              <th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((i) => (
              <tr key={i.opnameDId} id={`row-${i.assetNo}`} className={`${i.result === 'TIDAK_DITEMUKAN' ? 'neg' : ''} ${hl === i.assetNo ? 'hl' : ''}`}>
                <td data-k="main">
                  <AssetTag no={i.assetNo!} />
                </td>
                <td data-k="title">{i.assetNm}</td>
                <td data-l="User di sistem" data-k="wide">
                  {i.sysUserId ? userNm(i.sysUserId) : <span className="muted">Stok kantor</span>}
                </td>
                <td data-k="wide">
                  <div className="seg" role="group" aria-label={`Hasil cek ${i.assetNo}`}>
                    {CHECK_RESULTS.map((r) => (
                      <button
                        key={r}
                        className={r}
                        aria-pressed={i.result === r}
                        disabled={!canCheck}
                        onClick={() => {
                          if (r === 'BEDA_LOKASI' && i.result !== r) {
                            const fallback = users.find((u) => u.officeCd === o.officeCd && u.isActive && u.userId !== i.sysUserId);
                            return check(i.assetNo!, r, { actualUserId: fallback?.userId ?? null });
                          }
                          return check(i.assetNo!, i.result === r ? null : r);
                        }}
                      >
                        {RESULT_LABEL[r]}
                      </button>
                    ))}
                  </div>
                  {i.result === 'BEDA_LOKASI' && (
                    <div className="beda">
                      <label className="muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }} htmlFor={`au-${i.opnameDId}`}>
                        Dipakai oleh
                      </label>
                      <select id={`au-${i.opnameDId}`} value={i.actualUserId ?? ''} disabled={!canCheck} onChange={(e) => check(i.assetNo!, 'BEDA_LOKASI', { actualUserId: e.target.value })}>
                        {users
                          .filter((u) => u.isActive)
                          .map((u) => (
                            <option key={u.userId} value={u.userId}>
                              {u.userNm} ({u.officeCd})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </td>
                <td data-k="wide">
                  <input
                    className="remark"
                    defaultValue={i.remark ?? ''}
                    disabled={!canCheck || !i.result}
                    placeholder={i.result ? 'Catatan (opsional)' : 'Pilih hasil cek dulu'}
                    aria-label={`Catatan ${i.assetNo}`}
                    onBlur={(e) => e.target.value !== (i.remark ?? '') && i.result && check(i.assetNo!, i.result as Exclude<CheckResult, 'PLUS'>, { actualUserId: i.actualUserId, remark: e.target.value })}
                  />
                </td>
              </tr>
            ))}
            {plusItems.map((p) => (
              <tr key={p.opnameDId}>
                <td data-k="main">
                  <Pill tone="AVAILABLE">Temuan plus</Pill>
                </td>
                <td data-k="title">{p.assetNm}</td>
                <td data-k="wide" className="muted">
                  Belum terdaftar
                </td>
                <td data-k="wide">Ditemukan</td>
                <td data-k="wide">{p.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plus && <PlusDialog opname={o} onClose={() => setPlus(false)} />}
    </>
  );
}

/** FR-08: barang fisik tanpa nomor asset. */
function PlusDialog({ opname, onClose }: { opname: OpnameDetail; onClose: () => void }) {
  const { api, categories, run } = useApp();
  const [f, setF] = useState({ plusDesc: '', categoryCd: categories[0]?.categoryCd ?? '', remark: '' });
  const [err, setErr] = useState('');
  return (
    <Dialog
      title="Catat temuan plus"
      onClose={onClose}
      actions={[
        { label: 'Batal', onClick: onClose },
        {
          label: 'Simpan temuan',
          tone: 'primary',
          onClick: async () => {
            if (!f.plusDesc.trim()) return setErr('Nama barang wajib diisi.');
            if (await run(() => api.addPlus(opname.opnameId, f), 'Temuan plus dicatat')) onClose();
          },
        },
      ]}
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Barang yang ada secara fisik tetapi belum punya nomor asset di sistem. Admin GA akan meregistrasinya.
      </p>
      <div className="field">
        <label htmlFor="pName">Nama barang</label>
        <input id="pName" value={f.plusDesc} onChange={(e) => setF({ ...f, plusDesc: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="pCat">Perkiraan kategori</label>
        <select id="pCat" value={f.categoryCd} onChange={(e) => setF({ ...f, categoryCd: e.target.value })}>
          {categories.map((c) => (
            <option key={c.categoryCd} value={c.categoryCd}>
              {c.categoryNm}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pRem">Catatan lokasi</label>
        <input id="pRem" value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} placeholder="Contoh: gudang lantai 2" />
      </div>
      {err && <p className="err">{err}</p>}
    </Dialog>
  );
}
