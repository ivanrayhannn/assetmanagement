import { useState } from 'react';
import type { AssetStatus } from '../../api/types';
import { useApp, useLoad } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { AssetTag, ErrorBox, PageHead, StatusPill } from '../../components/ui';
import { STATUS_LABEL, STATUSES } from '../../domain/labels';
import { AssetDetailDialog, AssetFormDialog } from './AssetDialogs';

const PAGE_SIZE = 50;

/** SCR-02 Asset Register: FR-05 search & filter, paging server-side. */
export function AssetListPage() {
  const { api, me, offices, categories, officeNm, categoryNm, userNm } = useApp();
  const [f, setF] = useState({ q: '', office: '', cat: '', status: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const isAdmin = me.roleCd === 'ADMIN_GA';
  const { data, error, reload } = useLoad(
    () => api.listAssets({ q: f.q, office: f.office, cat: f.cat, status: (f.status || undefined) as AssetStatus | undefined, page, pageSize: PAGE_SIZE }),
    [f.q, f.office, f.cat, f.status, page, me.userId],
  );
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => (setF({ ...f, [k]: e.target.value }), setPage(1));
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHead
        title="Daftar asset"
        desc="Setiap asset punya nomor unik. Pilih asset untuk melihat pemakai, kantor, dan riwayatnya."
        actions={
          isAdmin && (
            <button className="btn primary only-lg" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Tambah asset
            </button>
          )
        }
      />
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input type="search" value={f.q} onChange={set('q')} placeholder="Cari nomor asset, nama, atau pemakai" aria-label="Cari asset" />
        </div>
        <div className="chips">
          {me.roleCd !== 'PIC' && (
            <select value={f.office} onChange={set('office')} aria-label="Kantor">
              <option value="">Semua kantor</option>
              {offices.map((o) => (
                <option key={o.officeCd} value={o.officeCd}>
                  {o.officeNm}
                </option>
              ))}
            </select>
          )}
          <select value={f.cat} onChange={set('cat')} aria-label="Kategori">
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.categoryCd} value={c.categoryCd}>
                {c.categoryNm}
              </option>
            ))}
          </select>
          <select value={f.status} onChange={set('status')} aria-label="Status">
            <option value="">Semua status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <div className="list">
          <table className="rt">
            <thead>
              <tr>
                <th>Nomor asset</th>
                <th>Nama asset</th>
                <th>Kategori</th>
                <th>Kantor</th>
                <th>Pemakai</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && (
                <tr>
                  <td data-k="wide" className="empty" colSpan={6}>
                    Tidak ada asset yang cocok. Ubah kata kunci atau filter.
                  </td>
                </tr>
              )}
              {data?.items.map((a) => (
                <tr key={a.assetNo} className="click" tabIndex={0} onClick={() => setDetail(a.assetNo)} onKeyDown={(e) => e.key === 'Enter' && setDetail(a.assetNo)}>
                  <td data-k="main">
                    <AssetTag no={a.assetNo} />
                    <StatusPill status={a.status} />
                  </td>
                  <td data-k="title">
                    {a.assetNm}
                    <span className="sub2">{a.brandModel ?? '–'}</span>
                  </td>
                  <td className="hide-sm">{categoryNm(a.categoryCd)}</td>
                  <td data-l="Kantor">{officeNm(a.officeCd)}</td>
                  <td data-l="Pemakai">{a.userId ? userNm(a.userId) : <span className="muted">Stok kantor</span>}</td>
                  <td className="hide-sm">
                    <StatusPill status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="pager">
          <p className="count" style={{ margin: 0 }}>
            {data.total} asset{data.total > PAGE_SIZE ? `, halaman ${page} dari ${pages}` : ''}
          </p>
          {pages > 1 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Berikutnya
              </button>
            </div>
          )}
        </div>
      )}
      {isAdmin && (
        <button className="fab" aria-label="Tambah asset" onClick={() => setAdding(true)}>
          <Icon name="plus" />
        </button>
      )}
      {adding && <AssetFormDialog onClose={() => setAdding(false)} />}
      {detail && <AssetDetailDialog assetNo={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
