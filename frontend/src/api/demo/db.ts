import type { AiActivity, AnomalyAlert, AssetDocument, AuditCase, MaintenanceRecord, Recommendation, WorkOrder } from '../ai-types';
import type { Asset, AssetHistory, Assignment, Category, OpnameHeader, OpnameItem, Office, User } from '../types';

/* State demo = cerminan tabel SQL Server (db/migrations). Disimpan di localStorage browser. */

export type OpnameRow = Omit<OpnameHeader, 'qtyChecked'>;
export type OpnameItemRow = Omit<OpnameItem, 'assetNm'> & { opnameId: number };

export interface PurchaseOrder {
  poNo: string;
  vendor: string;
  description: string;
  qty: number;
  unitPrice: number;
  totalAmount: number;
  officeCd: string;
  categoryCd: string;
}

export interface DemoDb {
  schema: 2;
  offices: Office[];
  categories: Category[];
  users: User[];
  assets: Asset[];
  /** TB_M_ASSET_SEQ: key `${office}-${category}-${year}` -> LAST_SEQ (BR-01) */
  seq: Record<string, number>;
  history: AssetHistory[];
  assignments: Assignment[];
  opnames: OpnameRow[];
  items: OpnameItemRow[];
  /* ---- data simulasi modul AI (hanya demo; tabel DB = usulan di docs/AI-AMS-Spec.md) ---- */
  maintenance: MaintenanceRecord[];
  recommendations: Recommendation[];
  workOrders: WorkOrder[];
  purchaseOrders: PurchaseOrder[];
  documents: AssetDocument[];
  alerts: AnomalyAlert[];
  cases: AuditCase[];
  aiLog: AiActivity[];
  nextId: {
    hist: number; assignment: number; opname: number; item: number;
    maint: number; rec: number; wo: number; doc: number; alert: number; caseId: number; action: number; log: number;
  };
}

export const emptyDb = (): DemoDb => ({
  schema: 2,
  offices: [],
  categories: [],
  users: [],
  assets: [],
  seq: {},
  history: [],
  assignments: [],
  opnames: [],
  items: [],
  maintenance: [],
  recommendations: [],
  workOrders: [],
  purchaseOrders: [],
  documents: [],
  alerts: [],
  cases: [],
  aiLog: [],
  nextId: { hist: 1, assignment: 1, opname: 1, item: 1, maint: 1, rec: 1, wo: 1, doc: 1, alert: 1, caseId: 1, action: 1, log: 1 },
});

const pad = (n: number) => String(n).padStart(2, '0');

/** Waktu lokal server (WIB) dalam format datetime2 tanpa zona: 2026-10-28T09:15:00 */
export const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export const parseIso = (s: string) => {
  const [d, t = '00:00:00'] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm, ss || 0);
};

export const periodOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const STORAGE_KEY = 'ams-demo-v2';

export function loadDb(): DemoDb | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as DemoDb;
    return db?.schema === 2 && Array.isArray(db.assets) ? db : null;
  } catch {
    return null;
  }
}

export function saveDb(db: DemoDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* private mode / storage penuh: demo tetap jalan tanpa persistensi */
  }
}

export function clearDb() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* abaikan */
  }
}
