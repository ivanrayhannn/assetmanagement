import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import type { DemoDb } from './db';
import { buildSeed } from './seed';
import { DemoApi } from './service';

/* Test modul AI (simulasi): aturan, guardrail, human-in-the-loop, SoD, dan idempotensi. ID test mengacu docs/AI-AMS-Spec.md. */

let db: DemoDb;
let actor: string;
let now: Date;
let api: DemoApi;
const as = (u: string) => ((actor = u), api.ai);

beforeEach(async () => {
  db = await buildSeed();
  now = new Date(2026, 9, 29, 9, 0, 0);
  actor = 'EMP001';
  api = new DemoApi(db, () => actor, () => now);
});

const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  return (e as ApiError).code;
};

describe('A. Predictive maintenance', () => {
  it('AI-PM-01: skor kesehatan & faktor dihitung dari data; tanpa riwayat = data belum cukup', async () => {
    const list = await as('EMP001').listHealth();
    const lpt2 = list.find((h) => h.assetNo === 'AST-JKT-LPT-2024-0002')!;
    expect(lpt2.healthClass).toBe('CRITICAL');
    expect(lpt2.factors.map((f) => f.code)).toEqual(expect.arrayContaining(['AGE', 'FAILURE', 'INSPECTION']));
    expect(lpt2.score).toBe(100 + lpt2.factors.reduce((t, f) => t + f.impact, 0));
    const noData = list.find((h) => h.assetNo === 'AST-JKT-LPT-2025-0001')!;
    expect(noData).toMatchObject({ healthClass: 'INSUFFICIENT_DATA', score: null });
    expect(list.some((h) => h.assetNo === 'AST-JKT-PRJ-2025-0001')).toBe(false); // asset Hilang tidak dimonitor
  });

  it('AI-PM-02: tidak ada probabilitas kegagalan tanpa model tervalidasi', async () => {
    const h = await as('EMP005').getHealth('AST-JKT-LPT-2024-0002');
    expect(h.predictionNote).toMatch(/belum ada model/);
    expect(Object.keys(h)).not.toContain('failureProbability');
  });

  it('AI-PM-03: generate rekomendasi idempotent (tidak membuat ganda)', async () => {
    expect(await as('EMP001').generateRecommendations()).toBe(0);
  });

  it('AI-PM-04: tolak rekomendasi wajib alasan; terima membuat draft WO', async () => {
    const r = (await as('EMP001').listRecommendations('PROPOSED'))[0];
    expect(await code(api.ai.decideRecommendation(r.recId, 'REJECT', {}))).toBe('VALIDATION');
    await api.ai.decideRecommendation(r.recId, 'ACCEPT', {});
    const wo = (await api.ai.listWorkOrders('DRAFT')).find((w) => w.recId === r.recId);
    expect(wo?.status).toBe('DRAFT');
  });

  it('AI-PM-05: WO wajib disetujui manajemen (bukan pembuat) sebelum diselesaikan; hasil masuk riwayat', async () => {
    const wo = (await as('EMP001').listWorkOrders('DRAFT'))[0];
    expect(await code(api.ai.completeWorkOrder(wo.woId, { actualCost: 1, outcome: 'x', downtimeHours: 0 }))).toBe('AI-WO');
    expect(await code(api.ai.approveWorkOrder(wo.woId, true))).toBe('FORBIDDEN');
    await as('EMP005').approveWorkOrder(wo.woId, true);
    const before = db.maintenance.length;
    await as('EMP001').completeWorkOrder(wo.woId, { actualCost: 450000, outcome: 'Keyboard & baterai OK', downtimeHours: 3 });
    expect(db.maintenance.length).toBe(before + 1);
    expect(db.maintenance.at(-1)).toMatchObject({ assetNo: wo.assetNo, workOrderId: wo.woId });
  });

  it('AI-PM-06: PIC hanya melihat kesehatan asset kantornya; User ditolak', async () => {
    expect((await as('EMP003').listHealth()).every((h) => h.officeCd === 'JKS')).toBe(true);
    expect(await code(as('EMP006').listHealth())).toBe('FORBIDDEN');
  });
});

