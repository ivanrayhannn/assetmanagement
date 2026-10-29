import { ApiError, badRequest, businessError, forbidden, notFound } from '../errors';
import type {
  AmsApi,
  Asset,
  AssetDetail,
  AssetHistory,
  AssetQuery,
  AssetStatus,
  Assignment,
  AssignmentInput,
  AssignmentResult,
  CheckInput,
  CreateAssetInput,
  DashboardSummary,
  FileDownload,
  MinusItem,
  OpnameDetail,
  OpnameHeader,
  OpnameStatus,
  Paged,
  PlusInput,
  RoleCd,
  User,
} from '../types';
import { STATUS_LABEL, RESULT_LABEL } from '../../domain/labels';
import { DemoAiApi } from './ai-service';
import { type DemoDb, type OpnameItemRow, type OpnameRow, periodOf, toIso } from './db';

/**
 * Implementasi AMS API di browser untuk demo & review user.
 * Business rule & otorisasi mengikuti CLAUDE.md / FSD agar perilakunya sama dengan API .NET:
 * kode error (BR-xx) dan pesan dipakai ulang oleh API produksi.
 */
export class DemoApi implements AmsApi {
  readonly ai: DemoAiApi;

  constructor(
    private readonly db: DemoDb,
    private readonly currentUserId: () => string | null,
    private readonly clock: () => Date = () => new Date(),
    private readonly persist: () => void = () => {},
  ) {
    this.ai = new DemoAiApi(db, currentUserId, clock, persist, (input) => this.createAsset(input));
  }

  /* ------------------------------------------------------------ helpers -- */

  private me(): User {
    const id = this.currentUserId();
    const u = id ? this.db.users.find((x) => x.userId === id) : undefined;
    if (!u) throw new ApiError(401, 'Sesi login tidak ditemukan. Silakan masuk kembali.', 'UNAUTHENTICATED');
    return u;
  }

  private require(...roles: RoleCd[]): User {
    const u = this.me();
    if (!roles.includes(u.roleCd)) throw forbidden('Peran Anda tidak memiliki akses ke fungsi ini.');
    return u;
  }

  private now() {
    return toIso(this.clock());
  }

  private asset(assetNo: string): Asset {
    const a = this.db.assets.find((x) => x.assetNo === assetNo);
    if (!a) throw notFound(`Asset ${assetNo} tidak ditemukan.`);
    return a;
  }

  private user(userId: string | null | undefined) {
    return userId ? this.db.users.find((u) => u.userId === userId) : undefined;
  }

  private pendingFor(assetNo: string) {
    return this.db.assignments.find((x) => x.assetNo === assetNo && x.status === 'PENDING') ?? null;
  }

  /** Scope data row-level (SA §6): PIC = kantornya, User = asset miliknya / yang ditawarkan kepadanya. */
  private canSee(a: Asset, me: User) {
    switch (me.roleCd) {
      case 'ADMIN_GA':
      case 'EXEC':
      case 'AUDITOR':
        return true;
      case 'PIC':
        return a.officeCd === me.officeCd;
      case 'USER':
        return a.userId === me.userId || this.pendingFor(a.assetNo)?.toUser === me.userId;
    }
  }

  private activeOpname(officeCd: string) {
    return this.db.opnames.find((o) => o.officeCd === officeCd && (o.status === 'OPEN' || o.status === 'SUBMITTED'));
  }

  /** BR-04: mutasi dibekukan bila kantor asal atau tujuan punya sesi opname OPEN/SUBMITTED. */
  private assertNotFrozen(...offices: string[]) {
    for (const off of new Set(offices)) {
      const op = this.activeOpname(off);
      if (op) {
        const nm = this.db.offices.find((o) => o.officeCd === off)?.officeNm ?? off;
        throw businessError('BR-04', `Stock opname ${nm} sedang berjalan. Mutasi di kantor ini dibuka lagi setelah opname di-approve.`);
      }
    }
  }

  /** BR-02: asset Missing/Disposed tidak bisa di-assign atau dimutasi. */
  private assertAssignable(a: Asset) {
    if (a.status === 'MISSING' || a.status === 'DISPOSED')
      throw businessError('BR-02', `Asset berstatus ${STATUS_LABEL[a.status]} tidak bisa di-assign atau dimutasi.`);
  }

