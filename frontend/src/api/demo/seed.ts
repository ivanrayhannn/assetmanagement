import type { Asset, CheckInput, User } from '../types';
import { type DemoDb, emptyDb, parseIso } from './db';
import { DemoApi } from './service';

/*
 * Seed demo = salinan db/seed/S001–S003. Sesi opname dijalankan lewat DemoApi
 * (snapshot -> hasil cek -> submit -> approve) sehingga kondisi akhir dihasilkan oleh business rule yang sama:
 * total 33 | In Use 25 | Available 5 | Under Repair 1 | Missing 2.
 */

const USERS: [string, string, string, string, User['roleCd'], boolean][] = [
  ['EMP001', 'Rina Wulandari', 'General Affairs', 'JKT', 'ADMIN_GA', true],
  ['EMP002', 'Budi Santoso', 'General Affairs', 'JKT', 'PIC', true],
  ['EMP003', 'Sari Dewi', 'General Affairs', 'SBY', 'PIC', true],
  ['EMP004', 'Agus Pratama', 'General Affairs', 'BDG', 'PIC', true],
  ['EMP005', 'Hendra Wijaya', 'Direksi', 'JKT', 'EXEC', true],
  ['EMP006', 'Andi Saputra', 'Finance', 'JKT', 'USER', true],
  ['EMP007', 'Dewi Lestari', 'Marketing', 'JKT', 'USER', true],
  ['EMP008', 'Fajar Nugroho', 'IT', 'JKT', 'USER', true],
  ['EMP009', 'Maya Putri', 'HR', 'JKT', 'USER', true],
  ['EMP010', 'Rudi Hartono', 'Sales', 'JKT', 'USER', false],
  ['EMP011', 'Wahyu Setiawan', 'Sales', 'SBY', 'USER', true],
  ['EMP012', 'Indah Permata', 'Operations', 'SBY', 'USER', true],
  ['EMP013', 'Yoga Pradana', 'Finance', 'SBY', 'USER', true],
  ['EMP014', 'Lina Marlina', 'Sales', 'BDG', 'USER', true],
  ['EMP015', 'Dimas Ramadhan', 'Operations', 'BDG', 'USER', true],
];

