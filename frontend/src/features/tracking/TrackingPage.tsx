import { useState } from 'react';
import type { Assignment } from '../../api/types';
import { useApp, useLoad } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { AssetTag, Banner, Dialog, PageHead, StatusPill, Who } from '../../components/ui';
import { dateTimeLabel } from '../../domain/labels';
import { AssetDetailDialog } from '../assets/AssetDialogs';

/** FR-05 Tracking: cari asset -> user & kantor saat ini. Role User: "Asset saya" + konfirmasi terima (UC-01). */
export function TrackingPage() {
  const { api, me, officeNm, userNm, users } = useApp();
  const mine = me.roleCd === 'USER';
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Assignment | null>(null);
  const text = q.trim();
  const { data } = useLoad(() => (mine || text ? api.listAssets({ q: mine ? '' : text, pageSize: 50 }) : Promise.resolve(null)), [text, mine, me.userId]);
  const { data: pending } = useLoad(() => (mine ? api.myPendingAssignments() : Promise.resolve([])), [mine, me.userId]);
  const list = (data?.items ?? []).filter((a) => !mine || a.userId === me.userId);

  return (
    <>
      <PageHead
        hello={mine ? `Halo, ${me.userNm.split(' ')[0]}` : undefined}
        title={mine ? 'Asset saya' : 'Tracking asset'}
        desc={
          mine
            ? 'Asset yang tercatat atas nama Anda. Laporkan ke Admin GA bila ada yang tidak sesuai.'
            : 'Cari nomor asset, nama user, atau kantor untuk melihat asset ada di user mana dan di kantor mana.'
        }
      />
      {mine && pending && pending.length > 0 && <PendingList items={pending} onReject={setRejecting} onOpen={setDetail} />}
      {!mine && (
        <div className="toolbar">
          <div className="search xl">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="AST-JKT-LPT-2024-0001 atau Budi" aria-label="Cari asset" />
          </div>
        </div>
      )}
      <div className="cards">
        {!mine && !text && (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            Ketik nomor asset, nama asset, user, atau kantor.
          </div>
        )}
        {(mine || text) && data && list.length === 0 && (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            {mine ? 'Belum ada asset atas nama Anda.' : 'Asset tidak ditemukan. Periksa kembali nomor asset atau nama user.'}
          </div>
        )}
        {list.map((a) => {
          const u = users.find((x) => x.userId === a.userId);
          return (
            <button key={a.assetNo} className="acard" onClick={() => setDetail(a.assetNo)}>
              <div className="top">
                <AssetTag no={a.assetNo} />
                <StatusPill status={a.status} />
              </div>
              <h4>{a.assetNm}</h4>
              <Who name={u ? userNm(u.userId) : null} sub={officeNm(a.officeCd)} />
            </button>
          );
        })}
      </div>
      {data && data.total > list.length && !mine && <p className="count">Menampilkan {list.length} dari {data.total}. Persempit kata kunci.</p>}
      {detail && <AssetDetailDialog assetNo={detail} onClose={() => setDetail(null)} />}
      {rejecting && <RejectDialog item={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}

function PendingList({ items, onReject, onOpen }: { items: Assignment[]; onReject: (a: Assignment) => void; onOpen: (no: string) => void }) {
  const { api, run, userNm, officeNm } = useApp();
  return (
    <Banner tone="info">
      <b>
        {items.length} asset menunggu konfirmasi terima Anda.
      </b>{' '}
      Periksa fisiknya dulu, lalu konfirmasi bila sesuai.
      {items.map((x) => (
        <div key={x.assignmentId} className="minirow">
          <button className="tag" style={{ cursor: 'pointer' }} onClick={() => onOpen(x.assetNo)}>
            {x.assetNo}
          </button>
          <span className="muted">
            dari {x.fromUser ? userNm(x.fromUser) : 'stok'} {officeNm(x.fromOffice)}, diminta {userNm(x.requestedBy)} {dateTimeLabel(x.requestedDt)}
            {x.reason ? ` – ${x.reason}` : ''}
          </span>
          <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn" onClick={() => onReject(x)}>
              Tolak
            </button>
            <button className="btn primary" onClick={() => run(() => api.respondAssignment(x.assignmentId, true), `Asset ${x.assetNo} diterima`)}>
              Konfirmasi terima
            </button>
          </span>
        </div>
      ))}
    </Banner>
  );
}

function RejectDialog({ item, onClose }: { item: Assignment; onClose: () => void }) {
  const { api, run } = useApp();
  const [note, setNote] = useState('');
  return (
    <Dialog
      title="Tolak asset"
      onClose={onClose}
      actions={[
        { label: 'Batal', onClick: onClose },
        {
          label: 'Tolak asset',
          tone: 'danger',
          disabled: !note.trim(),
          onClick: () => run(() => api.respondAssignment(item.assignmentId, false, note), 'Penolakan dikirim ke Admin GA').then((ok) => ok && onClose()),
        },
      ]}
    >
      <p style={{ marginTop: 0 }}>
        <AssetTag no={item.assetNo} />
      </p>
      <div className="field">
        <label htmlFor="rj">Alasan penolakan</label>
        <textarea id="rj" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: unit lecet, charger tidak ada" />
      </div>
    </Dialog>
  );
}