  private addHistory(h: Omit<AssetHistory, 'histId'>) {
    this.db.history.push({ ...h, histId: this.db.nextId.hist++ });
  }

  private opname(opnameId: number): OpnameRow {
    const o = this.db.opnames.find((x) => x.opnameId === opnameId);
    if (!o) throw notFound(`Sesi opname ${opnameId} tidak ditemukan.`);
    return o;
  }

  private canSeeOpname(o: OpnameRow, me: User) {
    return me.roleCd === 'ADMIN_GA' || me.roleCd === 'EXEC' || me.roleCd === 'AUDITOR' || (me.roleCd === 'PIC' && me.officeCd === o.officeCd);
  }

  /** Input hasil cek hanya oleh PIC kantor tsb, selama sesi OPEN (SoD, SA §6). */
  private requireCheckable(opnameId: number) {
    const me = this.require('PIC');
    const o = this.opname(opnameId);
    if (o.officeCd !== me.officeCd) throw forbidden('Hasil cek hanya bisa diinput oleh PIC kantor yang bersangkutan.');
    if (o.status !== 'OPEN') throw businessError('SOD', 'Hasil cek terkunci karena sesi sudah di-submit.');
    return { me, o };
  }

  private itemsOf(opnameId: number) {
    return this.db.items.filter((i) => i.opnameId === opnameId);
  }

  /** BR-05: Minus = TIDAK_DITEMUKAN, Plus = PLUS, Fisik = Sistem − Minus. */
  private recalc(o: OpnameRow) {
    const items = this.itemsOf(o.opnameId);
    o.qtySystem = items.filter((i) => i.assetNo !== null).length;
    o.qtyMinus = items.filter((i) => i.result === 'TIDAK_DITEMUKAN').length;
    o.qtyPlus = items.filter((i) => i.result === 'PLUS').length;
    o.qtyFound = o.qtySystem - o.qtyMinus;
  }

  private header(o: OpnameRow): OpnameHeader {
    const checked = this.itemsOf(o.opnameId).filter((i) => i.assetNo !== null && i.result !== null).length;
    return { ...o, qtyChecked: checked };
  }

  private done<T>(value: T): Promise<T> {
    this.persist();
    return Promise.resolve(structuredClone(value));
  }

  /* ------------------------------------------------------------- master -- */

  async listOffices() {
    return structuredClone(this.db.offices);
  }

  async listCategories() {
    return structuredClone(this.db.categories);
  }

  async listUsers(officeCd?: string) {
    return structuredClone(this.db.users.filter((u) => !officeCd || u.officeCd === officeCd));
  }

  /* -------------------------------------------------------------- asset -- */