/** Kondisi asset SEBELUM opname 2026-09: [nomor, nama, merk/model, serial, tgl perolehan, user] */
const ASSETS: [string, string, string, string | null, string, string | null][] = [
  ['AST-JKT-LPT-2024-0001', 'Laptop', 'Dell Latitude 5420', 'DL5420-7HQ2K13', '2024-02-05', 'EMP001'],
  ['AST-JKT-LPT-2024-0002', 'Laptop', 'Dell Latitude 5420', 'DL5420-7HQ2K14', '2024-02-05', 'EMP002'],
  ['AST-JKT-LPT-2024-0003', 'Laptop', 'Dell Latitude 5420', 'DL5420-7HQ2K15', '2024-02-05', 'EMP010'],
  ['AST-JKT-LPT-2025-0001', 'Laptop', 'Lenovo ThinkPad T14 Gen 4', 'PF4XK2A1', '2025-01-20', 'EMP005'],
  ['AST-JKT-LPT-2025-0002', 'Laptop', 'Lenovo ThinkPad T14 Gen 4', 'PF4XK2A2', '2025-01-20', 'EMP006'],
  ['AST-JKT-LPT-2026-0001', 'Laptop', 'HP EliteBook 840 G10', '5CG3301ABC', '2026-02-10', 'EMP007'],
  ['AST-JKT-LPT-2026-0002', 'Laptop', 'HP EliteBook 840 G10', '5CG3301ABD', '2026-02-10', 'EMP008'],
  ['AST-JKT-LPT-2026-0003', 'Laptop', 'HP EliteBook 840 G10', '5CG3388XYZ', '2026-08-18', null],
  ['AST-JKT-MON-2025-0001', 'Monitor 24 inch', 'Dell P2422H', 'CN0D2PMX-001', '2025-03-03', 'EMP006'],
  ['AST-JKT-MON-2025-0002', 'Monitor 24 inch', 'Dell P2422H', 'CN0D2PMX-002', '2025-03-03', 'EMP007'],
  ['AST-JKT-MON-2025-0003', 'Monitor 24 inch', 'Dell P2422H', 'CN0D2PMX-003', '2025-03-03', 'EMP009'],
  ['AST-JKT-MON-2025-0004', 'Monitor 24 inch', 'Dell P2422H', 'CN0D2PMX-004', '2025-03-03', null],
  ['AST-JKT-PRN-2024-0001', 'Printer Lantai 3', 'Epson L6270', 'X8EA012345', '2024-03-11', 'EMP002'],
  ['AST-JKT-PRN-2024-0002', 'Printer Ruang Finance', 'HP LaserJet Pro M404dn', 'PHBBK12345', '2024-03-11', 'EMP006'],
  ['AST-JKT-PRJ-2025-0001', 'Proyektor Ruang Rapat Lt. 5', 'Epson EB-X51', 'X5JK2201234', '2025-05-14', null],
  ['AST-JKT-FUR-2024-0001', 'Kursi Kerja Ergonomis', 'Informa Ergo Chair', null, '2024-01-15', 'EMP005'],
  ['AST-JKT-FUR-2024-0002', 'Lemari Arsip Besi 4 Laci', 'Brother Filing Cabinet', null, '2024-01-15', null],
  ['AST-SBY-LPT-2025-0001', 'Laptop', 'Lenovo ThinkPad E14', 'PF3SB001', '2025-02-17', 'EMP003'],
  ['AST-SBY-LPT-2025-0002', 'Laptop', 'Lenovo ThinkPad E14', 'PF3SB002', '2025-02-17', 'EMP011'],
  ['AST-SBY-LPT-2026-0001', 'Laptop', 'Lenovo ThinkPad E14 Gen 5', 'PF5SB001', '2026-02-24', 'EMP012'],
  ['AST-SBY-LPT-2026-0002', 'Laptop', 'Lenovo ThinkPad E14 Gen 5', 'PF5SB002', '2026-08-25', null],
  ['AST-SBY-MON-2025-0001', 'Monitor 24 inch', 'LG 24MP400', '304NTAB0001', '2025-02-17', 'EMP011'],
  ['AST-SBY-MON-2025-0002', 'Monitor 24 inch', 'LG 24MP400', '304NTAB0002', '2025-02-17', 'EMP012'],
  ['AST-SBY-PRN-2024-0001', 'Printer Kantor', 'Canon imageCLASS MF445dw', 'XNC01234', '2024-04-08', 'EMP003'],
  ['AST-SBY-PRJ-2025-0001', 'Proyektor Ruang Meeting', 'BenQ MX560', 'PDK9A0001', '2025-06-02', 'EMP013'],
  ['AST-SBY-FUR-2024-0001', 'Meja Kerja L-Shape', 'Olympic L-Desk', null, '2024-04-08', 'EMP013'],
  ['AST-BDG-LPT-2025-0001', 'Laptop', 'Asus ExpertBook B1', 'N7NXBD0001', '2025-04-07', 'EMP004'],
  ['AST-BDG-LPT-2025-0002', 'Laptop', 'Asus ExpertBook B1', 'N7NXBD0002', '2025-04-07', 'EMP014'],
  ['AST-BDG-LPT-2025-0003', 'Laptop', 'Asus ExpertBook B1', 'N7NXBD0003', '2025-04-07', null],
  ['AST-BDG-MON-2025-0001', 'Monitor 24 inch', 'Samsung S24R350', 'ZZBDG0001', '2025-04-07', 'EMP014'],
  ['AST-BDG-MON-2025-0002', 'Monitor 24 inch', 'Samsung S24R350', 'ZZBDG0002', '2025-04-07', 'EMP015'],
  ['AST-BDG-PRN-2025-0001', 'Printer Kantor', 'Brother HL-L2375DW', 'E78123BDG', '2025-04-07', 'EMP004'],
  ['AST-BDG-FUR-2024-0001', 'Kursi Kerja', 'Chairman PC 908', null, '2024-05-06', 'EMP015'],
];

