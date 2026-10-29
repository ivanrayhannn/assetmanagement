import type { ReactNode } from 'react';
import type { AlertCategory, AlertNature, CaseStatus, DocStatus, FieldStatus, HealthClass, RecommendationType, Severity, Urgency, WorkOrderStatus } from '../../api/ai-types';
import { Icon } from '../../components/Icon';

/* Label & komponen bersama modul AI. Hasil AI selalu diberi penanda agar beda dari record terverifikasi. */

export const HEALTH_LABEL: Record<HealthClass, string> = { HEALTHY: 'Sehat', MONITOR: 'Pantau', AT_RISK: 'Berisiko', CRITICAL: 'Kritis', INSUFFICIENT_DATA: 'Data belum cukup' };
export const URGENCY_LABEL: Record<Urgency, string> = { HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' };
export const REC_LABEL: Record<RecommendationType, string> = { INSPECTION: 'Inspeksi', PREVENTIVE: 'Preventive maintenance', DIAGNOSIS: 'Diagnosa lanjutan', REPLACEMENT: 'Penggantian' };
export const WO_LABEL: Record<WorkOrderStatus, string> = { DRAFT: 'Draft – menunggu approval', APPROVED: 'Disetujui', REJECTED: 'Ditolak', COMPLETED: 'Selesai', CANCELLED: 'Batal' };
export const DOC_STATUS_LABEL: Record<DocStatus, string> = { EXTRACTED: 'Siap direview', NEEDS_VERIFICATION: 'Perlu verifikasi', APPROVED: 'Disetujui', REJECTED: 'Ditolak' };
export const FIELD_STATUS_LABEL: Record<FieldStatus, string> = { OK: 'OK', NOT_FOUND: 'Tidak ditemukan', UNREADABLE: 'Tidak terbaca', CONFLICT: 'Bertentangan', VERIFY: 'Perlu verifikasi' };
export const SEVERITY_LABEL: Record<Severity, string> = { LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi', CRITICAL: 'Kritis' };
export const CATEGORY_LABEL: Record<AlertCategory, string> = { DUPLICATE_ASSET: 'Duplikat asset', UNUSUAL_TRANSACTION: 'Transaksi tidak biasa', MAINTENANCE_COST: 'Biaya maintenance', STOCK_OPNAME: 'Selisih stock opname' };
export const NATURE_LABEL: Record<AlertNature, string> = {
  POLICY_VIOLATION: 'Pelanggaran kebijakan',
  STATISTICAL_ANOMALY: 'Anomali pola (statistik)',
  DATA_QUALITY: 'Kualitas data',
  INCOMPLETE_PROCESS: 'Proses belum selesai',
  CONFIRMED_DISCREPANCY: 'Selisih terkonfirmasi',
};
export const CASE_LABEL: Record<CaseStatus, string> = {
  NEW: 'Baru', UNDER_REVIEW: 'Dalam review', CONFIRMED: 'Temuan terkonfirmasi', FALSE_POSITIVE: 'False positive',
  REMEDIATION: 'Remediasi berjalan', ESCALATED: 'Dieskalasi', CLOSED: 'Ditutup',
};

export const rupiah = (n: number | null | undefined) => (n === null || n === undefined ? '–' : 'Rp ' + Math.round(n).toLocaleString('id-ID'));
export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const AiChip = ({ children = 'AI · simulasi' }: { children?: ReactNode }) => (
  <span className="ai-chip">
    <span style={{ width: 12, height: 12, display: 'inline-grid' }}>
      <Icon name="spark" />
    </span>
    {children}
  </span>
);

export const AiNotice = ({ children }: { children: ReactNode }) => (
  <div className="ai-box" style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--text-sm)' }}>
    <div style={{ marginBottom: 6 }}>
      <AiChip />
    </div>
    {children}
  </div>
);

export const HealthBadge = ({ score, cls }: { score: number | null; cls: HealthClass }) => (
  <span className={`score h-${cls}`} title={HEALTH_LABEL[cls]}>
    {score ?? '–'}
  </span>
);

export const ClassPill = ({ cls }: { cls: HealthClass }) => <span className={`pill h-${cls}`}>{HEALTH_LABEL[cls]}</span>;
export const SeverityPill = ({ s, score }: { s: Severity; score?: number }) => (
  <span className={`pill sev-${s}`}>
    {SEVERITY_LABEL[s]}
    {score !== undefined ? ` · ${score}` : ''}
  </span>
);
export const UrgencyPill = ({ u }: { u: Urgency }) => <span className={`pill sev-${u === 'HIGH' ? 'HIGH' : u === 'MEDIUM' ? 'MEDIUM' : 'LOW'}`}>{URGENCY_LABEL[u]}</span>;

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export const Kpi = ({ n, l, tone }: { n: ReactNode; l: string; tone?: 'bad' | 'warn' | 'ok' }) => (
  <div className="stat" style={tone ? { background: `var(--${tone === 'bad' ? 'minus' : tone === 'warn' ? 'warn' : 'ok'}-soft)` } : undefined}>
    <b style={tone ? { color: `var(--${tone === 'bad' ? 'minus' : tone === 'warn' ? 'warn' : 'ok'})` } : undefined}>{n}</b>
    <span>{l}</span>
  </div>
);