  async listAssets(q: AssetQuery): Promise<Paged<Asset>> {
    const me = this.me();
    const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 50);
    const page = Math.max(q.page ?? 1, 1);
    const text = (q.q ?? '').trim().toLowerCase();
    const list = this.db.assets
      .filter((a) => this.canSee(a, me))
      .filter((a) => (!q.office || a.officeCd === q.office) && (!q.cat || a.categoryCd === q.cat) && (!q.status || a.status === q.status))
      .filter((a) => {
        if (!text) return true;
        const office = this.db.offices.find((o) => o.officeCd === a.officeCd)?.officeNm ?? '';
        return [a.assetNo, a.assetNm, a.brandModel, a.serialNo, this.user(a.userId)?.userNm, office]
          .join(' ')
          .toLowerCase()
          .includes(text);
      })
      .sort((x, y) => x.assetNo.localeCompare(y.assetNo));
    return structuredClone({ items: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize });
  }

  async getAsset(assetNo: string): Promise<AssetDetail> {
    const me = this.me();
    const a = this.asset(assetNo);
    if (!this.canSee(a, me)) throw forbidden('Anda tidak memiliki akses ke asset ini.'); // TC-09
    const history = this.db.history
      .filter((h) => h.assetNo === assetNo)
      .sort((x, y) => y.createdDt.localeCompare(x.createdDt) || y.histId - x.histId);
    return structuredClone({ ...a, history, pendingAssignment: this.pendingFor(assetNo) });
  }

  /** BR-01: nomor berikutnya untuk kantor-kategori-tahun registrasi (tanpa mengonsumsi sequence). */
  async previewAssetNo(officeCd: string, categoryCd: string) {
    this.require('ADMIN_GA');
    return formatAssetNo(officeCd, categoryCd, this.clock().getFullYear(), (this.db.seq[seqKey(officeCd, categoryCd, this.clock().getFullYear())] ?? 0) + 1);
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const me = this.require('ADMIN_GA');
    const assetNm = input.assetNm?.trim();
    if (!assetNm) throw badRequest('Nama asset wajib diisi.');
    if (!this.db.offices.some((o) => o.officeCd === input.officeCd)) throw badRequest('Kantor tidak valid.');
    if (!this.db.categories.some((c) => c.categoryCd === input.categoryCd)) throw badRequest('Kategori tidak valid.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acqDt ?? '')) throw badRequest('Tanggal perolehan wajib diisi.');
    if (input.acqDt > this.now().slice(0, 10)) throw badRequest('Tanggal perolehan tidak boleh di masa depan.');
    const serialNo = input.serialNo?.trim() || null;
    if (serialNo && this.db.assets.some((a) => a.categoryCd === input.categoryCd && a.serialNo === serialNo))
      throw businessError('DUPLICATE_SERIAL', `Serial number ${serialNo} sudah terdaftar untuk kategori ini.`);

    // BR-01: sequence per kantor-kategori-tahun registrasi, nomor tidak bisa diubah setelah disimpan
    const year = this.clock().getFullYear();
    const key = seqKey(input.officeCd, input.categoryCd, year);
    const next = (this.db.seq[key] ?? 0) + 1;
    if (next > 9999) throw businessError('BR-01', 'Sequence nomor asset untuk kantor-kategori-tahun ini sudah mencapai 9999.');
    this.db.seq[key] = next;

    const now = this.now();
    const asset: Asset = {
      assetNo: formatAssetNo(input.officeCd, input.categoryCd, year, next),
      assetNm,
      categoryCd: input.categoryCd,
      brandModel: input.brandModel?.trim() || null,
      serialNo,
      acqDt: input.acqDt,
      officeCd: input.officeCd,
      userId: null,
      status: 'AVAILABLE',
      condition: input.condition ?? 'BAIK',
      remark: null,
      createdDt: now,
    };
    this.db.assets.push(asset);
    this.addHistory({
      assetNo: asset.assetNo, action: 'REGISTER', fromUser: null, toUser: null, fromOffice: null, toOffice: asset.officeCd,
      fromStatus: null, toStatus: 'AVAILABLE', reason: 'Registrasi asset baru', opnameId: null, createdBy: me.userId, createdDt: now,
    });
    return this.done(asset);
  }

  async requestAssignment(assetNo: string, input: AssignmentInput): Promise<AssignmentResult> {
    const me = this.require('ADMIN_GA');
    const a = this.asset(assetNo);
    this.assertAssignable(a);
    if (this.pendingFor(assetNo))
      throw businessError('BR-02', 'Asset masih punya permintaan assign yang menunggu konfirmasi user. Batalkan dulu permintaan tersebut.');
    if (!this.db.offices.some((o) => o.officeCd === input.toOfficeCd)) throw badRequest('Kantor tujuan tidak valid.');
    const toUserId = input.toUserId || null;
    if (input.toOfficeCd === a.officeCd && toUserId === a.userId) throw badRequest('Pilih kantor atau user yang berbeda dari saat ini.');
    if (!toUserId && !a.userId && input.toOfficeCd === a.officeCd) throw badRequest('Asset sudah berada di stok kantor ini.');
    this.assertNotFrozen(a.officeCd, input.toOfficeCd);
    const reason = input.reason?.trim() || null;
    const now = this.now();

    if (toUserId) {
      const target = this.user(toUserId);
      if (!target || !target.isActive) throw badRequest('User tujuan tidak ditemukan atau sudah tidak aktif.');
      if (target.officeCd !== input.toOfficeCd) throw badRequest('User tujuan tidak berada di kantor tujuan.');
      const assignment: Assignment = {
        assignmentId: this.db.nextId.assignment++,
        assetNo,
        assignType: !a.userId && a.officeCd === input.toOfficeCd ? 'ASSIGN' : 'TRANSFER',
        fromUser: a.userId,
        toUser: toUserId,
        fromOffice: a.officeCd,
        toOffice: input.toOfficeCd,
        reason,
        status: 'PENDING',
        responseNote: null,
        requestedBy: me.userId,
        requestedDt: now,
        respondedDt: null,
      };
      this.db.assignments.push(assignment);
      return this.done({ outcome: 'PENDING', assignment });
    }

    // Ke stok kantor: langsung berlaku. BR-03: pindah kantor -> OFFICE_CD berubah, riwayat TRANSFER.
    const toStatus: AssetStatus = a.status === 'IN_USE' ? 'AVAILABLE' : a.status;
    this.addHistory({
      assetNo, action: input.toOfficeCd !== a.officeCd ? 'TRANSFER' : 'RETURN', fromUser: a.userId, toUser: null,
      fromOffice: a.officeCd, toOffice: input.toOfficeCd, fromStatus: a.status, toStatus, reason, opnameId: null,
      createdBy: me.userId, createdDt: now,
    });
    Object.assign(a, { userId: null, officeCd: input.toOfficeCd, status: toStatus });
    return this.done({ outcome: 'APPLIED', assignment: null });
  }

  async cancelAssignment(assignmentId: number) {
    this.require('ADMIN_GA');
    const x = this.db.assignments.find((y) => y.assignmentId === assignmentId && y.status === 'PENDING');
    if (!x) throw notFound('Permintaan assign tidak ditemukan atau sudah diproses.');
    Object.assign(x, { status: 'CANCELLED', respondedDt: this.now() });
    await this.done(null);
  }

  /** UC-01: user tujuan konfirmasi terima (asset jadi In Use) atau tolak dengan alasan. */
  async respondAssignment(assignmentId: number, accept: boolean, note?: string) {
    const me = this.me();
    const x = this.db.assignments.find((y) => y.assignmentId === assignmentId);
    if (!x || x.status !== 'PENDING') throw notFound('Permintaan assign tidak ditemukan atau sudah diproses.');
    if (x.toUser !== me.userId) throw forbidden('Permintaan ini bukan untuk Anda.');
    const now = this.now();
    if (!accept) {
      if (!note?.trim()) throw badRequest('Alasan penolakan wajib diisi.');
      Object.assign(x, { status: 'REJECTED', responseNote: note.trim(), respondedDt: now });
      return void (await this.done(null));
    }
    const a = this.asset(x.assetNo);
    this.assertAssignable(a);
    this.assertNotFrozen(a.officeCd, x.toOffice);
    const toStatus: AssetStatus = a.status === 'UNDER_REPAIR' ? 'UNDER_REPAIR' : 'IN_USE';
    this.addHistory({
      assetNo: a.assetNo, action: x.assignType, fromUser: a.userId, toUser: x.toUser, fromOffice: a.officeCd, toOffice: x.toOffice,
      fromStatus: a.status, toStatus, reason: x.reason ?? 'Dikonfirmasi diterima oleh user', opnameId: null,
      createdBy: me.userId, createdDt: now,
    });
    Object.assign(a, { userId: x.toUser, officeCd: x.toOffice, status: toStatus });
    Object.assign(x, { status: 'CONFIRMED', respondedDt: now, responseNote: note?.trim() || null });
    await this.done(null);
  }

  async myPendingAssignments() {
    const me = this.me();
    return structuredClone(this.db.assignments.filter((x) => x.toUser === me.userId && x.status === 'PENDING'));
  }

  /* ------------------------------------------------------------- opname -- */

  async listOpnames(filter?: { officeCd?: string; status?: OpnameStatus }) {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    return structuredClone(
      this.db.opnames
        .filter((o) => this.canSeeOpname(o, me))
        .filter((o) => (!filter?.officeCd || o.officeCd === filter.officeCd) && (!filter?.status || o.status === filter.status))
        .sort((x, y) => y.period.localeCompare(x.period) || x.officeCd.localeCompare(y.officeCd))
        .map((o) => this.header(o)),
    );
  }

  async getOpname(opnameId: number): Promise<OpnameDetail> {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    const o = this.opname(opnameId);
    if (!this.canSeeOpname(o, me)) throw forbidden();
    const items = this.itemsOf(opnameId)
      .map(({ opnameId: _drop, ...i }) => ({ ...i, assetNm: i.assetNo ? this.asset(i.assetNo).assetNm : i.plusDesc ?? '' }))
      .sort((x, y) => (x.assetNo === null ? 1 : 0) - (y.assetNo === null ? 1 : 0) || (x.assetNo ?? '').localeCompare(y.assetNo ?? '') || x.opnameDId - y.opnameDId);
    return structuredClone({ ...this.header(o), items });
  }

  /** FR-06: buat sesi + snapshot asset kantor (status selain MISSING/DISPOSED). */
  async createOpname(officeCd: string): Promise<OpnameHeader> {
    const me = this.require('ADMIN_GA');
    const office = this.db.offices.find((o) => o.officeCd === officeCd);
    if (!office) throw badRequest('Kantor tidak valid.');
    if (this.activeOpname(officeCd)) throw businessError('BR-04', `${office.officeNm} masih punya sesi opname yang belum di-approve.`);
    const period = periodOf(this.clock());
    if (this.db.opnames.some((o) => o.officeCd === officeCd && o.period === period))
      throw businessError('DUPLICATE_PERIOD', `Sesi opname ${office.officeNm} untuk periode ${period} sudah ada.`);
    const now = this.now();
    const o: OpnameRow = {
      opnameId: this.db.nextId.opname++, officeCd, period, status: 'OPEN', qtySystem: 0, qtyFound: 0, qtyMinus: 0, qtyPlus: 0,
      createdBy: me.userId, createdDt: now, submittedBy: null, submittedDt: null, approvedBy: null, approvedDt: null,
    };
    this.db.opnames.push(o);
    this.db.assets
      .filter((a) => a.officeCd === officeCd && a.status !== 'MISSING' && a.status !== 'DISPOSED' && a.createdDt <= now)
      .sort((x, y) => x.assetNo.localeCompare(y.assetNo))
      .forEach((a) =>
        this.db.items.push({
          opnameDId: this.db.nextId.item++, opnameId: o.opnameId, assetNo: a.assetNo, sysCategoryCd: a.categoryCd,
          sysUserId: a.userId, sysOffice: a.officeCd, sysStatus: a.status, result: null, actualUserId: null, actualOffice: null,
          plusDesc: null, remark: null, checkedBy: null, checkedDt: null,
        }),
      );
    this.recalc(o);
    return this.done(this.header(o));
  }

  /** FR-07: simpan hasil cek satu asset (scan / input nomor). */
  async saveCheck(opnameId: number, assetNo: string, input: CheckInput) {
    const { me, o } = this.requireCheckable(opnameId);
    const item = this.db.items.find((i) => i.opnameId === opnameId && i.assetNo === assetNo);
    if (!item) throw notFound(`Asset ${assetNo} tidak ada di daftar opname ini. Bila barangnya ada secara fisik, catat sebagai temuan plus.`);
    if (input.result === 'BEDA_LOKASI' && !input.actualUserId && !input.actualOffice)
      throw badRequest('Untuk hasil "Beda lokasi / user", pilih user atau kantor aktual.');
    Object.assign<OpnameItemRow, Partial<OpnameItemRow>>(item, {
      result: input.result,
      actualUserId: input.result === 'BEDA_LOKASI' ? input.actualUserId ?? null : null,
      actualOffice: input.result === 'BEDA_LOKASI' ? input.actualOffice ?? null : null,
      remark: input.remark === undefined ? item.remark : input.remark?.trim() || null,
      checkedBy: input.result ? me.userId : null,
      checkedDt: input.result ? this.now() : null,
    });
    this.recalc(o);
    await this.done(null);
  }

  async markRemainingOk(opnameId: number) {
    const { me, o } = this.requireCheckable(opnameId);
    const now = this.now();
    const open = this.itemsOf(opnameId).filter((i) => i.assetNo !== null && i.result === null);
    open.forEach((i) => Object.assign(i, { result: 'SESUAI', checkedBy: me.userId, checkedDt: now }));
    this.recalc(o);
    return this.done(open.length);
  }

  /** FR-08: barang fisik tanpa nomor asset. */
  async addPlus(opnameId: number, input: PlusInput) {
    const { me, o } = this.requireCheckable(opnameId);
    const desc = input.plusDesc?.trim();
    if (!desc) throw badRequest('Nama / deskripsi barang wajib diisi.');
    if (!this.db.categories.some((c) => c.categoryCd === input.categoryCd)) throw badRequest('Kategori tidak valid.');
    this.db.items.push({
      opnameDId: this.db.nextId.item++, opnameId, assetNo: null, sysCategoryCd: input.categoryCd, sysUserId: null, sysOffice: null,
      sysStatus: null, result: 'PLUS', actualUserId: null, actualOffice: null, plusDesc: desc, remark: input.remark?.trim() || null,
      checkedBy: me.userId, checkedDt: this.now(),
    });
    this.recalc(o);
    await this.done(null);
  }

  /** BR-06: submit hanya bila semua asset sudah punya hasil cek. */
  async submitOpname(opnameId: number) {
    const { me, o } = this.requireCheckable(opnameId);
    const left = this.itemsOf(opnameId).filter((i) => i.assetNo !== null && i.result === null).length;
    if (left > 0) throw businessError('BR-06', `${left} asset belum dicek. Semua asset harus punya hasil cek sebelum submit.`);
    this.recalc(o);
    Object.assign(o, { status: 'SUBMITTED', submittedBy: me.userId, submittedDt: this.now() });
    await this.done(null);
  }

  /** FR-10 / BR-07: approve lalu terapkan hasil ke master asset. */
  async approveOpname(opnameId: number) {
    const me = this.require('ADMIN_GA');
    const o = this.opname(opnameId);
    if (o.status !== 'SUBMITTED') throw businessError('BR-06', 'Hanya sesi yang sudah di-submit yang bisa di-approve.');
    if (o.submittedBy === me.userId) throw businessError('SOD', 'Approver tidak boleh orang yang sama dengan yang men-submit hasil cek.');
    const now = this.now();
    // Header APPROVED lebih dulu agar freeze BR-04 terlepas (urutan sama dengan API & seed SQL).
    Object.assign(o, { status: 'APPROVED', approvedBy: me.userId, approvedDt: now });
    for (const i of this.itemsOf(opnameId)) {
      if (!i.assetNo || !i.result || i.result === 'SESUAI' || i.result === 'PLUS') continue;
      const a = this.asset(i.assetNo);
      let next: Partial<Asset>;
      if (i.result === 'TIDAK_DITEMUKAN') next = { status: 'MISSING', userId: null };
      else if (i.result === 'RUSAK') next = { status: 'UNDER_REPAIR', condition: 'RUSAK_RINGAN' };
      else {
        const userId = i.actualUserId ?? a.userId;
        next = { userId, officeCd: i.actualOffice ?? a.officeCd, status: userId ? (a.status === 'UNDER_REPAIR' ? 'UNDER_REPAIR' : 'IN_USE') : 'AVAILABLE' };
      }
      this.addHistory({
        assetNo: a.assetNo, action: i.result === 'BEDA_LOKASI' ? 'TRANSFER' : 'STATUS_CHANGE',
        fromUser: a.userId, toUser: next.userId === undefined ? a.userId : next.userId,
        fromOffice: a.officeCd, toOffice: next.officeCd ?? a.officeCd, fromStatus: a.status, toStatus: next.status ?? a.status,
        reason: `Hasil stock opname ${o.officeCd} ${o.period}: ${RESULT_LABEL[i.result]}${i.remark ? ` (${i.remark})` : ''}`,
        opnameId, createdBy: me.userId, createdDt: now,
      });
      Object.assign(a, next);
    }
    await this.done(null);
  }

  /* ---------------------------------------------------------- reporting -- */

  async dashboardSummary(officeCd?: string): Promise<DashboardSummary> {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    const office = me.roleCd === 'PIC' ? me.officeCd : officeCd;
    const offices = this.db.offices.map((o) => o.officeCd).filter((o) => !office || o === office);
    const assets = this.db.assets.filter((a) => offices.includes(a.officeCd) && a.status !== 'DISPOSED');
    const count = (s: AssetStatus) => assets.filter((a) => a.status === s).length;
    const approved = this.db.opnames.filter((o) => o.status === 'APPROVED' && offices.includes(o.officeCd));

    const byOffice: DashboardSummary['byOffice'] = [];
    for (const off of offices)
      for (const status of ['IN_USE', 'AVAILABLE', 'UNDER_REPAIR', 'MISSING'] as AssetStatus[])
        byOffice.push({ officeCd: off, status, qty: assets.filter((a) => a.officeCd === off && a.status === status).length });

    const lastOpname = offices.flatMap((off) => {
      const last = approved.filter((o) => o.officeCd === off).sort((x, y) => y.period.localeCompare(x.period))[0];
      return last
        ? [{ opnameId: last.opnameId, officeCd: off, period: last.period, qtySystem: last.qtySystem, qtyFound: last.qtyFound,
             qtyMinus: last.qtyMinus, qtyPlus: last.qtyPlus, isRed: last.qtyMinus > 0 }]
        : [];
    });

    return structuredClone({
      asOf: this.now(),
      kpi: { total: assets.length, inUse: count('IN_USE'), available: count('AVAILABLE'), underRepair: count('UNDER_REPAIR'), missing: count('MISSING') },
      byOffice,
      byCategory: this.db.categories.map((c) => ({ categoryCd: c.categoryCd, qty: assets.filter((a) => a.categoryCd === c.categoryCd).length })),
      lastOpname,
      trend: approved
        .map((o) => ({ period: o.period, officeCd: o.officeCd, qtyMinus: o.qtyMinus }))
        .sort((x, y) => x.period.localeCompare(y.period) || x.officeCd.localeCompare(y.officeCd)),
    });
  }

  /** FR-13: daftar asset minus + user terakhir (dari snapshot). */
  async minusItems(opnameId: number): Promise<MinusItem[]> {
    const me = this.require('ADMIN_GA', 'PIC', 'EXEC', 'AUDITOR');
    const o = this.opname(opnameId);
    if (!this.canSeeOpname(o, me)) throw forbidden();
    return structuredClone(
      this.itemsOf(opnameId)
        .filter((i) => i.result === 'TIDAK_DITEMUKAN' && i.assetNo)
        .map((i) => ({
          assetNo: i.assetNo!, assetNm: this.asset(i.assetNo!).assetNm, categoryCd: i.sysCategoryCd,
          lastUserId: i.sysUserId, lastUserNm: this.user(i.sysUserId)?.userNm ?? null, remark: i.remark,
        })),
    );
  }

  /** FR-13 versi demo: CSV (separator ;) yang bisa dibuka Excel. Versi produksi: xlsx/pdf dari API. */
  async exportVariance(opnameId?: number): Promise<FileDownload> {
    this.require('ADMIN_GA', 'EXEC', 'AUDITOR');
    const sessions = this.db.opnames
      .filter((o) => (opnameId ? o.opnameId === opnameId : o.status !== 'OPEN'))
      .sort((x, y) => y.period.localeCompare(x.period) || x.officeCd.localeCompare(y.officeCd));
    const rows: (string | number)[][] = [
      ['Periode', 'Kantor', 'Status sesi', 'Qty sistem', 'Qty fisik', 'Selisih minus', 'Temuan plus', 'Nomor asset minus', 'Nama asset', 'User terakhir', 'Catatan'],
    ];
    for (const o of sessions) {
      const officeNm = this.db.offices.find((x) => x.officeCd === o.officeCd)?.officeNm ?? o.officeCd;
      const base = [o.period, officeNm, o.status, o.qtySystem, o.qtyFound, o.qtyMinus, o.qtyPlus];
      const minus = this.itemsOf(o.opnameId).filter((i) => i.result === 'TIDAK_DITEMUKAN' && i.assetNo);
      if (!minus.length) rows.push([...base, '', '', '', '']);
      for (const i of minus)
        rows.push([...base, i.assetNo!, this.asset(i.assetNo!).assetNm, this.user(i.sysUserId)?.userNm ?? 'Stok kantor', i.remark ?? '']);
    }
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const suffix = opnameId ? `${sessions[0]?.officeCd ?? ''}-${sessions[0]?.period ?? ''}` : 'semua';
    return { fileName: `laporan-selisih-${suffix}.csv`, blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }) };
  }
}

export const seqKey = (office: string, cat: string, year: number) => `${office}-${cat}-${year}`;
export const formatAssetNo = (office: string, cat: string, year: number, seq: number) =>
  `AST-${office}-${cat}-${year}-${String(seq).padStart(4, '0')}`;
