/*
 * Kontrak modul AI (versi simulasi sederhana). Lihat docs/AI-AMS-Spec.md.
 * Semua skor & deteksi di demo berbasis ATURAN/STATISTIK SEDERHANA yang transparan (bukan model ML tervalidasi,
 * bukan LLM, bukan OCR). Setiap hasil membawa ruleVersion/modelVersion agar bisa diaudit.
 */

/* ------------------------------------------------- Modul A: Predictive Maintenance */

export type HealthClass = 'HEALTHY' | 'MONITOR' | 'AT_RISK' | 'CRITICAL' | 'INSUFFICIENT_DATA';
export type MaintenanceType = 'PREVENTIVE' | 'CORRECTIVE' | 'INSPECTION';
export type InspectionResult = 'BAIK' | 'PERLU_PERHATIAN' | 'BURUK';

export interface MaintenanceRecord {
  maintId: number;
  assetNo: string;
  maintType: MaintenanceType;
  maintDt: string;
  issue: string;
  failureCd: string | null;
  rootCause: string | null;
  action: string;
  partsCost: number;
  laborCost: number;
  downtimeHours: number;
  vendor: string | null;
  inspectionResult: InspectionResult | null;
  sourceDocId: number | null;
  workOrderId: number | null;
  createdBy: string;
  createdDt: string;
}

export interface HealthFactor {
  code: string;
  label: string;
  /** Pengurang skor (negatif) */
  impact: number;
  evidence: string;
}

export interface AssetHealth {
  assetNo: string;
  assetNm: string;
  categoryCd: string;
  officeCd: string;
  /** null bila data belum cukup */
  score: number | null;
  healthClass: HealthClass;
  factors: HealthFactor[];
  dataPoints: number;
  ageYears: number;
  lastMaintenanceDt: string | null;
  nextPmDueDt: string | null;
  pmOverdueDays: number;
  failures12m: number;
  cost12m: number;
  downtime12m: number;
  ruleVersion: string;
  /** Prediksi probabilitas kegagalan sengaja tidak ditampilkan sampai ada model tervalidasi. */
  predictionNote: string;
}

export type RecommendationType = 'INSPECTION' | 'PREVENTIVE' | 'DIAGNOSIS' | 'REPLACEMENT';
export type RecommendationStatus = 'PROPOSED' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED';
export type Urgency = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Recommendation {
  recId: number;
  assetNo: string;
  recType: RecommendationType;
  action: string;
  reason: string;
  evidence: string[];
  urgency: Urgency;
  impact: string;
  status: RecommendationStatus;
  decidedBy: string | null;
  decidedDt: string | null;
  decisionNote: string | null;
  workOrderId: number | null;
  ruleVersion: string;
  createdDt: string;
}

export type WorkOrderStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export interface WorkOrder {
  woId: number;
  woNo: string;
  assetNo: string;
  recId: number | null;
  issue: string;
  action: string;
  priority: Urgency;
  targetDt: string;
  assignee: string;
  evidence: string[];
  status: WorkOrderStatus;
  createdBy: string;
  createdDt: string;
  approvedBy: string | null;
  approvedDt: string | null;
  approvalNote: string | null;
  completedDt: string | null;
  actualCost: number | null;
  outcome: string | null;
}

/* ------------------------------------------------- Modul B: Document Intelligence */

export type DocType = 'INVOICE' | 'WARRANTY' | 'MAINTENANCE_REPORT' | 'OTHER';
export type DocStatus = 'EXTRACTED' | 'NEEDS_VERIFICATION' | 'APPROVED' | 'REJECTED';
/** OK, atau: tidak ditemukan / tidak terbaca / bertentangan / perlu verifikasi (B5). */
export type FieldStatus = 'OK' | 'NOT_FOUND' | 'UNREADABLE' | 'CONFLICT' | 'VERIFY';

export interface ExtractedField {
  key: string;
  label: string;
  value: string | null;
  confidence: number | null;
  /** Lokasi sumber di dokumen, mis. "hal. 1, baris 3" */
  source: string | null;
  status: FieldStatus;
  message: string | null;
  mandatory: boolean;
  edited: boolean;
}

export interface AssetDocument {
  docId: number;
  docNo: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  docType: DocType;
  docTypeConfidence: number;
  status: DocStatus;
  /** Teks hasil "OCR" (simulasi) untuk pratinjau */
  text: string;
  fields: ExtractedField[];
  issues: string[];
  /** Instruksi tersembunyi / konten mencurigakan di dokumen – tidak pernah dieksekusi */
  securityFlags: string[];
  duplicateOfDocNo: string | null;
  linkedAssetNo: string | null;
  resultNote: string | null;
  uploadedBy: string;
  uploadedDt: string;
  reviewedBy: string | null;
  reviewedDt: string | null;
  reviewNote: string | null;
  modelVersion: string;
}

export interface DocTemplate {
  templateId: string;
  label: string;
  docType: DocType;
}

export interface DocMetrics {
  total: number;
  byStatus: Record<DocStatus, number>;
  avgConfidence: number;
  correctionRate: number;
  duplicates: number;
  securityFlagged: number;
}

/* ------------------------------------------------- Modul C: Audit & Anomaly */

