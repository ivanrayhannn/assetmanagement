import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import type { DemoDb } from './db';
import { buildSeed } from './seed';
import { DemoApi } from './service';

/* Unit test per business rule (FSD §6) dan skenario UAT (FSD §7) terhadap backend demo. */

let db: DemoDb;
let actor: string;
let now: Date;
let api: DemoApi;
const as = (userId: string) => {
  actor = userId;
  return api;
};

beforeEach(async () => {
  db = await buildSeed();
  now = new Date(2026, 9, 28, 9, 0, 0); // 28 Okt 2026
  actor = 'EMP001';
  api = new DemoApi(db, () => actor, () => now);
});

const asset = (no: string) => db.assets.find((a) => a.assetNo === no)!;
const expectError = async (p: Promise<unknown>, code: string, status?: number) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
  if (status) expect((err as ApiError).status).toBe(status);
  return err as ApiError;
};
const bdgOpen = () => db.opnames.find((o) => o.officeCd === 'BDG' && o.status === 'OPEN')!;

describe('Seed (konsisten dengan db/seed & contoh SA §4)', () => {
  it('KPI 33 / 25 / 5 / 1 / 2 dan opname JKT 2026-09 = 17 / 16 / minus 1', async () => {
    const s = await as('EMP005').dashboardSummary();
    expect(s.kpi).toEqual({ total: 33, inUse: 25, available: 5, underRepair: 1, missing: 2 });
    const jkt = s.lastOpname.find((o) => o.officeCd === 'JKT')!;
    expect(jkt).toMatchObject({ period: '2026-09', qtySystem: 17, qtyFound: 16, qtyMinus: 1, qtyPlus: 0, isRed: true });
  });
});

describe('BR-01 nomor asset', () => {
  it('TC-01: registrasi JKT Laptop -> AST-JKT-LPT-2026-0004, status Available, riwayat REGISTER', async () => {
    expect(await api.previewAssetNo('JKT', 'LPT')).toBe('AST-JKT-LPT-2026-0004');
    const a = await api.createAsset({ assetNm: 'Laptop', categoryCd: 'LPT', officeCd: 'JKT', acqDt: '2026-10-20' });
    expect(a.assetNo).toBe('AST-JKT-LPT-2026-0004');
    expect(a.status).toBe('AVAILABLE');
    expect(db.history.some((h) => h.assetNo === a.assetNo && h.action === 'REGISTER')).toBe(true);
  });

  it('sequence reset per kantor-kategori-tahun', async () => {
    const a = await api.createAsset({ assetNm: 'Proyektor', categoryCd: 'PRJ', officeCd: 'BDG', acqDt: '2026-10-01' });
    expect(a.assetNo).toBe('AST-BDG-PRJ-2026-0001');
    now = new Date(2027, 0, 5, 9, 0, 0);
    const b = await api.createAsset({ assetNm: 'Laptop', categoryCd: 'LPT', officeCd: 'JKT', acqDt: '2027-01-02' });
    expect(b.assetNo).toBe('AST-JKT-LPT-2027-0001');
  });

  it('nomor unik walau registrasi beruntun', async () => {
    const x = await api.createAsset({ assetNm: 'A', categoryCd: 'MON', officeCd: 'SBY', acqDt: '2026-10-01' });
    const y = await api.createAsset({ assetNm: 'B', categoryCd: 'MON', officeCd: 'SBY', acqDt: '2026-10-01' });
    expect(x.assetNo).not.toBe(y.assetNo);
  });

  it('hanya Admin GA yang boleh registrasi', async () => {
    await expectError(as('EMP002').createAsset({ assetNm: 'X', categoryCd: 'LPT', officeCd: 'JKT', acqDt: '2026-10-01' }), 'FORBIDDEN', 403);
  });
});

describe('BR-02 satu asset satu user', () => {
  it('TC-02: assign asset Available -> PENDING, lalu user konfirmasi -> In Use + riwayat ASSIGN', async () => {
    const r = await api.requestAssignment('AST-JKT-MON-2025-0004', { toOfficeCd: 'JKT', toUserId: 'EMP007' });
    expect(r.outcome).toBe('PENDING');
    expect(asset('AST-JKT-MON-2025-0004').status).toBe('AVAILABLE');
    await as('EMP007').respondAssignment(r.assignment!.assignmentId, true);
    expect(asset('AST-JKT-MON-2025-0004')).toMatchObject({ status: 'IN_USE', userId: 'EMP007' });
    expect(db.history.some((h) => h.assetNo === 'AST-JKT-MON-2025-0004' && h.action === 'ASSIGN' && h.toUser === 'EMP007')).toBe(true);
  });

  it('TC-03: assign asset Missing ditolak', async () => {
    const e = await expectError(api.requestAssignment('AST-JKT-PRJ-2025-0001', { toOfficeCd: 'JKT', toUserId: 'EMP006' }), 'BR-02', 422);
    expect(e.message).toContain('Hilang');
  });

  it('tidak boleh ada dua permintaan PENDING untuk asset yang sama', async () => {
    await expectError(api.requestAssignment('AST-JKT-LPT-2026-0003', { toOfficeCd: 'JKT', toUserId: 'EMP006' }), 'BR-02');
  });

  it('user menolak wajib dengan alasan; asset tetap Available', async () => {
    const pending = db.assignments.find((x) => x.status === 'PENDING')!;
    await expect(as('EMP009').respondAssignment(pending.assignmentId, false)).rejects.toBeInstanceOf(ApiError);
    await as('EMP009').respondAssignment(pending.assignmentId, false, 'Spesifikasi tidak sesuai');
    expect(asset('AST-JKT-LPT-2026-0003')).toMatchObject({ status: 'AVAILABLE', userId: null });
  });

  it('hanya user tujuan yang boleh konfirmasi', async () => {
    const pending = db.assignments.find((x) => x.status === 'PENDING')!;
    await expectError(as('EMP006').respondAssignment(pending.assignmentId, true), 'FORBIDDEN', 403);
  });
});

