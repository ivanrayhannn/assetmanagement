import { useEffect, useRef, type ReactNode } from 'react';
import type { AssetStatus } from '../api/types';
import { initials, STATUS_LABEL } from '../domain/labels';
import { Icon } from './Icon';

const PILL_CLASS: Record<AssetStatus, string> = {
  AVAILABLE: 's-Available',
  IN_USE: 's-InUse',
  UNDER_REPAIR: 's-UnderRepair',
  MISSING: 's-Missing',
  DISPOSED: 's-Disposed',
};

export const StatusPill = ({ status }: { status: AssetStatus }) => <span className={`pill ${PILL_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;

export const Pill = ({ tone, children }: { tone: AssetStatus; children: ReactNode }) => <span className={`pill ${PILL_CLASS[tone]}`}>{children}</span>;

/** Nomor asset dengan glyph QR, sama dengan label yang ditempel (SA §1 poin 3). */
export const AssetTag = ({ no, big }: { no: string; big?: boolean }) => (
  <span className={`tag${big ? ' big' : ''}`}>
    <i>
      <Icon name="qr" />
    </i>
    {no}
  </span>
);

export const PageHead = ({ title, desc, hello, actions }: { title: string; desc?: ReactNode; hello?: string; actions?: ReactNode }) => (
  <div className="phead">
    <div className="t">
      {hello && <div className="hello">{hello}</div>}
      <h1>{title}</h1>
      {desc && <p>{desc}</p>}
    </div>
    {actions}
  </div>
);

export const Banner = ({ tone, children }: { tone: 'bad' | 'good' | 'info'; children: ReactNode }) => (
  <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
    <Icon name={tone === 'bad' ? 'alert' : tone === 'good' ? 'check' : 'info'} />
    <div>{children}</div>
  </div>
);

export const Who = ({ name, sub }: { name: string | null; sub: string }) => (
  <div className="who">
    <div className="av">{name ? initials(name) : '—'}</div>
    <div>
      <b>{name ?? 'Stok kantor'}</b>
      <span>{sub}</span>
    </div>
  </div>
);

export const Loading = ({ text = 'Memuat data…' }: { text?: string }) => <div className="loading">{text}</div>;

export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="card">
    <p className="err" style={{ marginTop: 0 }}>
      {message}
    </p>
    {onRetry && (
      <button className="btn" onClick={onRetry}>
        Coba lagi
      </button>
    )}
  </div>
);

export interface DialogAction {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'danger';
  disabled?: boolean;
}

/** Dialog native; tampil sebagai bottom sheet di HP (gaya prototipe). */
export function Dialog({ title, onClose, actions, children }: { title: string; onClose: () => void; actions?: DialogAction[]; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dlgTitle"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="grab" />
      <div className="dh">
        <h3 id="dlgTitle">{title}</h3>
        <button className="x" onClick={onClose} aria-label="Tutup">
          <Icon name="close" />
        </button>
      </div>
      <div className="db">{children}</div>
      {actions && actions.length > 0 && (
        <div className="df">
          {actions.map((a) => (
            <button key={a.label} className={`btn ${a.tone ?? ''}`} onClick={a.onClick} disabled={a.disabled}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </dialog>
  );
}

export function downloadFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