const SESSIONS: { office: string; period: string; pic: string; created: string; submitted?: string; approved?: string }[] = [
  { office: 'JKT', period: '2026-03', pic: 'EMP002', created: '2026-03-02T08:00:00', submitted: '2026-03-05T16:00:00', approved: '2026-03-06T10:00:00' },
  { office: 'SBY', period: '2026-03', pic: 'EMP003', created: '2026-03-02T08:00:00', submitted: '2026-03-05T15:00:00', approved: '2026-03-06T10:30:00' },
  { office: 'BDG', period: '2026-03', pic: 'EMP004', created: '2026-03-02T08:00:00', submitted: '2026-03-04T16:00:00', approved: '2026-03-06T11:00:00' },
  { office: 'JKT', period: '2026-06', pic: 'EMP002', created: '2026-06-01T08:00:00', submitted: '2026-06-04T16:00:00', approved: '2026-06-05T10:00:00' },
  { office: 'SBY', period: '2026-06', pic: 'EMP003', created: '2026-06-01T08:00:00', submitted: '2026-06-04T15:00:00', approved: '2026-06-05T10:30:00' },
  { office: 'BDG', period: '2026-06', pic: 'EMP004', created: '2026-06-01T08:00:00', submitted: '2026-06-03T16:00:00', approved: '2026-06-05T11:00:00' },
  { office: 'JKT', period: '2026-09', pic: 'EMP002', created: '2026-09-01T08:00:00', submitted: '2026-09-04T16:00:00', approved: '2026-09-07T10:00:00' },
  { office: 'SBY', period: '2026-09', pic: 'EMP003', created: '2026-09-01T08:00:00', submitted: '2026-09-04T15:00:00', approved: '2026-09-07T10:30:00' },
  { office: 'BDG', period: '2026-09', pic: 'EMP004', created: '2026-09-01T08:00:00', submitted: '2026-09-03T16:00:00', approved: '2026-09-07T11:00:00' },
  { office: 'BDG', period: '2026-10', pic: 'EMP004', created: '2026-10-26T08:00:00' },
];

const FINDINGS: Record<string, Record<string, CheckInput>> = {
  'JKT-2026-09': {
    'AST-JKT-PRJ-2025-0001': { result: 'TIDAK_DITEMUKAN', remark: 'Tidak ada di ruang rapat Lt. 5 maupun gudang; terakhir dipakai acara townhall Agustus' },
    'AST-JKT-MON-2025-0002': { result: 'BEDA_LOKASI', actualUserId: 'EMP008', remark: 'Monitor dipakai Fajar (IT) sejak Dewi pindah meja' },
  },
  'SBY-2026-09': {
    'AST-SBY-MON-2025-0002': { result: 'TIDAK_DITEMUKAN', remark: 'Indah menyatakan monitor dipinjam tim event dan belum kembali' },
  },
  'BDG-2026-09': {
    'AST-BDG-PRN-2025-0001': { result: 'RUSAK', remark: 'Paper feed macet, tidak bisa mencetak' },
  },
};

const at = (iso: string, plusMinutes = 0) => new Date(parseIso(iso).getTime() + plusMinutes * 60_000);