describe('BR-03 mutasi antar kantor', () => {
  it('TC-05: mutasi JKT -> SBY mengubah kantor & riwayat TRANSFER setelah dikonfirmasi', async () => {
    const r = await api.requestAssignment('AST-JKT-LPT-2025-0002', { toOfficeCd: 'SBY', toUserId: 'EMP011', reason: 'Rotasi' });
    expect(r.assignment?.assignType).toBe('TRANSFER');
    await as('EMP011').respondAssignment(r.assignment!.assignmentId, true);
    expect(asset('AST-JKT-LPT-2025-0002')).toMatchObject({ officeCd: 'SBY', userId: 'EMP011', status: 'IN_USE' });
    expect(db.history.some((h) => h.assetNo === 'AST-JKT-LPT-2025-0002' && h.action === 'TRANSFER' && h.toOffice === 'SBY')).toBe(true);
  });

  it('mutasi ke stok kantor lain langsung berlaku; tanggung jawab pindah ke PIC tujuan', async () => {
    const r = await api.requestAssignment('AST-JKT-LPT-2025-0002', { toOfficeCd: 'SBY', toUserId: null });
    expect(r.outcome).toBe('APPLIED');
    expect(asset('AST-JKT-LPT-2025-0002')).toMatchObject({ officeCd: 'SBY', userId: null, status: 'AVAILABLE' });
    expect((await as('EMP003').listAssets({ q: 'AST-JKT-LPT-2025-0002' })).total).toBe(1);
    expect((await as('EMP002').listAssets({ q: 'AST-JKT-LPT-2025-0002' })).total).toBe(0);
  });
});

describe('BR-04 freeze mutasi selama opname', () => {
  it('mutasi asset di kantor yang sedang opname ditolak', async () => {
    await expectError(api.requestAssignment('AST-BDG-LPT-2025-0003', { toOfficeCd: 'BDG', toUserId: 'EMP015' }), 'BR-04');
  });

  it('mutasi ke kantor tujuan yang sedang opname ditolak', async () => {
    await expectError(api.requestAssignment('AST-JKT-MON-2025-0004', { toOfficeCd: 'BDG', toUserId: null }), 'BR-04');
  });

  it('konfirmasi user ditolak bila opname dimulai setelah permintaan dibuat', async () => {
    const r = await api.requestAssignment('AST-JKT-MON-2025-0004', { toOfficeCd: 'JKT', toUserId: 'EMP006' });
    await api.createOpname('JKT');
    await expectError(as('EMP006').respondAssignment(r.assignment!.assignmentId, true), 'BR-04');
  });

  it('satu kantor hanya boleh punya satu sesi aktif', async () => {
    await expectError(api.createOpname('BDG'), 'BR-04');
  });
});

