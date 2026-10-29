/* Kontrak data AMS API (/api/v1, JSON camelCase). Kode status mengikuti database (UPPER_SNAKE). */
import type { AiApi } from './ai-types';

export type RoleCd = 'ADMIN_GA' | 'PIC' | 'USER' | 'EXEC' | 'AUDITOR';
export type AssetStatus = 'AVAILABLE' | 'IN_USE' | 'UNDER_REPAIR' | 'MISSING' | 'DISPOSED';
export type AssetCondition = 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT';
export type HistoryAction = 'REGISTER' | 'ASSIGN' | 'TRANSFER' | 'RETURN' | 'STATUS_CHANGE';
export type AssignType = 'ASSIGN' | 'TRANSFER';
export type AssignmentStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
export type OpnameStatus = 'OPEN' | 'SUBMITTED' | 'APPROVED';
export type CheckResult = 'SESUAI' | 'BEDA_LOKASI' | 'RUSAK' | 'TIDAK_DITEMUKAN' | 'PLUS';

export interface Office {
  officeCd: string;
  officeNm: string;
  city: string;
  picUserId: string | null;
}

export interface Category {
  categoryCd: string;
  categoryNm: string;
}

export interface User {
  userId: string;
  userNm: string;
  email: string | null;
  dept: string | null;
  officeCd: string;
  roleCd: RoleCd;
  isActive: boolean;
}

export interface Asset {
  assetNo: string;
  assetNm: string;
  categoryCd: string;
  brandModel: string | null;
  serialNo: string | null;
  acqDt: string;
  officeCd: string;
  userId: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  remark: string | null;
  createdDt: string;
}

export interface AssetHistory {
  histId: number;
  assetNo: string;
  action: HistoryAction;
  fromUser: string | null;
  toUser: string | null;
  fromOffice: string | null;
  toOffice: string | null;
  fromStatus: AssetStatus | null;
  toStatus: AssetStatus | null;
  reason: string | null;
  opnameId: number | null;
  createdBy: string;
  createdDt: string;
}

export interface Assignment {
  assignmentId: number;
  assetNo: string;
  assignType: AssignType;
  fromUser: string | null;
  toUser: string;
  fromOffice: string;
  toOffice: string;
  reason: string | null;
  status: AssignmentStatus;
  responseNote: string | null;
  requestedBy: string;
  requestedDt: string;
  respondedDt: string | null;
}

export interface AssetDetail extends Asset {
  history: AssetHistory[];
  pendingAssignment: Assignment | null;
}

export interface AssetQuery {
  office?: string;
  cat?: string;
  status?: AssetStatus;
  q?: string;
  page?: number;
  /** Maksimal 50 (SA §7) */
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAssetInput {
  assetNm: string;
  categoryCd: string;
  officeCd: string;
  brandModel?: string;
  serialNo?: string;
  acqDt: string;
  condition?: AssetCondition;
}

/** Assign / mutasi / return. toUserId null = kembali ke stok kantor. */
export interface AssignmentInput {
  toOfficeCd: string;
  toUserId: string | null;
  reason?: string;
}

/** PENDING = menunggu konfirmasi user tujuan; APPLIED = langsung berlaku (ke stok kantor). */
export interface AssignmentResult {
  outcome: 'PENDING' | 'APPLIED';
  assignment: Assignment | null;
}

export interface OpnameHeader {
  opnameId: number;
  officeCd: string;
  period: string;
  status: OpnameStatus;
  qtySystem: number;
  qtyFound: number;
  qtyMinus: number;
  qtyPlus: number;
  qtyChecked: number;
  createdBy: string;
  createdDt: string;
  submittedBy: string | null;
  submittedDt: string | null;
  approvedBy: string | null;
  approvedDt: string | null;
}

export interface OpnameItem {
  opnameDId: number;
  assetNo: string | null;
  assetNm: string;
  sysCategoryCd: string;
  sysUserId: string | null;
  sysOffice: string | null;
  sysStatus: AssetStatus | null;
  result: CheckResult | null;
  actualUserId: string | null;
  actualOffice: string | null;
  plusDesc: string | null;
  remark: string | null;
  checkedBy: string | null;
  checkedDt: string | null;
}

export interface OpnameDetail extends OpnameHeader {
  items: OpnameItem[];
}

export interface CheckInput {
  result: Exclude<CheckResult, 'PLUS'> | null;
  actualUserId?: string | null;
  actualOffice?: string | null;
  remark?: string | null;
}

export interface PlusInput {
  categoryCd: string;
  plusDesc: string;
  remark?: string;
}

export interface DashboardSummary {
  asOf: string;
  kpi: { total: number; inUse: number; available: number; underRepair: number; missing: number };
  byOffice: { officeCd: string; status: AssetStatus; qty: number }[];
  byCategory: { categoryCd: string; qty: number }[];
  /** Opname APPROVED terakhir per kantor; isRed = minus > 0 (BR-08) */
  lastOpname: { opnameId: number; officeCd: string; period: string; qtySystem: number; qtyFound: number; qtyMinus: number; qtyPlus: number; isRed: boolean }[];
  trend: { period: string; officeCd: string; qtyMinus: number }[];
}

export interface MinusItem {
  assetNo: string;
  assetNm: string;
  categoryCd: string;
  lastUserId: string | null;
  lastUserNm: string | null;
  remark: string | null;
}

export interface FileDownload {
  fileName: string;
  blob: Blob;
}

/** Semua operasi AMS. Implementasi: DemoApi (browser) dan HttpApi (/api/v1). */
export interface AmsApi {
  /** Modul AI: predictive maintenance, document intelligence, audit & anomaly (lihat ai-types.ts) */
  readonly ai: AiApi;

  listOffices(): Promise<Office[]>;
  listCategories(): Promise<Category[]>;
  listUsers(officeCd?: string): Promise<User[]>;

  listAssets(query: AssetQuery): Promise<Paged<Asset>>;
  getAsset(assetNo: string): Promise<AssetDetail>;
  previewAssetNo(officeCd: string, categoryCd: string): Promise<string>;
  createAsset(input: CreateAssetInput): Promise<Asset>;
  requestAssignment(assetNo: string, input: AssignmentInput): Promise<AssignmentResult>;
  cancelAssignment(assignmentId: number): Promise<void>;
  respondAssignment(assignmentId: number, accept: boolean, note?: string): Promise<void>;
  myPendingAssignments(): Promise<Assignment[]>;

  listOpnames(filter?: { officeCd?: string; status?: OpnameStatus }): Promise<OpnameHeader[]>;
  getOpname(opnameId: number): Promise<OpnameDetail>;
  createOpname(officeCd: string): Promise<OpnameHeader>;
  saveCheck(opnameId: number, assetNo: string, input: CheckInput): Promise<void>;
  markRemainingOk(opnameId: number): Promise<number>;
  addPlus(opnameId: number, input: PlusInput): Promise<void>;
  submitOpname(opnameId: number): Promise<void>;
  approveOpname(opnameId: number): Promise<void>;

  dashboardSummary(officeCd?: string): Promise<DashboardSummary>;
  minusItems(opnameId: number): Promise<MinusItem[]>;
  exportVariance(opnameId?: number): Promise<FileDownload>;
}