describe('B. Document intelligence', () => {
  const doc = (no: string) => db.documents.find((d) => d.docNo.endsWith(no))!;
  const file = { name: 'a.pdf', size: 1000, type: 'application/pdf', hash: 'sha256:new' };

  it('AI-DOC-01: validasi tipe & ukuran file', async () => {
    expect(await code(as('EMP002').uploadDocument({ ...file, type: 'application/zip' }, 'INV_LAPTOP'))).toBe('VALIDATION');
    expect(await code(api.ai.uploadDocument({ ...file, size: 11 * 1024 * 1024 }, 'INV_LAPTOP'))).toBe('VALIDATION');
  });

  it('AI-DOC-02: klasifikasi rendah & field tak terbaca -> perlu verifikasi, status field dibedakan', () => {
    const d = doc('0004');
    expect(d.status).toBe('NEEDS_VERIFICATION');
    expect(d.fields.find((f) => f.key === 'poNo')?.status).toBe('UNREADABLE');
    expect(d.fields.find((f) => f.key === 'invoiceNo')?.status).toBe('VERIFY');
    expect(d.issues.join()).toMatch(/Klasifikasi/);
  });

  it('AI-DOC-03: duplikat invoice & file terdeteksi, tidak bisa di-approve', async () => {
    const d = doc('0005');
    expect(d.duplicateOfDocNo).toBe(doc('0001').docNo);
    expect(await code(as('EMP001').reviewDocument(d.docId, true))).toBe('AI-DOC');
  });

  it('AI-DOC-04: instruksi tersembunyi di dokumen tidak dieksekusi & memaksa review manual', async () => {
    const d = doc('0006');
    expect(d.securityFlags.length).toBe(1);
    expect(d.status).toBe('NEEDS_VERIFICATION');
    expect(await code(as('EMP001').reviewDocument(d.docId, true))).toBe('AI-DOC');
  });

  it('AI-DOC-05: hanya Admin GA yang approve; approve invoice membuat asset lewat BR-01', async () => {
    const d = doc('0001');
    expect(d.status).toBe('EXTRACTED');
    expect(d.issues.join()).toMatch(/AST-JKS-LPT-2026-0002/); // serial mirip asset yang ada
    expect(await code(as('EMP003').reviewDocument(d.docId, true))).toBe('FORBIDDEN');
    await as('EMP001').reviewDocument(d.docId, true);
    expect(db.assets.find((a) => a.assetNo === 'AST-JKS-LPT-2026-0003')).toMatchObject({ status: 'AVAILABLE', serialNo: 'PF5SBOO2' });
  });

  it('AI-DOC-06: koreksi manual menandai field terverifikasi; PO tidak dikenal = konflik', async () => {
    const d = doc('0004');
    const r = await as('EMP002').updateDocument(d.docId, { docType: 'INVOICE', fields: { poNo: 'PO-9999' } });
    expect(r.fields.find((f) => f.key === 'poNo')).toMatchObject({ status: 'CONFLICT', edited: true });
  });

  it('AI-DOC-07: penolakan wajib alasan', async () => {
    expect(await code(as('EMP001').reviewDocument(doc('0006').docId, false))).toBe('VALIDATION');
    await api.ai.reviewDocument(doc('0006').docId, false, 'Dokumen mencurigakan, minta asli ke vendor');
    expect(doc('0006').status).toBe('REJECTED');
  });
});