describe('BR-05 / BR-06 / BR-07 alur stock opname', () => {
  it('TC-06: dua asset Tidak Ditemukan -> minus 2, keduanya Missing setelah approve', async () => {
    const { opnameId, qtySystem } = await api.createOpname('JKT');
    expect(qtySystem).toBe(16); // 17 asset JKT, 1 sudah Missing
    as('EMP002');
    await api.saveCheck(opnameId, 'AST-JKT-LPT-2026-0001', { result: 'TIDAK_DITEMUKAN' });
    await api.saveCheck(opnameId, 'AST-JKT-MON-2025-0001', { result: 'TIDAK_DITEMUKAN' });
    await api.markRemainingOk(opnameId);
    await api.submitOpname(opnameId);
    await as('EMP001').approveOpname(opnameId);
    const h = (await api.listOpnames({ officeCd: 'JKT' })).find((o) => o.opnameId === opnameId)!;
    expect(h).toMatchObject({ status: 'APPROVED', qtySystem: 16, qtyMinus: 2, qtyFound: 14 });
    expect(asset('AST-JKT-LPT-2026-0001')).toMatchObject({ status: 'MISSING', userId: null });
    expect(asset('AST-JKT-MON-2025-0001').status).toBe('MISSING');
  });

  it('BR-05: temuan plus tidak mengubah qty sistem/fisik', async () => {
    const { opnameId } = await api.createOpname('SBY');
    await as('EMP003').addPlus(opnameId, { categoryCd: 'FUR', plusDesc: 'Meja lipat' });
    const o = await api.getOpname(opnameId);
    expect(o).toMatchObject({ qtySystem: 8, qtyFound: 8, qtyMinus: 0, qtyPlus: 1 });
  });

  it('TC-07: submit dengan asset belum dicek ditolak & menyebut jumlahnya', async () => {
    const o = bdgOpen();
    const e = await expectError(as('EMP004').submitOpname(o.opnameId), 'BR-06');
    expect(e.message).toMatch(/^3 asset belum dicek/);
  });

  it('BR-07: RUSAK -> Under Repair, BEDA_LOKASI -> user aktual', async () => {
    const o = bdgOpen();
    as('EMP004');
    await api.saveCheck(o.opnameId, 'AST-BDG-MON-2025-0002', { result: 'BEDA_LOKASI', actualUserId: 'EMP014' });
    await api.saveCheck(o.opnameId, 'AST-BDG-FUR-2024-0001', { result: 'RUSAK' });
    await api.markRemainingOk(o.opnameId);
    await api.submitOpname(o.opnameId);
    await as('EMP001').approveOpname(o.opnameId);
    expect(asset('AST-BDG-MON-2025-0002')).toMatchObject({ userId: 'EMP014', status: 'IN_USE' });
    expect(asset('AST-BDG-FUR-2024-0001').status).toBe('UNDER_REPAIR');
  });

  it('BEDA_LOKASI wajib menyebut user/kantor aktual', async () => {
    await expectError(as('EMP004').saveCheck(bdgOpen().opnameId, 'AST-BDG-MON-2025-0002', { result: 'BEDA_LOKASI' }), 'VALIDATION', 400);
  });
});

describe('Segregation of duty & otorisasi', () => {
  it('hasil cek terkunci setelah submit', async () => {
    const o = bdgOpen();
    as('EMP004');
    await api.markRemainingOk(o.opnameId);
    await api.submitOpname(o.opnameId);
    await expectError(api.saveCheck(o.opnameId, 'AST-BDG-LPT-2025-0001', { result: 'RUSAK' }), 'SOD');
  });

  it('PIC hanya bisa input hasil cek di kantornya', async () => {
    await expectError(as('EMP002').saveCheck(bdgOpen().opnameId, 'AST-BDG-LPT-2025-0001', { result: 'SESUAI' }), 'FORBIDDEN', 403);
  });

  it('PIC tidak bisa approve', async () => {
    await expectError(as('EMP004').approveOpname(bdgOpen().opnameId), 'FORBIDDEN', 403);
  });

  it('TC-09: User membuka asset milik orang lain -> akses ditolak', async () => {
    await expectError(as('EMP006').getAsset('AST-JKT-LPT-2026-0001'), 'FORBIDDEN', 403);
    expect((await api.getAsset('AST-JKT-LPT-2025-0002')).userId).toBe('EMP006');
  });

  it('User hanya melihat asset miliknya di daftar', async () => {
    const r = await as('EMP006').listAssets({});
    expect(r.items.every((a) => a.userId === 'EMP006')).toBe(true);
    expect(r.total).toBe(3);
  });

  it('User tidak bisa membuka dashboard', async () => {
    await expectError(as('EMP006').dashboardSummary(), 'FORBIDDEN', 403);
  });
});

describe('BR-08 dashboard', () => {
  it('TC-08: setelah TC-06 grafik JKT minus 2 merah, total Missing bertambah 2', async () => {
    const { opnameId } = await api.createOpname('JKT');
    as('EMP002');
    await api.saveCheck(opnameId, 'AST-JKT-LPT-2026-0001', { result: 'TIDAK_DITEMUKAN' });
    await api.saveCheck(opnameId, 'AST-JKT-MON-2025-0001', { result: 'TIDAK_DITEMUKAN' });
    await api.markRemainingOk(opnameId);
    await api.submitOpname(opnameId);
    await as('EMP001').approveOpname(opnameId);
    const s = await as('EMP005').dashboardSummary();
    expect(s.lastOpname.find((o) => o.officeCd === 'JKT')).toMatchObject({ period: '2026-10', qtyMinus: 2, isRed: true });
    expect(s.lastOpname.find((o) => o.officeCd === 'BDG')).toMatchObject({ qtyMinus: 0, isRed: false });
    expect(s.kpi.missing).toBe(4);
  });

  it('PIC hanya melihat dashboard kantornya', async () => {
    const s = await as('EMP003').dashboardSummary('JKT');
    expect(s.kpi.total).toBe(9);
    expect(s.lastOpname.map((o) => o.officeCd)).toEqual(['SBY']);
  });
});
