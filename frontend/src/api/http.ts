import type { AiApi, AlertCategory, AlertStatus, AssistantQuestion, CaseStatus, DocStatus, DocType, HealthClass, RecommendationStatus, Urgency, WorkOrderStatus } from './ai-types';
import { ApiError } from './errors';
import type {
  AmsApi,
  Asset,
  AssetDetail,
  AssetQuery,
  Assignment,
  AssignmentInput,
  AssignmentResult,
  Category,
  CheckInput,
  CreateAssetInput,
  DashboardSummary,
  FileDownload,
  MinusItem,
  OpnameDetail,
  OpnameHeader,
  OpnameStatus,
  Office,
  Paged,
  PlusInput,
  User,
} from './types';

/**
 * Klien AMS API (.NET 8) – kontrak endpoint untuk langkah 3, lihat frontend/README.md.
 * Auth: header Authorization (SSO) atau X-Ams-Mock-User (mock, hanya environment non-produksi).
 */
export class HttpApi implements AmsApi {
  readonly ai: AiApi;

  constructor(
    private readonly baseUrl: string,
    private readonly authHeaders: () => Promise<Record<string, string>>,
  ) {
    this.ai = httpAi((m, p, b) => this.json(m, p, b), (p) => this.qs(p));
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await this.authHeaders()) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    if (!res.ok) {
      let problem: { title?: string; detail?: string; code?: string } = {};
      try {
        problem = await res.json();
      } catch {
        /* bukan JSON */
      }
      throw new ApiError(res.status, problem.detail ?? problem.title ?? `Permintaan gagal (${res.status}).`, problem.code);
    }
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.send(method, path, body);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  private qs(params: Record<string, string | number | undefined>) {
    const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
    return p.length ? '?' + new URLSearchParams(p.map(([k, v]) => [k, String(v)])).toString() : '';
  }

  listOffices = () => this.json<Office[]>('GET', '/offices');
  listCategories = () => this.json<Category[]>('GET', '/categories');
  listUsers = (officeCd?: string) => this.json<User[]>('GET', `/users${this.qs({ office: officeCd })}`);

  listAssets = (q: AssetQuery) =>
    this.json<Paged<Asset>>('GET', `/assets${this.qs({ office: q.office, cat: q.cat, status: q.status, q: q.q, page: q.page, pageSize: q.pageSize })}`);
  getAsset = (assetNo: string) => this.json<AssetDetail>('GET', `/assets/${encodeURIComponent(assetNo)}`);
  previewAssetNo = async (officeCd: string, categoryCd: string) =>
    (await this.json<{ assetNo: string }>('GET', `/assets/next-no${this.qs({ office: officeCd, cat: categoryCd })}`)).assetNo;
  createAsset = (input: CreateAssetInput) => this.json<Asset>('POST', '/assets', input);
  requestAssignment = (assetNo: string, input: AssignmentInput) =>
    this.json<AssignmentResult>('POST', `/assets/${encodeURIComponent(assetNo)}/assignments`, input);
  cancelAssignment = (id: number) => this.json<void>('POST', `/assignments/${id}/cancel`);
  respondAssignment = (id: number, accept: boolean, note?: string) =>
    this.json<void>('POST', `/assignments/${id}/${accept ? 'confirm' : 'reject'}`, { note });
  myPendingAssignments = () => this.json<Assignment[]>('GET', '/assignments/mine');

  listOpnames = (f?: { officeCd?: string; status?: OpnameStatus }) =>
    this.json<OpnameHeader[]>('GET', `/opnames${this.qs({ office: f?.officeCd, status: f?.status })}`);
  getOpname = (id: number) => this.json<OpnameDetail>('GET', `/opnames/${id}`);
  createOpname = (officeCd: string) => this.json<OpnameHeader>('POST', '/opnames', { officeCd });
  saveCheck = (id: number, assetNo: string, input: CheckInput) =>
    this.json<void>('PUT', `/opnames/${id}/items/${encodeURIComponent(assetNo)}`, input);
  markRemainingOk = async (id: number) => (await this.json<{ updated: number }>('POST', `/opnames/${id}/items/mark-remaining-ok`)).updated;
  addPlus = (id: number, input: PlusInput) => this.json<void>('POST', `/opnames/${id}/plus`, input);
  submitOpname = (id: number) => this.json<void>('POST', `/opnames/${id}/submit`);
  approveOpname = (id: number) => this.json<void>('POST', `/opnames/${id}/approve`);