export type AlertCategory = 'DUPLICATE_ASSET' | 'UNUSUAL_TRANSACTION' | 'MAINTENANCE_COST' | 'STOCK_OPNAME';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DetectionMethod = 'RULE' | 'STATISTICAL';
export type AlertNature = 'POLICY_VIOLATION' | 'STATISTICAL_ANOMALY' | 'DATA_QUALITY' | 'INCOMPLETE_PROCESS' | 'CONFIRMED_DISCREPANCY';
export type AlertStatus = 'OPEN' | 'IN_CASE' | 'DISMISSED';

export interface RecordRef {
  type: 'ASSET' | 'HISTORY' | 'MAINTENANCE' | 'OPNAME' | 'DOCUMENT' | 'USER';
  id: string;
  label: string;
}

export interface AnomalyAlert {
  alertId: number;
  alertNo: string;
  dedupKey: string;
  category: AlertCategory;
  nature: AlertNature;
  title: string;
  explanation: string;
  method: DetectionMethod;
  ruleCd: string;
  ruleVersion: string;
  /** Skor risiko berbasis aturan 0–100, BUKAN probabilitas */
  riskScore: number;
  severity: Severity;
  evidence: { label: string; value: string }[];
  records: RecordRef[];
  recommendedAction: string;
  officeCd: string | null;
  detectedDt: string;
  status: AlertStatus;
  caseId: number | null;
  dismissReason: string | null;
}

export type CaseStatus = 'NEW' | 'UNDER_REVIEW' | 'CONFIRMED' | 'FALSE_POSITIVE' | 'REMEDIATION' | 'ESCALATED' | 'CLOSED';

export interface CorrectiveAction {
  actionId: number;
  description: string;
  ownerUserId: string;
  dueDt: string;
  status: 'OPEN' | 'DONE';
  doneDt: string | null;
}

export interface AuditCase {
  caseId: number;
  caseNo: string;
  alertIds: number[];
  title: string;
  status: CaseStatus;
  investigator: string;
  notes: { at: string; by: string; text: string; kind: 'FINDING' | 'STATUS' | 'CLARIFICATION' }[];
  actions: CorrectiveAction[];
  createdBy: string;
  createdDt: string;
  closedDt: string | null;
}

export type AssistantQuestion = 'WHY' | 'RECORDS' | 'SIMILAR' | 'EVIDENCE_NEEDED' | 'NEXT_STEP' | 'OPEN_ACTIONS';

export interface AssistantAnswer {
  question: string;
  facts: { text: string; refs: RecordRef[] }[];
  hypotheses: string[];
  engine: string;
}

export interface AiActivity {
  logId: number;
  at: string;
  actor: string;
  module: 'PM' | 'DOC' | 'AUDIT';
  action: string;
  subject: string;
  version: string;
  summary: string;
}

export interface AiApi {
  /* A */
  listHealth(filter?: { officeCd?: string; healthClass?: HealthClass }): Promise<AssetHealth[]>;
  getHealth(assetNo: string): Promise<AssetHealth & { maintenance: MaintenanceRecord[]; recommendations: Recommendation[]; workOrders: WorkOrder[] }>;
  generateRecommendations(): Promise<number>;
  listRecommendations(status?: RecommendationStatus): Promise<Recommendation[]>;
  decideRecommendation(recId: number, decision: 'ACCEPT' | 'REJECT' | 'MODIFY', input: { note?: string; action?: string; urgency?: Urgency; targetDt?: string; assignee?: string }): Promise<void>;
  listWorkOrders(status?: WorkOrderStatus): Promise<WorkOrder[]>;
  approveWorkOrder(woId: number, approve: boolean, note?: string): Promise<void>;
  completeWorkOrder(woId: number, input: { actualCost: number; outcome: string; downtimeHours: number }): Promise<void>;
  /* B */
  docTemplates(): Promise<DocTemplate[]>;
  uploadDocument(file: { name: string; size: number; type: string; hash: string }, templateId: string): Promise<AssetDocument>;
  listDocuments(filter?: { status?: DocStatus; assetNo?: string }): Promise<AssetDocument[]>;
  getDocument(docId: number): Promise<AssetDocument>;
  updateDocument(docId: number, input: { docType?: DocType; fields?: Record<string, string | null> }): Promise<AssetDocument>;
  reviewDocument(docId: number, approve: boolean, note?: string): Promise<void>;
  docMetrics(): Promise<DocMetrics>;
  /* C */
  runDetection(): Promise<{ created: number; total: number }>;
  listAlerts(filter?: { category?: AlertCategory; status?: AlertStatus }): Promise<AnomalyAlert[]>;
  getAlert(alertId: number): Promise<AnomalyAlert>;
  dismissAlert(alertId: number, reason: string): Promise<void>;
  createCase(alertId: number, investigator: string): Promise<AuditCase>;
  listCases(): Promise<AuditCase[]>;
  getCase(caseId: number): Promise<AuditCase & { alerts: AnomalyAlert[] }>;
  updateCase(caseId: number, input: { status?: CaseStatus; note?: string; noteKind?: 'FINDING' | 'CLARIFICATION' }): Promise<void>;
  addCorrectiveAction(caseId: number, input: { description: string; ownerUserId: string; dueDt: string }): Promise<void>;
  completeCorrectiveAction(caseId: number, actionId: number): Promise<void>;
  ask(alertId: number, q: AssistantQuestion): Promise<AssistantAnswer>;
  activity(module?: AiActivity['module']): Promise<AiActivity[]>;
}
