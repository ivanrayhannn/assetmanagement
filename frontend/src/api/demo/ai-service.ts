import type {
  AiActivity,
  AiApi,
  AlertCategory,
  AlertNature,
  AlertStatus,
  AnomalyAlert,
  AssetDocument,
  AssetHealth,
  AssistantAnswer,
  AssistantQuestion,
  AuditCase,
  CaseStatus,
  DocStatus,
  DocType,
  ExtractedField,
  HealthClass,
  HealthFactor,
  MaintenanceRecord,
  Recommendation,
  RecommendationStatus,
  RecordRef,
  Severity,
  Urgency,
  WorkOrderStatus,
} from '../ai-types';
import { ApiError, badRequest, businessError, forbidden, notFound } from '../errors';
import type { Asset, CreateAssetInput, RoleCd, User } from '../types';
import { DOC_MODEL_VERSION, docTemplates, emptyFields, extractFromTemplate, normSerial, scanInjection } from './ai-docs';
import { type DemoDb, parseIso, toIso } from './db';

/* Aturan & versi – dicatat di setiap hasil agar bisa ditelusuri (C5, governance). Ambang = asumsi, wajib divalidasi stakeholder. */
export const HEALTH_RULE = 'RULE-HEALTH v1.0';
export const REC_RULE = 'RULE-REC v1.0';
const EXPECTED_LIFE_YEARS: Record<string, number> = { LPT: 4, MON: 5, PRN: 5, PRJ: 5, FUR: 8 };
const PM_INTERVAL_DAYS: Record<string, number> = { LPT: 365, MON: 730, PRN: 180, PRJ: 180, FUR: 730 };
const DOC_CONF_THRESHOLD = 0.8;
const DOC_CLASS_THRESHOLD = 0.75;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const COST_RATIO_THRESHOLD = 2.5;
const COST_MIN_COMPARABLES = 3;
const FREQUENT_MOVE = { count: 3, days: 90 };

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY);
const addDays = (iso: string, n: number) => toIso(new Date(parseIso(iso).getTime() + n * DAY)).slice(0, 10);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const rupiah = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const cost = (m: MaintenanceRecord) => m.partsCost + m.laborCost;
export const severityOf = (score: number): Severity => (score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW');
const classOf = (score: number): HealthClass => (score >= 80 ? 'HEALTHY' : score >= 60 ? 'MONITOR' : score >= 40 ? 'AT_RISK' : 'CRITICAL');

export class DemoAiApi implements AiApi {
  constructor(
    private readonly db: DemoDb,
    private readonly currentUserId: () => string | null,
    private readonly clock: () => Date,
    private readonly persist: () => void,
    private readonly createAsset: (input: CreateAssetInput) => Promise<Asset>,
  ) {}

  /* ------------------------------------------------------------ helpers -- */

  private me(): User {
    const u = this.db.users.find((x) => x.userId === this.currentUserId());
    if (!u) throw new ApiError(401, 'Sesi login tidak ditemukan.', 'UNAUTHENTICATED');
    return u;
  }
  private require(...roles: RoleCd[]) {
    const u = this.me();
    if (!roles.includes(u.roleCd)) throw forbidden('Peran Anda tidak memiliki akses ke fungsi ini.');
    return u;
  }
  private now() {
    return toIso(this.clock());
  }
  private asset(no: string) {
    const a = this.db.assets.find((x) => x.assetNo === no);
    if (!a) throw notFound(`Asset ${no} tidak ditemukan.`);
    return a;
  }
  private log(module: AiActivity['module'], action: string, subject: string, version: string, summary: string) {
    this.db.aiLog.push({ logId: this.db.nextId.log++, at: this.now(), actor: this.currentUserId() ?? 'SYSTEM', module, action, subject, version, summary });
  }
  private done<T>(v: T): T {
    this.persist();
    return structuredClone(v);
  }

  /* ======================================================= A. PREDICTIVE MAINTENANCE */

  /** RULE-HEALTH v1.0: skor 0–100 dari umur, kerusakan 12 bln, kondisi, inspeksi terakhir, PM terlambat. */
  computeHealth(a: Asset): AssetHealth {
    const now = this.now();
    const recs = this.db.maintenance.filter((m) => m.assetNo === a.assetNo).sort((x, y) => x.maintDt.localeCompare(y.maintDt));
    const life = EXPECTED_LIFE_YEARS[a.categoryCd] ?? 5;
    const ageYears = Math.max(0, days(a.acqDt, now) / 365.25);
    const last12 = recs.filter((m) => days(m.maintDt, now) <= 365);
    const failures = last12.filter((m) => m.maintType === 'CORRECTIVE');
    const lastPm = [...recs].reverse().find((m) => m.maintType === 'PREVENTIVE' || m.maintType === 'CORRECTIVE');
    const nextPmDueDt = addDays(lastPm?.maintDt ?? a.acqDt, PM_INTERVAL_DAYS[a.categoryCd] ?? 365);
    const pmOverdueDays = Math.max(0, days(nextPmDueDt, now));
    const base = {
      assetNo: a.assetNo, assetNm: a.assetNm, categoryCd: a.categoryCd, officeCd: a.officeCd, dataPoints: recs.length,
      ageYears: Math.round(ageYears * 10) / 10, lastMaintenanceDt: recs.at(-1)?.maintDt ?? null, nextPmDueDt, pmOverdueDays,
      failures12m: failures.length, cost12m: last12.reduce((t, m) => t + cost(m), 0), downtime12m: last12.reduce((t, m) => t + m.downtimeHours, 0),
      ruleVersion: HEALTH_RULE,
      predictionNote:
        'Probabilitas kegagalan 7/30/90 hari belum ditampilkan: belum ada model terlatih & tervalidasi. Skor ini indikator berbasis aturan, bukan prediksi.',
    };
    if (recs.length === 0)
      return { ...base, score: null, healthClass: 'INSUFFICIENT_DATA', factors: [] };

    const f: HealthFactor[] = [];
    const ageImpact = -Math.round(Math.min(ageYears / life, 1.5) * 25);
    if (ageImpact < 0) f.push({ code: 'AGE', label: 'Umur asset', impact: ageImpact, evidence: `${base.ageYears} th dari umur pakai acuan ${life} th` });
    if (failures.length)
      f.push({ code: 'FAILURE', label: 'Kerusakan 12 bulan terakhir', impact: -15 * Math.min(failures.length, 3), evidence: failures.map((m) => `${m.maintDt.slice(0, 10)} ${m.failureCd ?? m.issue}`).join('; ') });
    if (a.condition !== 'BAIK')
      f.push({ code: 'CONDITION', label: 'Kondisi tercatat', impact: a.condition === 'RUSAK_BERAT' ? -30 : -15, evidence: a.condition === 'RUSAK_BERAT' ? 'Rusak berat' : 'Rusak ringan' });
    if (a.status === 'UNDER_REPAIR') f.push({ code: 'REPAIR', label: 'Sedang dalam perbaikan', impact: -15, evidence: 'Status Under Repair' });
    const lastInsp = [...recs].reverse().find((m) => m.maintType === 'INSPECTION');
    if (lastInsp && lastInsp.inspectionResult !== 'BAIK' && !(lastPm && lastPm.maintDt > lastInsp.maintDt))
      f.push({ code: 'INSPECTION', label: 'Inspeksi terakhir', impact: lastInsp.inspectionResult === 'BURUK' ? -25 : -10, evidence: `${lastInsp.maintDt.slice(0, 10)}: ${lastInsp.issue}` });
    if (pmOverdueDays > 0) f.push({ code: 'PM_OVERDUE', label: 'Preventive maintenance terlambat', impact: -10, evidence: `Jatuh tempo ${nextPmDueDt}, terlambat ${pmOverdueDays} hari` });
    const score = Math.max(0, Math.min(100, 100 + f.reduce((t, x) => t + x.impact, 0)));
    return { ...base, score, healthClass: classOf(score), factors: f };
  }

  private canSeeOffice(me: User, officeCd: string) {
    return me.roleCd === 'ADMIN_GA' || me.roleCd === 'EXEC' || me.roleCd === 'AUDITOR' || (me.roleCd === 'PIC' && me.officeCd === officeCd);
  }

  async listHealth(filter?: { officeCd?: string; healthClass?: HealthClass }) {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    return structuredClone(
      this.db.assets
        .filter((a) => a.status !== 'MISSING' && a.status !== 'DISPOSED' && this.canSeeOffice(me, a.officeCd))
        .filter((a) => !filter?.officeCd || a.officeCd === filter.officeCd)
        .map((a) => this.computeHealth(a))
        .filter((h) => !filter?.healthClass || h.healthClass === filter.healthClass)
        .sort((x, y) => (x.score ?? 999) - (y.score ?? 999) || x.assetNo.localeCompare(y.assetNo)),
    );
  }

  async getHealth(assetNo: string) {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    const a = this.asset(assetNo);
    if (!this.canSeeOffice(me, a.officeCd)) throw forbidden();
    return structuredClone({
      ...this.computeHealth(a),
      maintenance: this.db.maintenance.filter((m) => m.assetNo === assetNo).sort((x, y) => y.maintDt.localeCompare(x.maintDt)),
      recommendations: this.db.recommendations.filter((r) => r.assetNo === assetNo).sort((x, y) => y.recId - x.recId),
      workOrders: this.db.workOrders.filter((w) => w.assetNo === assetNo).sort((x, y) => y.woId - x.woId),
    });
  }

  /** RULE-REC v1.0: rekomendasi dari faktor kesehatan; tidak membuat ganda bila masih ada yang aktif. */
  async generateRecommendations() {
    this.require('ADMIN_GA');
    const now = this.now();
    let created = 0;
    const active = (assetNo: string, type: Recommendation['recType']) =>
      this.db.recommendations.some(
        (r) =>
          r.assetNo === assetNo && r.recType === type &&
          (r.status === 'PROPOSED' || ((r.status === 'ACCEPTED' || r.status === 'MODIFIED') && this.db.workOrders.some((w) => w.woId === r.workOrderId && (w.status === 'DRAFT' || w.status === 'APPROVED')))),
      );
    for (const a of this.db.assets.filter((x) => x.status !== 'MISSING' && x.status !== 'DISPOSED')) {
      const h = this.computeHealth(a);
      if (h.healthClass === 'INSUFFICIENT_DATA') continue;
      const life = EXPECTED_LIFE_YEARS[a.categoryCd] ?? 5;
      const cands: Omit<Recommendation, 'recId' | 'assetNo' | 'status' | 'decidedBy' | 'decidedDt' | 'decisionNote' | 'workOrderId' | 'ruleVersion' | 'createdDt'>[] = [];
      const ev = h.factors.map((x) => `${x.label}: ${x.evidence} (${x.impact})`);
      if (h.healthClass === 'CRITICAL' && (h.ageYears >= 0.75 * life || h.failures12m >= 3))
        cands.push({ recType: 'REPLACEMENT', action: 'Evaluasi penggantian unit', urgency: 'HIGH', reason: `Skor ${h.score} (Kritis); umur ${h.ageYears} th dari umur pakai ${life} th, ${h.failures12m} kerusakan 12 bln.`, evidence: ev, impact: 'Mengurangi risiko gangguan kerja & biaya perbaikan berulang' });
      if (h.failures12m >= 2)
        cands.push({ recType: 'DIAGNOSIS', action: 'Diagnosa lanjutan penyebab kerusakan berulang', urgency: 'HIGH', reason: `${h.failures12m} kerusakan dalam 12 bulan terakhir.`, evidence: ev, impact: `Downtime 12 bln ${h.downtime12m} jam, biaya ${rupiah(h.cost12m)}` });
      if (h.pmOverdueDays > 0)
        cands.push({ recType: 'PREVENTIVE', action: 'Jadwalkan preventive maintenance', urgency: h.healthClass === 'AT_RISK' || h.healthClass === 'CRITICAL' ? 'HIGH' : 'MEDIUM', reason: `PM jatuh tempo ${h.nextPmDueDt}, terlambat ${h.pmOverdueDays} hari.`, evidence: ev, impact: 'Mencegah kerusakan yang bisa dihindari' });
      if (h.factors.some((x) => x.code === 'INSPECTION'))
        cands.push({ recType: 'INSPECTION', action: 'Inspeksi ulang & tindak lanjut temuan', urgency: 'MEDIUM', reason: 'Inspeksi terakhir menemukan kondisi perlu perhatian dan belum ada tindakan sesudahnya.', evidence: ev, impact: 'Memastikan temuan tidak berkembang menjadi kerusakan' });
      for (const c of cands) {
        if (active(a.assetNo, c.recType)) continue;
        this.db.recommendations.push({ ...c, recId: this.db.nextId.rec++, assetNo: a.assetNo, status: 'PROPOSED', decidedBy: null, decidedDt: null, decisionNote: null, workOrderId: null, ruleVersion: REC_RULE, createdDt: now });
        created++;
      }
    }
    this.log('PM', 'GENERATE_RECOMMENDATIONS', 'Semua asset', `${HEALTH_RULE} / ${REC_RULE}`, `${created} rekomendasi baru`);
    return this.done(created);
  }

  async listRecommendations(status?: RecommendationStatus) {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    return structuredClone(
      this.db.recommendations
        .filter((r) => (!status || r.status === status) && this.canSeeOffice(me, this.asset(r.assetNo).officeCd))
        .sort((x, y) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[x.urgency] - ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[y.urgency] || y.recId - x.recId),
    );
  }

  /** A3/A4: keputusan manusia atas rekomendasi; Accept/Modify membuat draft work order (belum terjadwal). */
  async decideRecommendation(recId: number, decision: 'ACCEPT' | 'REJECT' | 'MODIFY', input: { note?: string; action?: string; urgency?: Urgency; targetDt?: string; assignee?: string }) {
    const me = this.require('ADMIN_GA');
    const r = this.db.recommendations.find((x) => x.recId === recId);
    if (!r) throw notFound('Rekomendasi tidak ditemukan.');
    if (r.status !== 'PROPOSED') throw businessError('AI-REC', 'Rekomendasi sudah diputuskan sebelumnya.');
    const note = input.note?.trim() || null;
    if (decision !== 'ACCEPT' && !note) throw badRequest('Alasan wajib diisi untuk menolak atau mengubah rekomendasi.');
    const now = this.now();
    Object.assign(r, { status: decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'REJECT' ? 'REJECTED' : 'MODIFIED', decidedBy: me.userId, decidedDt: now, decisionNote: note });
    if (decision !== 'REJECT') {
      const urgency = input.urgency ?? r.urgency;
      const a = this.asset(r.assetNo);
      const wo = {
        woId: this.db.nextId.wo, woNo: `WO-${now.slice(0, 4)}-${String(this.db.nextId.wo++).padStart(4, '0')}`,
        assetNo: r.assetNo, recId: r.recId, issue: r.reason, action: input.action?.trim() || r.action, priority: urgency,
        targetDt: input.targetDt || addDays(now, urgency === 'HIGH' ? 7 : urgency === 'MEDIUM' ? 30 : 90),
        assignee: input.assignee?.trim() || (['LPT', 'MON'].includes(a.categoryCd) ? 'Vendor IT – PT Datacom Solusi' : ['PRN', 'PRJ'].includes(a.categoryCd) ? 'Vendor – CV Laser Prima' : 'Tim GA internal'),
        evidence: r.evidence, status: 'DRAFT' as WorkOrderStatus, createdBy: me.userId, createdDt: now,
        approvedBy: null, approvedDt: null, approvalNote: null, completedDt: null, actualCost: null, outcome: null,
      };
      this.db.workOrders.push(wo);
      r.workOrderId = wo.woId;
    }
    this.log('PM', `RECOMMENDATION_${decision}`, r.assetNo, r.ruleVersion, `${r.action}${note ? ` – ${note}` : ''}`);
    this.done(null);
  }

  async listWorkOrders(status?: WorkOrderStatus) {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    return structuredClone(this.db.workOrders.filter((w) => (!status || w.status === status) && this.canSeeOffice(me, this.asset(w.assetNo).officeCd)).sort((x, y) => y.woId - x.woId));
  }

  /** Persetujuan manajemen (EXEC) wajib sebelum WO dijadwalkan; pembuat tidak boleh menyetujui sendiri. */
  async approveWorkOrder(woId: number, approve: boolean, note?: string) {
    const me = this.require('EXEC');
    const w = this.db.workOrders.find((x) => x.woId === woId);
    if (!w) throw notFound('Work order tidak ditemukan.');
    if (w.status !== 'DRAFT') throw businessError('AI-WO', 'Hanya draft work order yang bisa disetujui/ditolak.');
    if (w.createdBy === me.userId) throw businessError('SOD', 'Pembuat work order tidak boleh menyetujui sendiri.');
    if (!approve && !note?.trim()) throw badRequest('Alasan penolakan wajib diisi.');
    Object.assign(w, { status: approve ? 'APPROVED' : 'REJECTED', approvedBy: me.userId, approvedDt: this.now(), approvalNote: note?.trim() || null });
    this.log('PM', approve ? 'WORK_ORDER_APPROVE' : 'WORK_ORDER_REJECT', w.woNo, '-', `${w.assetNo}: ${w.action}`);
    this.done(null);
  }

  /** A4: hasil aktual menjadi riwayat maintenance (memperbarui skor kesehatan). */
  async completeWorkOrder(woId: number, input: { actualCost: number; outcome: string; downtimeHours: number }) {
    const me = this.require('ADMIN_GA');
    const w = this.db.workOrders.find((x) => x.woId === woId);
    if (!w) throw notFound('Work order tidak ditemukan.');
    if (w.status !== 'APPROVED') throw businessError('AI-WO', 'Work order harus disetujui sebelum diselesaikan.');
    if (!(input.actualCost >= 0) || !(input.downtimeHours >= 0)) throw badRequest('Biaya & downtime harus angka ≥ 0.');
    if (!input.outcome?.trim()) throw badRequest('Hasil pekerjaan wajib diisi.');
    const now = this.now();
    const rec = this.db.recommendations.find((r) => r.recId === w.recId);
    const maintType = rec?.recType === 'PREVENTIVE' ? 'PREVENTIVE' : rec?.recType === 'INSPECTION' ? 'INSPECTION' : 'CORRECTIVE';
    this.db.maintenance.push({
      maintId: this.db.nextId.maint++, assetNo: w.assetNo, maintType, maintDt: now, issue: w.issue, failureCd: null, rootCause: null,
      action: `${w.action} – ${input.outcome.trim()}`, partsCost: 0, laborCost: input.actualCost, downtimeHours: input.downtimeHours,
      vendor: w.assignee, inspectionResult: maintType === 'INSPECTION' ? 'BAIK' : null, sourceDocId: null, workOrderId: w.woId, createdBy: me.userId, createdDt: now,
    });
    Object.assign(w, { status: 'COMPLETED', completedDt: now, actualCost: input.actualCost, outcome: input.outcome.trim() });
    this.log('PM', 'WORK_ORDER_COMPLETE', w.woNo, '-', `Biaya aktual ${rupiah(input.actualCost)}`);
    this.done(null);
  }

  /* ======================================================= B. DOCUMENT INTELLIGENCE */

  async docTemplates() {
    return docTemplates();
  }

  private canSeeDoc(me: User, d: AssetDocument) {
    if (me.roleCd === 'ADMIN_GA' || me.roleCd === 'EXEC' || me.roleCd === 'AUDITOR') return true;
    return me.roleCd === 'PIC' && (d.uploadedBy === me.userId || (d.linkedAssetNo !== null && this.asset(d.linkedAssetNo).officeCd === me.officeCd));
  }

  /** B4: validasi & rekonsiliasi terhadap master asset, PO, dan dokumen lain. Tidak pernah menimpa data produksi. */
  private validate(d: AssetDocument) {
    const issues: string[] = [];
    const val = (k: string) => d.fields.find((f) => f.key === k);
    const v = (k: string) => val(k)?.value ?? null;
    const flag = (k: string, status: ExtractedField['status'], message: string) => {
      const f = val(k);
      if (f && f.status !== 'NOT_FOUND' && f.status !== 'UNREADABLE') Object.assign(f, { status, message });
    };
    for (const f of d.fields) {
      f.message = null;
      if (f.value === null || f.value === '') f.status = f.status === 'UNREADABLE' && !f.edited ? 'UNREADABLE' : 'NOT_FOUND';
      else f.status = !f.edited && (f.confidence ?? 0) < DOC_CONF_THRESHOLD ? 'VERIFY' : 'OK';
      if (f.status === 'VERIFY') f.message = `Keyakinan ${Math.round((f.confidence ?? 0) * 100)}% di bawah ambang ${DOC_CONF_THRESHOLD * 100}%`;
      if (!f.mandatory && f.status === 'NOT_FOUND') f.status = 'OK';
    }
    const today = this.now().slice(0, 10);
    const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseIso(s).getTime());
    const num = (k: string) => (v(k) === null ? null : Number(String(v(k)).replace(/[^\d.-]/g, '')));
    d.linkedAssetNo = null;
    d.duplicateOfDocNo = null;

    if (d.docType === 'INVOICE') {
      for (const k of ['invoiceDt']) if (v(k) && (!isDate(v(k)) || v(k)! > today)) flag(k, 'CONFLICT', 'Tanggal tidak valid atau di masa depan');
      const qty = num('qty'), unit = num('unitPrice'), tax = num('taxAmount') ?? 0, total = num('totalAmount');
      if (qty !== null && (!Number.isInteger(qty) || qty < 1 || qty > 20)) flag('qty', 'CONFLICT', 'Jumlah harus bilangan bulat 1–20');
      if (qty !== null && unit !== null && total !== null && Math.abs(qty * unit + tax - total) > 1)
        flag('totalAmount', 'CONFLICT', `Total ${rupiah(total)} ≠ jumlah × harga + PPN (${rupiah(qty * unit + tax)})`);
      const po = this.db.purchaseOrders.find((p) => p.poNo === v('poNo'));
      if (v('poNo') && !po) flag('poNo', 'CONFLICT', 'Nomor PO tidak ditemukan di data PO');
      if (po) {
        if (v('vendor') && po.vendor !== v('vendor')) flag('vendor', 'CONFLICT', `Vendor di PO: ${po.vendor}`);
        if (qty !== null && unit !== null && Math.abs(qty * unit - po.totalAmount) > 1) flag('unitPrice', 'CONFLICT', `Nilai PO ${rupiah(po.totalAmount)} (sebelum PPN) berbeda`);
      }
      if (v('categoryCd') && !this.db.categories.some((c) => c.categoryCd === v('categoryCd'))) flag('categoryCd', 'CONFLICT', 'Kode kategori tidak dikenal');
      if (v('officeCd') && !this.db.offices.some((o) => o.officeCd === v('officeCd'))) flag('officeCd', 'CONFLICT', 'Kode kantor tidak dikenal');
      const dup = this.db.documents.find((o) => o.docId < d.docId && o.status !== 'REJECTED' && o.docType === 'INVOICE' && o.fields.find((f) => f.key === 'invoiceNo')?.value === v('invoiceNo') && o.fields.find((f) => f.key === 'vendor')?.value === v('vendor'));
      if (v('invoiceNo') && dup) {
        d.duplicateOfDocNo = dup.docNo;
        issues.push(`Kemungkinan duplikat: invoice ${v('invoiceNo')} dari ${v('vendor')} sudah ada di ${dup.docNo}.`);
      }
      const sn = v('serialNo');
      const twin = sn ? this.db.assets.find((a) => a.serialNo && normSerial(a.serialNo) === normSerial(sn)) : undefined;
      if (twin) issues.push(`Serial ${sn} identik/mirip dengan ${twin.assetNo} (serial ${twin.serialNo}). Pastikan bukan asset yang sama sebelum approve.`);
    }
    if (d.docType === 'WARRANTY') {
      const a = v('serialNo') ? this.db.assets.find((x) => x.serialNo && normSerial(x.serialNo) === normSerial(v('serialNo')!)) : undefined;
      if (v('serialNo') && !a) flag('serialNo', 'CONFLICT', 'Serial tidak ditemukan di master asset');
      if (a) {
        d.linkedAssetNo = a.assetNo;
        if (v('model') && a.brandModel && !a.brandModel.toLowerCase().includes(v('model')!.toLowerCase()) && !val('model')!.edited)
          flag('model', 'VERIFY', `Model di master: ${a.brandModel}`);
      }
      if (isDate(v('startDt')) && isDate(v('endDt')) && v('endDt')! <= v('startDt')!) flag('endDt', 'CONFLICT', 'Akhir garansi harus setelah tanggal mulai');
    }
    if (d.docType === 'MAINTENANCE_REPORT') {
      const ref = v('assetRef');
      const a = ref ? this.db.assets.find((x) => x.assetNo === ref.toUpperCase() || (x.serialNo && normSerial(x.serialNo) === normSerial(ref))) : undefined;
      if (ref && !a) flag('assetRef', 'CONFLICT', 'Nomor asset / serial tidak ditemukan di master asset');
      if (a) d.linkedAssetNo = a.assetNo;
      if (v('reportDt') && (!isDate(v('reportDt')) || v('reportDt')! > today)) flag('reportDt', 'CONFLICT', 'Tanggal tidak valid atau di masa depan');
      for (const k of ['partsCost', 'laborCost']) if (v(k) !== null && !(num(k)! >= 0)) flag(k, 'CONFLICT', 'Harus angka ≥ 0');
    }
    // duplikat hanya dibandingkan ke dokumen yang lebih dulu diunggah (yang pertama tetap sah)
    d.securityFlags = scanInjection(d.text);
    const fileDup = this.db.documents.find((o) => o.docId < d.docId && o.fileHash === d.fileHash && o.status !== 'REJECTED');
    if (fileDup) {
      d.duplicateOfDocNo ??= fileDup.docNo;
      issues.push(`File identik dengan ${fileDup.docNo} (hash sama).`);
    }
    if (d.docTypeConfidence < DOC_CLASS_THRESHOLD) issues.push(`Klasifikasi jenis dokumen hanya ${Math.round(d.docTypeConfidence * 100)}% – pilih jenis dokumen secara manual.`);
    d.issues = issues;
    if (d.status === 'APPROVED' || d.status === 'REJECTED') return;
    const ready = d.docType !== 'OTHER' && d.docTypeConfidence >= DOC_CLASS_THRESHOLD && d.securityFlags.length === 0 && !d.duplicateOfDocNo && d.fields.every((f) => f.status === 'OK');
    d.status = ready ? 'EXTRACTED' : 'NEEDS_VERIFICATION';
  }

  async uploadDocument(file: { name: string; size: number; type: string; hash: string }, templateId: string) {
    const me = this.require('ADMIN_GA', 'PIC');
    if (!ALLOWED_MIME.includes(file.type)) throw badRequest('Format tidak didukung. Gunakan PDF, JPG, atau PNG.');
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw badRequest('Ukuran file harus 1 byte – 10 MB.');
    const x = extractFromTemplate(templateId);
    if (!x) throw badRequest('Template simulasi tidak dikenal.');
    const now = this.now();
    const d: AssetDocument = {
      docId: this.db.nextId.doc, docNo: `DOC-${now.slice(0, 4)}-${String(this.db.nextId.doc++).padStart(4, '0')}`,
      fileName: file.name, fileSize: file.size, mimeType: file.type, fileHash: file.hash, docType: x.docType, docTypeConfidence: x.docTypeConfidence,
      status: 'NEEDS_VERIFICATION', text: x.text, fields: x.fields, issues: [], securityFlags: [], duplicateOfDocNo: null, linkedAssetNo: null, resultNote: null,
      uploadedBy: me.userId, uploadedDt: now, reviewedBy: null, reviewedDt: null, reviewNote: null, modelVersion: DOC_MODEL_VERSION,
    };
    this.db.documents.push(d);
    this.validate(d);
    this.log('DOC', 'EXTRACT', d.docNo, DOC_MODEL_VERSION, `${d.docType} (${Math.round(d.docTypeConfidence * 100)}%), status ${d.status}${d.securityFlags.length ? ', instruksi tersembunyi terdeteksi' : ''}`);
    return this.done(d);
  }

  async listDocuments(filter?: { status?: DocStatus; assetNo?: string }) {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    return structuredClone(
      this.db.documents
        .filter((d) => this.canSeeDoc(me, d) && (!filter?.status || d.status === filter.status) && (!filter?.assetNo || d.linkedAssetNo === filter.assetNo))
        .sort((x, y) => y.docId - x.docId),
    );
  }

  private doc(docId: number) {
    const d = this.db.documents.find((x) => x.docId === docId);
    if (!d) throw notFound('Dokumen tidak ditemukan.');
    return d;
  }

  async getDocument(docId: number) {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    const d = this.doc(docId);
    if (!this.canSeeDoc(me, d)) throw forbidden();
    return structuredClone(d);
  }

  /** B5: koreksi manual. Nilai yang disimpan reviewer ditandai edited (dianggap terverifikasi manusia). */
  async updateDocument(docId: number, input: { docType?: DocType; fields?: Record<string, string | null> }) {
    const me = this.require('ADMIN_GA', 'PIC');
    const d = this.doc(docId);
    if (!this.canSeeDoc(me, d)) throw forbidden();
    if (d.status === 'APPROVED' || d.status === 'REJECTED') throw businessError('AI-DOC', 'Dokumen yang sudah diputuskan tidak bisa diubah.');
    if (input.docType && input.docType !== d.docType) {
      d.docType = input.docType;
      d.fields = emptyFields(input.docType);
    }
    if (input.docType) d.docTypeConfidence = 1;
    for (const [k, value] of Object.entries(input.fields ?? {})) {
      const f = d.fields.find((x) => x.key === k);
      if (!f) continue;
      Object.assign(f, { value: value?.trim() || null, edited: true, confidence: null, source: f.source ?? 'input manual' });
    }
    this.validate(d);
    this.log('DOC', 'MANUAL_CORRECTION', d.docNo, '-', `${Object.keys(input.fields ?? {}).length} field dikoreksi${input.docType ? `, jenis = ${input.docType}` : ''}`);
    return this.done(d);
  }

  /** B6: setelah dikonfirmasi manusia, data masuk ke AMS lewat business rule yang sama (BR-01 dst.). */
  async reviewDocument(docId: number, approve: boolean, note?: string) {
    const me = this.require('ADMIN_GA');
    const d = this.doc(docId);
    if (d.status === 'APPROVED' || d.status === 'REJECTED') throw businessError('AI-DOC', 'Dokumen sudah diputuskan.');
    const now = this.now();
    if (!approve) {
      if (!note?.trim()) throw badRequest('Alasan penolakan wajib diisi.');
      Object.assign(d, { status: 'REJECTED', reviewedBy: me.userId, reviewedDt: now, reviewNote: note.trim() });
      this.log('DOC', 'REJECT', d.docNo, d.modelVersion, note.trim());
      return void this.done(null);
    }
    this.validate(d);
    if (d.status !== 'EXTRACTED') throw businessError('AI-DOC', 'Dokumen belum siap: selesaikan field yang perlu verifikasi, konflik, duplikat, atau peringatan keamanan.');
    const v = (k: string) => d.fields.find((f) => f.key === k)?.value ?? null;
    if (d.docType === 'INVOICE') {
      const qty = Number(v('qty'));
      const created: string[] = [];
      for (let i = 0; i < qty; i++) {
        const a = await this.createAsset({ assetNm: v('description')!, categoryCd: v('categoryCd')!, officeCd: v('officeCd')!, brandModel: v('description')!, serialNo: qty === 1 ? v('serialNo') ?? undefined : undefined, acqDt: v('invoiceDt')! });
        created.push(a.assetNo);
      }
      d.linkedAssetNo = created[0];
      d.resultNote = `Asset dibuat (status Tersedia): ${created.join(', ')}`;
    } else if (d.docType === 'WARRANTY') {
      d.resultNote = `Garansi s/d ${v('endDt')} ditautkan ke ${d.linkedAssetNo}`;
    } else if (d.docType === 'MAINTENANCE_REPORT') {
      const m: MaintenanceRecord = {
        maintId: this.db.nextId.maint++, assetNo: d.linkedAssetNo!, maintType: 'CORRECTIVE', maintDt: `${v('reportDt')}T00:00:00`, issue: v('issue')!,
        failureCd: v('failureCd'), rootCause: v('rootCause'), action: `${v('action')}${v('partsReplaced') ? ` (part: ${v('partsReplaced')})` : ''}`,
        partsCost: Number(v('partsCost')), laborCost: Number(v('laborCost')), downtimeHours: 0, vendor: v('vendor'), inspectionResult: null,
        sourceDocId: d.docId, workOrderId: null, createdBy: me.userId, createdDt: now,
      };
      this.db.maintenance.push(m);
      d.resultNote = `Riwayat perbaikan ditambahkan ke ${d.linkedAssetNo} (biaya ${rupiah(cost(m))})`;
    }
    Object.assign(d, { status: 'APPROVED', reviewedBy: me.userId, reviewedDt: now, reviewNote: note?.trim() || null });
    this.log('DOC', 'APPROVE', d.docNo, d.modelVersion, d.resultNote ?? '');
    this.done(null);
  }

  async docMetrics() {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    const docs = this.db.documents.filter((d) => this.canSeeDoc(me, d));
    const fields = docs.flatMap((d) => d.fields);
    const confs = fields.map((f) => f.confidence).filter((c): c is number => c !== null);
    const decided = docs.filter((d) => d.status === 'APPROVED').flatMap((d) => d.fields);
    const by = (s: DocStatus) => docs.filter((d) => d.status === s).length;
    return {
      total: docs.length,
      byStatus: { EXTRACTED: by('EXTRACTED'), NEEDS_VERIFICATION: by('NEEDS_VERIFICATION'), APPROVED: by('APPROVED'), REJECTED: by('REJECTED') },
      avgConfidence: confs.length ? confs.reduce((t, c) => t + c, 0) / confs.length : 0,
      correctionRate: decided.length ? decided.filter((f) => f.edited).length / decided.length : 0,
      duplicates: docs.filter((d) => d.duplicateOfDocNo).length,
      securityFlagged: docs.filter((d) => d.securityFlags.length).length,
    };
  }

  /* ======================================================= C. AUDIT & ANOMALY */

  /** Menjalankan aturan deteksi. Idempotent: alert dengan dedupKey sama tidak dibuat ulang. */
  async runDetection() {
    this.require('AUDITOR');
    const now = this.now();
    const found: Omit<AnomalyAlert, 'alertId' | 'alertNo' | 'detectedDt' | 'status' | 'caseId' | 'dismissReason' | 'severity'>[] = [];
    const assetRef = (a: Asset): RecordRef => ({ type: 'ASSET', id: a.assetNo, label: `${a.assetNo} – ${a.assetNm}` });
    const userNm = (id: string | null) => this.db.users.find((u) => u.userId === id)?.userNm ?? id ?? '–';

    // DUP-01: serial ternormalisasi sama, kategori sama (fuzzy: O/0, I/1, pemisah)
    const live = this.db.assets.filter((a) => a.status !== 'DISPOSED' && a.serialNo);
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const [a, b] = [live[i], live[j]];
        if (a.categoryCd !== b.categoryCd || normSerial(a.serialNo!) !== normSerial(b.serialNo!)) continue;
        const exact = a.serialNo === b.serialNo;
        const sameModel = (a.brandModel ?? '').toLowerCase() === (b.brandModel ?? '').toLowerCase();
        found.push({
          dedupKey: `DUP-01:${a.assetNo}:${b.assetNo}`, category: 'DUPLICATE_ASSET', nature: 'DATA_QUALITY', method: 'RULE', ruleCd: 'DUP-01', ruleVersion: 'DUP-01 v1.0',
          title: `Kemungkinan asset ganda: ${a.assetNo} & ${b.assetNo}`,
          explanation: `Serial ${a.serialNo} dan ${b.serialNo} ${exact ? 'sama persis' : 'sama setelah normalisasi (O↔0, I↔1, pemisah diabaikan)'}${sameModel ? ', model juga sama' : ''}. Bisa jadi satu barang tercatat dua kali.`,
          riskScore: exact ? 80 : sameModel ? 70 : 55,
          evidence: [
            { label: 'Serial', value: `${a.serialNo} vs ${b.serialNo}` },
            { label: 'Model', value: `${a.brandModel ?? '–'} vs ${b.brandModel ?? '–'}` },
            { label: 'Kantor', value: `${a.officeCd} vs ${b.officeCd}` },
            { label: 'Tgl perolehan', value: `${a.acqDt} vs ${b.acqDt}` },
          ],
          records: [assetRef(a), assetRef(b), ...this.db.documents.filter((d) => d.linkedAssetNo === a.assetNo || d.linkedAssetNo === b.assetNo).map((d) => ({ type: 'DOCUMENT' as const, id: d.docNo, label: `${d.docNo} ${d.fileName}` }))],
          recommendedAction: 'Cek fisik kedua nomor asset & label. Jangan menggabung/menghapus otomatis; bila terbukti ganda, ajukan disposal salah satu record lewat Admin GA.',
          officeCd: b.officeCd,
        });
      }

    // TRX-01: perpindahan terlalu sering (ambang)
    for (const a of this.db.assets) {
      const moves = this.db.history.filter((h) => h.assetNo === a.assetNo && ['ASSIGN', 'TRANSFER', 'RETURN'].includes(h.action) && days(h.createdDt, now) <= FREQUENT_MOVE.days);
      if (moves.length < FREQUENT_MOVE.count) continue;
      found.push({
        dedupKey: `TRX-01:${a.assetNo}:${moves.at(-1)!.histId}`, category: 'UNUSUAL_TRANSACTION', nature: 'STATISTICAL_ANOMALY', method: 'RULE', ruleCd: 'TRX-01', ruleVersion: 'TRX-01 v1.0',
        title: `Perpindahan asset sering: ${a.assetNo}`,
        explanation: `${moves.length} kali assign/mutasi/return dalam ${FREQUENT_MOVE.days} hari (ambang ${FREQUENT_MOVE.count}). Pola tidak biasa, belum tentu pelanggaran.`,
        riskScore: Math.min(70, 35 + 10 * (moves.length - FREQUENT_MOVE.count)),
        evidence: moves.map((h) => ({ label: h.createdDt.slice(0, 10), value: `${h.action}: ${userNm(h.fromUser)} → ${userNm(h.toUser)} (${h.fromOffice ?? '–'}→${h.toOffice ?? '–'})` })),
        records: [assetRef(a), ...moves.map((h) => ({ type: 'HISTORY' as const, id: `HIST-${h.histId}`, label: `${h.action} ${h.createdDt.slice(0, 10)}` }))],
        recommendedAction: 'Konfirmasi alasan mutasi ke Admin GA & user terkait; cek apakah ada permintaan resmi untuk setiap perpindahan.',
        officeCd: a.officeCd,
      });
    }

    // TRX-02: asset masih dipegang karyawan non-aktif (pelanggaran kebijakan offboarding)
    for (const a of this.db.assets.filter((x) => x.userId)) {
      const u = this.db.users.find((x) => x.userId === a.userId);
      if (!u || u.isActive) continue;
      found.push({
        dedupKey: `TRX-02:${a.assetNo}:${u.userId}`, category: 'UNUSUAL_TRANSACTION', nature: 'POLICY_VIOLATION', method: 'RULE', ruleCd: 'TRX-02', ruleVersion: 'TRX-02 v1.0',
        title: `Asset masih atas nama karyawan non-aktif: ${a.assetNo}`,
        explanation: `${u.userNm} sudah tidak aktif, tetapi ${a.assetNo} masih tercatat dipakai olehnya. Melanggar kebijakan penarikan asset saat offboarding.`,
        riskScore: 60,
        evidence: [{ label: 'User', value: `${u.userNm} (${u.userId}), non-aktif` }, { label: 'Status asset', value: a.status }],
        records: [assetRef(a), { type: 'USER', id: u.userId, label: u.userNm }],
        recommendedAction: 'Admin GA menarik asset & mencatat RETURN; pastikan serah terima dengan atasan karyawan.',
        officeCd: a.officeCd,
      });
    }

    // MNT-01: biaya perbaikan jauh di atas median pembanding (statistik, butuh pembanding cukup)
    const corrective = this.db.maintenance.filter((m) => m.maintType === 'CORRECTIVE');
    for (const m of corrective) {
      const a = this.asset(m.assetNo);
      const comps = corrective.filter((x) => x.maintId !== m.maintId && this.asset(x.assetNo).categoryCd === a.categoryCd);
      if (comps.length < COST_MIN_COMPARABLES) continue;
      const base = median(comps.map(cost));
      const ratio = cost(m) / base;
      if (ratio < COST_RATIO_THRESHOLD) continue;
      found.push({
        dedupKey: `MNT-01:${m.maintId}`, category: 'MAINTENANCE_COST', nature: 'STATISTICAL_ANOMALY', method: 'STATISTICAL', ruleCd: 'MNT-01', ruleVersion: 'MNT-01 v1.0',
        title: `Biaya perbaikan di atas pola: ${a.assetNo}`,
        explanation: `Biaya ${rupiah(cost(m))} = ${ratio.toFixed(1)}× median ${rupiah(base)} dari ${comps.length} perbaikan ${a.categoryCd} lain (ambang ${COST_RATIO_THRESHOLD}×). Bisa wajar bila ada penggantian part besar – perlu dicek konteksnya.`,
        riskScore: Math.min(85, Math.round(30 + ratio * 8)),
        evidence: [
          { label: 'Biaya teramati', value: `${rupiah(cost(m))} (part ${rupiah(m.partsCost)}, jasa ${rupiah(m.laborCost)})` },
          { label: 'Baseline', value: `Median ${rupiah(base)}, n=${comps.length}, kategori ${a.categoryCd}` },
          { label: 'Deviasi', value: `${ratio.toFixed(1)}×` },
          { label: 'Pekerjaan', value: `${m.issue} → ${m.action}` },
          { label: 'Vendor', value: m.vendor ?? '–' },
          { label: 'Umur asset', value: `${(days(a.acqDt, now) / 365.25).toFixed(1)} th` },
        ],
        records: [
          assetRef(a),
          { type: 'MAINTENANCE', id: `MNT-${m.maintId}`, label: `Perbaikan ${m.maintDt.slice(0, 10)}` },
          ...(m.sourceDocId ? [{ type: 'DOCUMENT' as const, id: this.db.documents.find((d) => d.docId === m.sourceDocId)?.docNo ?? '', label: 'Laporan perbaikan sumber' }] : []),
          ...comps.map((c) => ({ type: 'MAINTENANCE' as const, id: `MNT-${c.maintId}`, label: `Pembanding ${c.assetNo} ${rupiah(cost(c))}` })),
        ],
        recommendedAction: 'Minta rincian part & penawaran pembanding dari vendor; bandingkan dengan biaya penggantian unit.',
        officeCd: a.officeCd,
      });
    }

    // OPN-01/02/03: selisih stock opname (bedakan hilang terkonfirmasi vs proses belum selesai)
    for (const o of this.db.opnames) {
      const items = this.db.items.filter((i) => i.opnameId === o.opnameId);
      const opRef: RecordRef = { type: 'OPNAME', id: `OPN-${o.opnameId}`, label: `Opname ${o.officeCd} ${o.period}` };
      if (o.status === 'APPROVED') {
        for (const i of items.filter((x) => x.result === 'TIDAK_DITEMUKAN' && x.assetNo)) {
          const a = this.asset(i.assetNo!);
          if (a.status !== 'MISSING') continue;
          found.push({
            dedupKey: `OPN-01:${o.opnameId}:${a.assetNo}`, category: 'STOCK_OPNAME', nature: 'CONFIRMED_DISCREPANCY', method: 'RULE', ruleCd: 'OPN-01', ruleVersion: 'OPN-01 v1.0',
            title: `Asset hilang terkonfirmasi: ${a.assetNo}`,
            explanation: `Tidak ditemukan pada opname ${o.officeCd} ${o.period} yang sudah di-approve, dan sampai kini masih berstatus Hilang. Ini selisih terkonfirmasi, bukan bukti kecurangan.`,
            riskScore: 65,
            evidence: [{ label: 'User terakhir', value: userNm(i.sysUserId) === '–' ? 'Stok kantor' : userNm(i.sysUserId) }, { label: 'Catatan PIC', value: i.remark ?? '–' }, { label: 'Approve', value: `${o.approvedDt?.slice(0, 10)} oleh ${userNm(o.approvedBy)}` }],
            records: [assetRef(a), opRef],
            recommendedAction: 'Telusuri ke user terakhir & log peminjaman ruang/acara; buat laporan kehilangan bila tidak ditemukan dalam 30 hari.',
            officeCd: o.officeCd,
          });
        }
        for (const p of items.filter((x) => x.result === 'PLUS'))
          found.push({
            dedupKey: `OPN-02:${p.opnameDId}`, category: 'STOCK_OPNAME', nature: 'DATA_QUALITY', method: 'RULE', ruleCd: 'OPN-02', ruleVersion: 'OPN-02 v1.0',
            title: `Barang fisik belum terdaftar (${o.officeCd} ${o.period})`,
            explanation: `Temuan plus "${p.plusDesc}" ada secara fisik tetapi tidak ada di master asset.`,
            riskScore: 35,
            evidence: [{ label: 'Deskripsi', value: p.plusDesc ?? '–' }, { label: 'Catatan', value: p.remark ?? '–' }],
            records: [opRef],
            recommendedAction: 'Admin GA meregistrasi barang (dengan dokumen perolehan) atau menjelaskan asal-usulnya.',
            officeCd: o.officeCd,
          });
      }
      const unchecked = items.filter((i) => i.assetNo && i.result === null).length;
      if (o.status === 'OPEN' && unchecked > 0 && days(o.createdDt, now) > 7)
        found.push({
          dedupKey: `OPN-03:${o.opnameId}`, category: 'STOCK_OPNAME', nature: 'INCOMPLETE_PROCESS', method: 'RULE', ruleCd: 'OPN-03', ruleVersion: 'OPN-03 v1.0',
          title: `Opname belum selesai: ${o.officeCd} ${o.period}`,
          explanation: `${unchecked} asset belum dicek setelah ${days(o.createdDt, now)} hari. Asset ini BELUM bisa dianggap hilang.`,
          riskScore: 20,
          evidence: [{ label: 'Belum dicek', value: `${unchecked} dari ${items.filter((i) => i.assetNo).length}` }],
          records: [opRef],
          recommendedAction: 'Ingatkan PIC kantor untuk menyelesaikan pemeriksaan.',
          officeCd: o.officeCd,
        });
    }

    let created = 0;
    for (const f of found) {
      if (this.db.alerts.some((x) => x.dedupKey === f.dedupKey)) continue;
      const id = this.db.nextId.alert++;
      this.db.alerts.push({ ...f, alertId: id, alertNo: `ALR-${now.slice(0, 4)}-${String(id).padStart(4, '0')}`, severity: severityOf(f.riskScore), detectedDt: now, status: 'OPEN', caseId: null, dismissReason: null });
      created++;
    }
    this.log('AUDIT', 'RUN_DETECTION', 'Semua data', 'DUP-01, TRX-01, TRX-02, MNT-01, OPN-01..03 v1.0', `${found.length} temuan, ${created} alert baru`);
    return this.done({ created, total: this.db.alerts.length });
  }

  async listAlerts(filter?: { category?: AlertCategory; status?: AlertStatus }) {
    this.require('AUDITOR', 'EXEC');
    return structuredClone(
      this.db.alerts.filter((a) => (!filter?.category || a.category === filter.category) && (!filter?.status || a.status === filter.status)).sort((x, y) => y.riskScore - x.riskScore || y.alertId - x.alertId),
    );
  }

  private alert(id: number) {
    const a = this.db.alerts.find((x) => x.alertId === id);
    if (!a) throw notFound('Alert tidak ditemukan.');
    return a;
  }

  async getAlert(alertId: number) {
    this.require('AUDITOR', 'EXEC');
    const a = this.alert(alertId);
    this.log('AUDIT', 'VIEW_EVIDENCE', a.alertNo, a.ruleVersion, 'Bukti alert dibuka');
    return this.done(a);
  }

  async dismissAlert(alertId: number, reason: string) {
    this.require('AUDITOR');
    const a = this.alert(alertId);
    if (a.status !== 'OPEN') throw businessError('AI-AUD', 'Hanya alert berstatus Open yang bisa di-dismiss.');
    if (!reason?.trim()) throw badRequest('Alasan dismiss / false positive wajib diisi.');
    Object.assign(a, { status: 'DISMISSED', dismissReason: reason.trim() });
    this.log('AUDIT', 'DISMISS_ALERT', a.alertNo, a.ruleVersion, reason.trim());
    this.done(null);
  }

  async createCase(alertId: number, investigator: string) {
    const me = this.require('AUDITOR');
    const a = this.alert(alertId);
    if (a.status !== 'OPEN') throw businessError('AI-AUD', 'Alert sudah masuk kasus atau di-dismiss.');
    if (this.db.users.find((u) => u.userId === investigator)?.roleCd !== 'AUDITOR') throw badRequest('Investigator harus berperan Internal Auditor.');
    const now = this.now();
    const c: AuditCase = {
      caseId: this.db.nextId.caseId, caseNo: `CASE-${now.slice(0, 4)}-${String(this.db.nextId.caseId++).padStart(4, '0')}`, alertIds: [alertId], title: a.title,
      status: 'NEW', investigator, notes: [{ at: now, by: me.userId, text: `Kasus dibuat dari ${a.alertNo}.`, kind: 'STATUS' }], actions: [], createdBy: me.userId, createdDt: now, closedDt: null,
    };
    this.db.cases.push(c);
    Object.assign(a, { status: 'IN_CASE', caseId: c.caseId });
    this.log('AUDIT', 'CREATE_CASE', c.caseNo, '-', a.title);
    return this.done(c);
  }

  async listCases() {
    this.require('AUDITOR', 'EXEC');
    return structuredClone([...this.db.cases].sort((x, y) => y.caseId - x.caseId));
  }

  private case(id: number) {
    const c = this.db.cases.find((x) => x.caseId === id);
    if (!c) throw notFound('Kasus tidak ditemukan.');
    return c;
  }

  async getCase(caseId: number) {
    this.require('AUDITOR', 'EXEC');
    const c = this.case(caseId);
    return structuredClone({ ...c, alerts: this.db.alerts.filter((a) => c.alertIds.includes(a.alertId)) });
  }

  /** C7: perubahan status selalu dengan jejak; keputusan konsekuensial wajib beralasan & tidak otomatis. */
  async updateCase(caseId: number, input: { status?: CaseStatus; note?: string; noteKind?: 'FINDING' | 'CLARIFICATION' }) {
    const me = this.require('AUDITOR');
    const c = this.case(caseId);
    if (c.status === 'CLOSED') throw businessError('AI-AUD', 'Kasus sudah ditutup.');
    const note = input.note?.trim();
    const now = this.now();
    if (input.status && input.status !== c.status) {
      if (['FALSE_POSITIVE', 'ESCALATED', 'CLOSED', 'CONFIRMED'].includes(input.status) && !note) throw badRequest('Status ini wajib disertai alasan / temuan.');
      if (input.status === 'CLOSED' && c.actions.some((x) => x.status === 'OPEN')) throw businessError('AI-AUD', 'Masih ada tindakan korektif terbuka.');
      c.status = input.status;
      if (input.status === 'CLOSED' || input.status === 'FALSE_POSITIVE') c.closedDt = now;
      if (input.status === 'FALSE_POSITIVE')
        this.db.alerts.filter((a) => c.alertIds.includes(a.alertId)).forEach((a) => Object.assign(a, { status: 'DISMISSED', dismissReason: `False positive (${c.caseNo}): ${note}` }));
      c.notes.push({ at: now, by: me.userId, text: `Status → ${input.status}${note ? `: ${note}` : ''}`, kind: 'STATUS' });
    } else if (note) c.notes.push({ at: now, by: me.userId, text: note, kind: input.noteKind ?? 'FINDING' });
    else throw badRequest('Isi catatan atau pilih status baru.');
    this.log('AUDIT', 'UPDATE_CASE', c.caseNo, '-', input.status ?? input.noteKind ?? 'FINDING');
    this.done(null);
  }

  async addCorrectiveAction(caseId: number, input: { description: string; ownerUserId: string; dueDt: string }) {
    this.require('AUDITOR');
    const c = this.case(caseId);
    if (!input.description?.trim()) throw badRequest('Deskripsi tindakan wajib diisi.');
    if (!this.db.users.some((u) => u.userId === input.ownerUserId && u.isActive)) throw badRequest('Penanggung jawab tidak valid.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDt)) throw badRequest('Tenggat wajib diisi.');
    c.actions.push({ actionId: this.db.nextId.action++, description: input.description.trim(), ownerUserId: input.ownerUserId, dueDt: input.dueDt, status: 'OPEN', doneDt: null });
    if (c.status === 'CONFIRMED') c.status = 'REMEDIATION';
    this.done(null);
  }

  async completeCorrectiveAction(caseId: number, actionId: number) {
    this.require('AUDITOR');
    const x = this.case(caseId).actions.find((y) => y.actionId === actionId);
    if (!x) throw notFound('Tindakan tidak ditemukan.');
    Object.assign(x, { status: 'DONE', doneDt: this.now() });
    this.done(null);
  }

  /** C6: asisten investigasi berbasis template – menyitir record sumber; fakta & hipotesis dipisah. Bukan LLM. */
  async ask(alertId: number, q: AssistantQuestion): Promise<AssistantAnswer> {
    this.require('AUDITOR', 'EXEC');
    const a = this.alert(alertId);
    const c = a.caseId ? this.db.cases.find((x) => x.caseId === a.caseId) : undefined;
    const engine = 'Asisten investigasi simulasi v0.1 (template + data AMS, bukan LLM)';
    const QUESTIONS: Record<AssistantQuestion, string> = {
      WHY: 'Kenapa transaksi ini ditandai?', RECORDS: 'Record apa yang mendukung temuan?', SIMILAR: 'Apakah ada kasus serupa?',
      EVIDENCE_NEEDED: 'Bukti tambahan apa yang dibutuhkan?', NEXT_STEP: 'Apa yang perlu dicek berikutnya?', OPEN_ACTIONS: 'Tindakan korektif apa yang masih terbuka?',
    };
    const NEED: Record<AlertCategory, string[]> = {
      DUPLICATE_ASSET: ['Foto label & serial fisik kedua asset', 'Dokumen perolehan (invoice/PO) masing-masing', 'Konfirmasi PIC kantor terkait'],
      UNUSUAL_TRANSACTION: ['Permintaan/approval tertulis untuk setiap perpindahan', 'Konfirmasi user & atasan', 'Data HR status karyawan'],
      MAINTENANCE_COST: ['Rincian part & jasa dari vendor', 'Penawaran pembanding dari vendor lain', 'Foto/berita acara part yang diganti'],
      STOCK_OPNAME: ['Pernyataan user terakhir', 'Log peminjaman ruang/acara', 'Rekaman CCTV bila tersedia'],
    };
    const HYP: Record<AlertNature, string[]> = {
      DATA_QUALITY: ['Kemungkinan salah input/duplikasi saat registrasi (belum terverifikasi).'],
      STATISTICAL_ANOMALY: ['Bisa wajar bila ada kebutuhan operasional khusus; belum ada indikasi pelanggaran.'],
      POLICY_VIOLATION: ['Kemungkinan proses offboarding tidak memicu penarikan asset (belum terverifikasi).'],
      INCOMPLETE_PROCESS: ['Kemungkinan PIC belum sempat menyelesaikan pemeriksaan.'],
      CONFIRMED_DISCREPANCY: ['Asset bisa terselip/dipinjam; kehilangan bukan berarti kecurangan sampai ada bukti.'],
    };
    let facts: AssistantAnswer['facts'] = [];
    let hypotheses: string[] = [];
    switch (q) {
      case 'WHY':
        facts = [{ text: `${a.explanation} (aturan ${a.ruleVersion}, metode ${a.method === 'RULE' ? 'aturan' : 'statistik'}, skor risiko ${a.riskScore} – bukan probabilitas).`, refs: a.records.slice(0, 2) }, ...a.evidence.map((e) => ({ text: `${e.label}: ${e.value}`, refs: [] }))];
        hypotheses = HYP[a.nature];
        break;
      case 'RECORDS':
        facts = a.records.map((r) => ({ text: `${r.type}: ${r.label}`, refs: [r] }));
        break;
      case 'SIMILAR': {
        const sim = this.db.alerts.filter((x) => x.alertId !== a.alertId && (x.ruleCd === a.ruleCd || x.records.some((r) => r.type === 'ASSET' && a.records.some((s) => s.id === r.id))));
        facts = sim.length ? sim.map((x) => ({ text: `${x.alertNo} (${x.status}${x.dismissReason ? `, ${x.dismissReason}` : ''}): ${x.title}`, refs: x.records.slice(0, 1) })) : [{ text: 'Tidak ada alert lain dengan aturan atau asset yang sama.', refs: [] }];
        break;
      }
      case 'EVIDENCE_NEEDED':
        facts = [{ text: 'Bukti yang sudah ada: ' + a.evidence.map((e) => e.label).join(', '), refs: a.records }];
        hypotheses = NEED[a.category].map((n) => `Perlu dikumpulkan: ${n}`);
        break;
      case 'NEXT_STEP':
        facts = [{ text: `Rekomendasi aturan: ${a.recommendedAction}`, refs: [] }, { text: c ? `Status kasus ${c.caseNo}: ${c.status}` : 'Alert belum dijadikan kasus.', refs: [] }];
        break;
      case 'OPEN_ACTIONS':
        facts = c ? (c.actions.filter((x) => x.status === 'OPEN').map((x) => ({ text: `${x.description} – PJ ${this.db.users.find((u) => u.userId === x.ownerUserId)?.userNm}, tenggat ${x.dueDt}`, refs: [] })) as AssistantAnswer['facts']) : [];
        if (!facts.length) facts = [{ text: c ? 'Tidak ada tindakan korektif terbuka.' : 'Belum ada kasus untuk alert ini.', refs: [] }];
        break;
    }
    this.log('AUDIT', 'ASSISTANT_QUERY', a.alertNo, engine, QUESTIONS[q]);
    return this.done({ question: QUESTIONS[q], facts, hypotheses, engine });
  }

  async activity(module?: AiActivity['module']) {
    this.require('ADMIN_GA', 'EXEC', 'AUDITOR');
    return structuredClone(this.db.aiLog.filter((l) => !module || l.module === module).sort((x, y) => y.logId - x.logId).slice(0, 100));
  }
}