export async function buildSeed(): Promise<DemoDb> {
  const db = emptyDb();

  db.offices = [
    { officeCd: 'JKT', officeNm: 'Kantor Pusat Jakarta', city: 'Jakarta', picUserId: 'EMP002' },
    { officeCd: 'SBY', officeNm: 'Kantor Cabang Surabaya', city: 'Surabaya', picUserId: 'EMP003' },
    { officeCd: 'BDG', officeNm: 'Kantor Cabang Bandung', city: 'Bandung', picUserId: 'EMP004' },
  ];
  db.categories = [
    { categoryCd: 'LPT', categoryNm: 'Laptop' },
    { categoryCd: 'MON', categoryNm: 'Monitor' },
    { categoryCd: 'PRN', categoryNm: 'Printer' },
    { categoryCd: 'PRJ', categoryNm: 'Proyektor' },
    { categoryCd: 'FUR', categoryNm: 'Furniture' },
  ];
  db.users = USERS.map(([userId, userNm, dept, officeCd, roleCd, isActive]) => ({
    userId, userNm, dept, officeCd, roleCd, isActive,
    email: `${userNm.toLowerCase().replace(' ', '.')}@ams.local`,
  }));

  for (const [assetNo, assetNm, brandModel, serialNo, acqDt, userId] of ASSETS) {
    const createdDt = `${acqDt}T09:00:00`;
    const a: Asset = {
      assetNo, assetNm, brandModel, serialNo, acqDt, userId, createdDt,
      categoryCd: assetNo.slice(8, 11), officeCd: assetNo.slice(4, 7),
      status: userId ? 'IN_USE' : 'AVAILABLE', condition: 'BAIK', remark: null,
    };
    db.assets.push(a);
    const key = `${a.officeCd}-${a.categoryCd}-${assetNo.slice(12, 16)}`;
    db.seq[key] = Math.max(db.seq[key] ?? 0, Number(assetNo.slice(-4)));
    db.history.push({
      histId: db.nextId.hist++, assetNo, action: 'REGISTER', fromUser: null, toUser: null, fromOffice: null, toOffice: a.officeCd,
      fromStatus: null, toStatus: 'AVAILABLE', reason: 'Registrasi asset baru', opnameId: null, createdBy: 'EMP001', createdDt,
    });
  }

  const addDays = (iso: string, days: number, hh: string) => {
    const d = parseIso(iso);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hh}`;
  };
  const assign = (assetNo: string, type: 'ASSIGN' | 'TRANSFER', from: string | null, to: string, requested: string, responded: string, reason: string) => {
    db.assignments.push({
      assignmentId: db.nextId.assignment++, assetNo, assignType: type, fromUser: from, toUser: to, fromOffice: assetNo.slice(4, 7),
      toOffice: assetNo.slice(4, 7), reason, status: 'CONFIRMED', responseNote: null, requestedBy: 'EMP001', requestedDt: requested, respondedDt: responded,
    });
    db.history.push({
      histId: db.nextId.hist++, assetNo, action: type, fromUser: from, toUser: to, fromOffice: assetNo.slice(4, 7), toOffice: assetNo.slice(4, 7),
      fromStatus: type === 'ASSIGN' ? 'AVAILABLE' : 'IN_USE', toStatus: 'IN_USE',
      reason: type === 'ASSIGN' ? 'Dikonfirmasi diterima oleh user' : reason, opnameId: null, createdBy: 'EMP001', createdDt: responded,
    });
  };
  for (const a of db.assets) {
    if (!a.userId || a.assetNo === 'AST-JKT-MON-2025-0003') continue;
    assign(a.assetNo, 'ASSIGN', null, a.userId, addDays(a.createdDt, 2, '09:00:00'), addDays(a.createdDt, 2, '12:00:00'), 'Kebutuhan kerja');
  }
  // Contoh mutasi antar user (FR-04)
  assign('AST-JKT-MON-2025-0003', 'ASSIGN', null, 'EMP010', '2025-03-05T09:00:00', '2025-03-05T12:00:00', 'Kebutuhan kerja');
  assign('AST-JKT-MON-2025-0003', 'TRANSFER', 'EMP010', 'EMP009', '2025-09-01T10:00:00', '2025-09-01T14:00:00', 'Rudi pindah ke laptop dual-screen dock');
  // Assign yang masih menunggu konfirmasi user (asset tetap AVAILABLE)
  db.assignments.push({
    assignmentId: db.nextId.assignment++, assetNo: 'AST-JKT-LPT-2026-0003', assignType: 'ASSIGN', fromUser: null, toUser: 'EMP009',
    fromOffice: 'JKT', toOffice: 'JKT', reason: 'Penggantian laptop lama', status: 'PENDING', responseNote: null,
    requestedBy: 'EMP001', requestedDt: '2026-10-27T10:00:00', respondedDt: null,
  });

  // Stock opname lewat business rule yang sama dengan aplikasi
  let now = new Date();
  let actor = 'EMP001';
  const api = new DemoApi(db, () => actor, () => now);
  for (const s of SESSIONS) {
    now = at(s.created);
    actor = 'EMP001';
    const { opnameId } = await api.createOpname(s.office);
    const detail = await api.getOpname(opnameId);
    const findings = FINDINGS[`${s.office}-${s.period}`] ?? {};
    actor = s.pic;
    const targets = detail.items.filter((i) => i.assetNo).slice(0, s.submitted ? undefined : 4);
    for (const [ix, item] of targets.entries()) {
      now = at(s.created, 24 * 60 + 10 * (ix + 1));
      await api.saveCheck(opnameId, item.assetNo!, findings[item.assetNo!] ?? { result: 'SESUAI' });
    }
    if (s.office === 'SBY' && s.period === '2026-09')
      await api.addPlus(opnameId, { categoryCd: 'FUR', plusDesc: 'Kursi kerja hitam tanpa label nomor asset di ruang Sales', remark: 'Perlu diregistrasi oleh Admin GA' });
    if (!s.submitted || !s.approved) continue;
    now = at(s.submitted);
    await api.submitOpname(opnameId);
    now = at(s.approved);
    actor = 'EMP001';
    await api.approveOpname(opnameId);
  }
  return db;
}