  dashboardSummary = (officeCd?: string) => this.json<DashboardSummary>('GET', `/dashboard/summary${this.qs({ office: officeCd })}`);
  minusItems = (id: number) => this.json<MinusItem[]>('GET', `/reports/variance/${id}/minus`);
  exportVariance = async (opnameId?: number): Promise<FileDownload> => {
    const res = await this.send('GET', `/reports/variance${this.qs({ opnameId, format: 'xlsx' })}`);
    const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'laporan-selisih.xlsx';
    return { fileName: name, blob: await res.blob() };
  };
}

/** Endpoint modul AI (/api/v1/ai/...) – usulan kontrak, lihat docs/AI-AMS-Spec.md §10. */
function httpAi(
  json: <T>(method: string, path: string, body?: unknown) => Promise<T>,
  qs: (p: Record<string, string | number | undefined>) => string,
): AiApi {
  return {
    listHealth: (f?: { officeCd?: string; healthClass?: HealthClass }) => json('GET', `/ai/health${qs({ office: f?.officeCd, class: f?.healthClass })}`),
    getHealth: (assetNo: string) => json('GET', `/ai/health/${encodeURIComponent(assetNo)}`),
    generateRecommendations: async () => (await json<{ created: number }>('POST', '/ai/recommendations/generate')).created,
    listRecommendations: (status?: RecommendationStatus) => json('GET', `/ai/recommendations${qs({ status })}`),
    decideRecommendation: (id: number, decision: 'ACCEPT' | 'REJECT' | 'MODIFY', input: { note?: string; action?: string; urgency?: Urgency; targetDt?: string; assignee?: string }) =>
      json('POST', `/ai/recommendations/${id}/decision`, { decision, ...input }),
    listWorkOrders: (status?: WorkOrderStatus) => json('GET', `/work-orders${qs({ status })}`),
    approveWorkOrder: (id: number, approve: boolean, note?: string) => json('POST', `/work-orders/${id}/${approve ? 'approve' : 'reject'}`, { note }),
    completeWorkOrder: (id: number, input: { actualCost: number; outcome: string; downtimeHours: number }) => json('POST', `/work-orders/${id}/complete`, input),
    docTemplates: async () => [],
    uploadDocument: (file: { name: string; size: number; type: string; hash: string }) => json('POST', '/documents', file), // produksi: multipart + Idempotency-Key = hash
    listDocuments: (f?: { status?: DocStatus; assetNo?: string }) => json('GET', `/documents${qs({ status: f?.status, assetNo: f?.assetNo })}`),
    getDocument: (id: number) => json('GET', `/documents/${id}`),
    updateDocument: (id: number, input: { docType?: DocType; fields?: Record<string, string | null> }) => json('PATCH', `/documents/${id}`, input),
    reviewDocument: (id: number, approve: boolean, note?: string) => json('POST', `/documents/${id}/${approve ? 'approve' : 'reject'}`, { note }),
    docMetrics: () => json('GET', '/documents/metrics'),
    runDetection: () => json('POST', '/audit/detections/run'),
    listAlerts: (f?: { category?: AlertCategory; status?: AlertStatus }) => json('GET', `/audit/alerts${qs({ category: f?.category, status: f?.status })}`),
    getAlert: (id: number) => json('GET', `/audit/alerts/${id}`),
    dismissAlert: (id: number, reason: string) => json('POST', `/audit/alerts/${id}/dismiss`, { reason }),
    createCase: (alertId: number, investigator: string) => json('POST', '/audit/cases', { alertId, investigator }),
    listCases: () => json('GET', '/audit/cases'),
    getCase: (id: number) => json('GET', `/audit/cases/${id}`),
    updateCase: (id: number, input: { status?: CaseStatus; note?: string; noteKind?: 'FINDING' | 'CLARIFICATION' }) => json('PATCH', `/audit/cases/${id}`, input),
    addCorrectiveAction: (id: number, input: { description: string; ownerUserId: string; dueDt: string }) => json('POST', `/audit/cases/${id}/actions`, input),
    completeCorrectiveAction: (id: number, actionId: number) => json('POST', `/audit/cases/${id}/actions/${actionId}/complete`),
    ask: (alertId: number, q: AssistantQuestion) => json('POST', `/audit/alerts/${alertId}/assistant`, { question: q }),
    activity: (module?: 'PM' | 'DOC' | 'AUDIT') => json('GET', `/ai/activity${qs({ module })}`),
  };
}
