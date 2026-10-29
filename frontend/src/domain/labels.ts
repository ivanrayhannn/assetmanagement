import type { AssetStatus, CheckResult, HistoryAction, RoleCd } from '../api/types';

/* Label tampilan Bahasa Indonesia untuk kode yang disimpan UPPER_SNAKE di database. */

export const STATUS_LABEL: Record<AssetStatus, string> = {
  AVAILABLE: 'Tersedia',
  IN_USE: 'Dipakai',
  UNDER_REPAIR: 'Perbaikan',
  MISSING: 'Hilang',
  DISPOSED: 'Dihapus',
};
export const STATUSES = Object.keys(STATUS_LABEL) as AssetStatus[];

export const RESULT_LABEL: Record<CheckResult, string> = {
  SESUAI: 'Sesuai',
  BEDA_LOKASI: 'Beda lokasi / user',
  RUSAK: 'Rusak',
  TIDAK_DITEMUKAN: 'Tidak ditemukan',
  PLUS: 'Temuan plus',
};
export const CHECK_RESULTS: Exclude<CheckResult, 'PLUS'>[] = ['SESUAI', 'BEDA_LOKASI', 'RUSAK', 'TIDAK_DITEMUKAN'];

export const ACTION_LABEL: Record<HistoryAction, string> = {
  REGISTER: 'Registrasi',
  ASSIGN: 'Diserahkan',
  TRANSFER: 'Mutasi',
  RETURN: 'Dikembalikan',
  STATUS_CHANGE: 'Perubahan status',
};

export const ROLE_LABEL: Record<RoleCd, string> = {
  ADMIN_GA: 'Admin GA',
  PIC: 'PIC Kantor',
  USER: 'User',
  EXEC: 'Executive',
  AUDITOR: 'Internal Auditor',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const periodLabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const longDate = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;

/** '2026-09-07T10:00:00' -> '7 Sep 2026, 10:00' */
export const dateTimeLabel = (iso: string) => {
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-');
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}${t && t !== '00:00:00' ? ', ' + t.slice(0, 5) : ''}`;
};
export const dateLabel = (iso: string) => dateTimeLabel(iso.slice(0, 10));

export const shortOffice = (nm: string) => nm.replace(/^Kantor (Pusat |Cabang )?/, '');

export const initials = (n: string) =>
  n
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
