import { Fragment, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { OpnameHeader } from '../../api/types';
import { useApp, useLoad, type TabKey } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { AssetTag, Banner, downloadFile, ErrorBox, Loading, PageHead, Pill } from '../../components/ui';
import { periodLabel } from '../../domain/labels';

/** SCR-06 Laporan Selisih: FR-09, FR-13. Baris merah = ada asset tidak ditemukan. */
export function VariancePage({ onGo }: { onGo: (t: TabKey) => void }) {
  const { api, me, officeNm, toast } = useApp();
  const { data: sessions, error, reload } = useLoad(() => api.listOpnames(), [me.userId]);
  const [open, setOpen] = useState<number | null>(null);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!sessions) return <Loading />;

  const approved = sessions.filter((o) => o.status === 'APPROVED');
  const pending = sessions.filter((o) => o.status === 'SUBMITTED');

  const exportFile = async (opnameId?: number) => {
    try {
      const f = await api.exportVariance(opnameId);
      downloadFile(f.fileName, f.blob);
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <>
      <PageHead
        title="Laporan selisih"
        desc="Jumlah asset di sistem dibanding fisik per kantor dan periode. Pilih baris merah untuk melihat asset yang tidak ditemukan."
        actions={
          <button className="btn" onClick={() => exportFile()}>
            <Icon name="download" />
            Export semua
          </button>
        }
      />
      {pending.map((o) => (
        <Banner key={o.opnameId} tone="bad">
          Opname {officeNm(o.officeCd)} {periodLabel(o.period)} menunggu approval: selisih minus {o.qtyMinus}, temuan plus {o.qtyPlus}.
          {me.roleCd === 'ADMIN_GA' && (
            <div className="actions">
              <button className="btn primary" onClick={() => onGo('opname')}>
                Review & approve
              </button>
            </div>
          )}
        </Banner>
      ))}
      <div className="list">
        <table className="rt">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Kantor</th>
              <th className="r">Asset di sistem</th>
              <th className="r">Fisik ditemukan</th>
              <th className="r">Selisih minus</th>
              <th className="r">Temuan plus</th>
            </tr>
          </thead>
          <tbody>
            {approved.length === 0 && (
              <tr>
                <td data-k="wide" className="empty" colSpan={6}>
                  Belum ada opname yang di-approve.
                </td>
              </tr>
            )}
            {approved.map((o) => (
              <Fragment key={o.opnameId}>
                <tr
                  className={o.qtyMinus ? 'click neg' : ''}
                  tabIndex={o.qtyMinus ? 0 : undefined}
                  onClick={() => o.qtyMinus && setOpen(open === o.opnameId ? null : o.opnameId)}
                  onKeyDown={(e) => e.key === 'Enter' && o.qtyMinus && setOpen(open === o.opnameId ? null : o.opnameId)}
                  aria-expanded={o.qtyMinus ? open === o.opnameId : undefined}
                >
                  <td data-k="main">
                    <b>{periodLabel(o.period)}</b>
                    {o.qtyMinus ? <Pill tone="MISSING">−{o.qtyMinus}</Pill> : <Pill tone="IN_USE">Sesuai</Pill>}
                  </td>
                  <td data-k="title">{officeNm(o.officeCd)}</td>
                  <td className="r" data-l="Di sistem">{o.qtySystem}</td>
                  <td className="r" data-l="Fisik">{o.qtyFound}</td>
                  <td className="r hide-sm">{o.qtyMinus ? <Pill tone="MISSING">−{o.qtyMinus}</Pill> : <span className="muted">0</span>}</td>
                  <td className="r" data-l="Plus">{o.qtyPlus ? `+${o.qtyPlus}` : '0'}</td>
                </tr>
                {open === o.opnameId && <MinusDetail session={o} onExport={() => exportFile(o.opnameId)} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Selisih minus = asset di sistem − fisik ditemukan (BR-05). Mode demo meng-export CSV untuk Excel; versi produksi meng-export Excel/PDF dari server (FR-13).
      </p>
    </>
  );
}

function MinusDetail({ session, onExport }: { session: OpnameHeader; onExport: () => void }) {
  const { api } = useApp();
  const { data } = useLoad(() => api.minusItems(session.opnameId), [session.opnameId]);
  return (
    <tr className="detail-row">
      <td colSpan={6} data-k="wide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 'var(--text-sm)' }}>Asset tidak ditemukan</b>
          <button className="btn ghost" onClick={onExport}>
            <Icon name="download" />
            Export sesi ini
          </button>
        </div>
        {!data && <Loading />}
        {data?.map((m) => (
          <div key={m.assetNo} className="minirow">
            <AssetTag no={m.assetNo} />
            <span>
              <b>{m.assetNm}</b>
            </span>
            <span className="muted">User terakhir: {m.lastUserNm ?? 'Stok kantor'}</span>
            {m.remark && <span className="muted">{m.remark}</span>}
          </div>
        ))}
      </td>
    </tr>
  );
}