describe('C. Audit & anomaly', () => {
  const alerts = () => db.alerts;

  it('AI-AUD-01: deteksi awal menghasilkan alert per kategori dengan versi aturan & bukti', () => {
    const rules = new Set(alerts().map((a) => a.ruleCd));
    expect(rules).toEqual(new Set(['TRX-02', 'MNT-01', 'OPN-01', 'OPN-02']));
    for (const a of alerts()) {
      expect(a.ruleVersion).toMatch(/v1\.0/);
      expect(a.evidence.length).toBeGreaterThan(0);
      expect(a.records.length).toBeGreaterThan(0);
    }
  });

  it('AI-AUD-02: biaya tinggi ditandai hanya bila ada pembanding cukup (laptop n<3 tidak ditandai)', () => {
    const mnt = alerts().filter((a) => a.ruleCd === 'MNT-01');
    expect(mnt).toHaveLength(1);
    expect(mnt[0].title).toContain('AST-JKU-PRN-2025-0001');
    expect(mnt[0].method).toBe('STATISTICAL');
  });

  it('AI-AUD-03: deteksi idempotent', async () => {
    expect((await as('EMP016').runDetection()).created).toBe(0);
  });

  it('AI-AUD-04: duplikat asset terdeteksi setelah invoice serial mirip di-approve; tidak di-merge otomatis', async () => {
    await as('EMP001').reviewDocument(db.documents.find((d) => d.docNo.endsWith('0001'))!.docId, true);
    const r = await as('EMP016').runDetection();
    expect(r.created).toBe(1);
    const dup = alerts().find((a) => a.ruleCd === 'DUP-01')!;
    expect(dup.records.map((x) => x.id)).toEqual(expect.arrayContaining(['AST-JKS-LPT-2026-0002', 'AST-JKS-LPT-2026-0003']));
    expect(db.assets.filter((a) => a.assetNo.startsWith('AST-JKS-LPT-2026')).length).toBe(3);
  });

  it('AI-AUD-05: perpindahan sering (≥3 dalam 90 hari) terdeteksi sebagai anomali, bukan pelanggaran', async () => {
    const no = 'AST-JKT-MON-2025-0004';
    actor = 'EMP001';
    for (const office of ['JKS', 'JKT', 'JKS']) await api.requestAssignment(no, { toOfficeCd: office, toUserId: null });
    await as('EMP016').runDetection();
    const a = alerts().find((x) => x.ruleCd === 'TRX-01')!;
    expect(a.nature).toBe('STATISTICAL_ANOMALY');
  });

  it('AI-AUD-06: kasus: false positive & penutupan wajib alasan; tidak bisa tutup bila tindakan terbuka', async () => {
    const c = db.cases[0];
    expect(await code(as('EMP016').updateCase(c.caseId, { status: 'CLOSED' }))).toBe('VALIDATION');
    expect(await code(api.ai.updateCase(c.caseId, { status: 'CLOSED', note: 'selesai' }))).toBe('AI-AUD');
    await api.ai.completeCorrectiveAction(c.caseId, c.actions[0].actionId);
    await api.ai.updateCase(c.caseId, { status: 'CLOSED', note: 'Proyektor ditemukan di gudang event' });
    expect(db.cases[0].status).toBe('CLOSED');
  });

  it('AI-AUD-07: hanya auditor yang bisa membuat kasus / dismiss; Admin GA ditolak', async () => {
    const open = alerts().find((a) => a.status === 'OPEN')!;
    expect(await code(as('EMP001').createCase(open.alertId, 'EMP016'))).toBe('FORBIDDEN');
    expect(await code(as('EMP016').dismissAlert(open.alertId, ''))).toBe('VALIDATION');
  });

  it('AI-AUD-08: asisten investigasi memisahkan fakta & hipotesis, menyitir record, dan tercatat di log', async () => {
    const a = alerts().find((x) => x.ruleCd === 'MNT-01')!;
    const ans = await as('EMP016').ask(a.alertId, 'WHY');
    expect(ans.facts[0].refs.length).toBeGreaterThan(0);
    expect(ans.hypotheses.length).toBeGreaterThan(0);
    expect(ans.engine).toMatch(/bukan LLM/);
    expect(db.aiLog.at(-1)).toMatchObject({ action: 'ASSISTANT_QUERY', actor: 'EMP016' });
  });
});
