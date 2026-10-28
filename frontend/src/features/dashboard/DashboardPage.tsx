import { useEffect, useState } from 'react';
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip, type ChartOptions } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useApp, useLoad } from '../../app/AppContext';
import { Icon, type IconName } from '../../components/Icon';
import { Banner, ErrorBox, Loading, PageHead } from '../../components/ui';
import { longDate, periodLabel, shortOffice, STATUS_LABEL } from '../../domain/labels';
import type { AssetStatus } from '../../api/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** Render ulang grafik saat tema light/dark berubah. */
function useThemeKey() {
  const [k, setK] = useState(0);
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setK((x) => x + 1);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return k;
}

/** SCR-01 Dashboard: FR-11, FR-12, BR-08. */
export function DashboardPage() {
  const { api, me, officeNm, categories, categoryNm } = useApp();
  const themeKey = useThemeKey();
  const { data: s, error, loading, reload } = useLoad(() => api.dashboardSummary(), [me.userId]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !s) return <Loading />;
  if (!s) return null;

  const offices = [...new Set(s.byOffice.map((b) => b.officeCd))];
  const short = (cd: string) => shortOffice(officeNm(cd));
  const red = s.lastOpname.filter((o) => o.isRed);
  const lastPeriod = s.lastOpname.map((o) => o.period).sort().at(-1);
  const totalMinus = red.reduce((t, o) => t + o.qtyMinus, 0);

  const ink = css('--ink');
  const muted = css('--muted');
  const line = css('--line');
  ChartJS.defaults.color = muted;
  ChartJS.defaults.borderColor = line;
  ChartJS.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
  ChartJS.defaults.font.weight = 600;
  const base: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', color: ink, padding: 14 } },
      tooltip: { backgroundColor: ink, titleColor: css('--surface'), bodyColor: css('--surface'), padding: 10, cornerRadius: 10, boxPadding: 4 },
    },
  };
  const gx = { grid: { display: false }, border: { display: false } };
  const gy = { grid: { color: line }, border: { display: false }, beginAtZero: true, ticks: { precision: 0 } };
  const bar = { borderRadius: 8, borderSkipped: false as const, maxBarThickness: 34 };

  const opData = offices.map((o) => s.lastOpname.find((x) => x.officeCd === o) ?? { qtySystem: 0, qtyFound: 0, qtyMinus: 0, isRed: false });
  const periods = [...new Set(s.trend.map((t) => t.period))].sort();
  const pal = [css('--c1'), css('--c4'), css('--c2')];
  const stCol: Partial<Record<AssetStatus, string>> = { IN_USE: css('--ok'), AVAILABLE: css('--c2'), UNDER_REPAIR: css('--warn'), MISSING: css('--minus') };

  const kpi = (n: number, l: string, ic: IconName, bg: string, col: string, alert = false) => (
    <div className={`kpi${alert ? ' alert' : ''}`}>
      <div className="ic" style={{ background: bg, color: col }}>
        <Icon name={ic} />
      </div>
      <div>
        <div className="n">{n}</div>
        <div className="l">{l}</div>
      </div>
    </div>
  );

  return (
    <div key={themeKey}>
      <PageHead
        hello={longDate(new Date())}
        title="Dashboard asset"
        desc={me.roleCd === 'PIC' ? `Ringkasan asset ${officeNm(me.officeCd)}.` : 'Total asset dan hasil stock opname terakhir di semua kantor.'}
      />
      {red.length ? (
        <Banner tone="bad">
          <strong>Selisih minus {totalMinus} asset</strong> pada opname terakhir:{' '}
          {red.map((o) => `${officeNm(o.officeCd)} (${o.qtyMinus}, ${periodLabel(o.period)})`).join(', ')}. Asset tercatat di sistem tetapi tidak ditemukan fisiknya.
        </Banner>
      ) : (
        <Banner tone="good">Opname {lastPeriod ? periodLabel(lastPeriod) : ''}: semua asset ditemukan, tidak ada selisih minus.</Banner>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="ic">
            <Icon name="box" />
          </div>
          <div>
            <div className="n">{s.kpi.total}</div>
            <div className="l">Total asset</div>
          </div>
        </div>
        {kpi(s.kpi.inUse, 'Dipakai user', 'user', 'var(--ok-soft)', 'var(--ok)')}
        {kpi(s.kpi.available, 'Tersedia di stok', 'stock', 'var(--info-soft)', 'var(--info)')}
        {kpi(s.kpi.underRepair, 'Dalam perbaikan', 'wrench', 'var(--warn-soft)', 'var(--warn)')}
        {kpi(s.kpi.missing, 'Hilang', 'missing', 'var(--minus-soft)', 'var(--minus)', s.kpi.missing > 0)}
      </div>

      <div className="grid-auto">
        <div className="card">
          <h3>Data sistem vs fisik</h3>
          <p className="sub">Opname terakhir per kantor. Batang merah = ada asset tidak ditemukan (BR-08).</p>
          <div className="chartbox">
            <Bar
              data={{
                labels: offices.map(short),
                datasets: [
                  { label: 'Data di sistem', data: opData.map((o) => o.qtySystem), backgroundColor: css('--c3'), ...bar },
                  { label: 'Fisik ditemukan', data: opData.map((o) => o.qtyFound), backgroundColor: opData.map((o) => (o.isRed ? css('--c5') : css('--c1'))), ...bar },
                ],
              }}
              options={{
                ...base,
                scales: { x: gx, y: gy },
                plugins: {
                  ...base.plugins,
                  tooltip: { ...base.plugins!.tooltip, callbacks: { afterBody: (it) => (opData[it[0].dataIndex].qtyMinus ? `Selisih minus: ${opData[it[0].dataIndex].qtyMinus}` : 'Tidak ada selisih') } },
                },
              }}
            />
          </div>
        </div>
        <div className="card">
          <h3>Tren selisih minus</h3>
          <p className="sub">Jumlah asset tidak ditemukan per periode opname.</p>
          <div className="chartbox">
            <Line
              data={{
                labels: periods.map(periodLabel),
                datasets: offices.map((o, i) => ({
                  label: short(o),
                  data: periods.map((p) => s.trend.find((t) => t.period === p && t.officeCd === o)?.qtyMinus ?? null),
                  borderColor: pal[i % 3],
                  backgroundColor: pal[i % 3],
                  tension: 0.35,
                  borderWidth: 2.5,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  spanGaps: true,
                })),
              }}
              options={{ ...(base as ChartOptions<'line'>), scales: { x: gx, y: { ...gy, suggestedMax: 3, title: { display: true, text: 'Asset minus' } } } }}
            />
          </div>
        </div>
        <div className="card">
          <h3>Asset per kantor</h3>
          <p className="sub">Komposisi status saat ini.</p>
          <div className="chartbox">
            <Bar
              data={{
                labels: offices.map(short),
                datasets: (Object.keys(stCol) as AssetStatus[]).map((st) => ({
                  label: STATUS_LABEL[st],
                  data: offices.map((o) => s.byOffice.find((b) => b.officeCd === o && b.status === st)?.qty ?? 0),
                  backgroundColor: stCol[st],
                  borderRadius: 4,
                  borderSkipped: false,
                  maxBarThickness: 28,
                })),
              }}
              options={{ ...base, indexAxis: 'y', scales: { x: { ...gy, stacked: true }, y: { ...gx, stacked: true } } }}
            />
          </div>
        </div>
        <div className="card">
          <h3>Asset per kategori</h3>
          <p className="sub">Tidak termasuk asset yang sudah dihapus.</p>
          <div className="chartbox">
            <Doughnut
              data={{
                labels: categories.map((c) => categoryNm(c.categoryCd)),
                datasets: [
                  {
                    data: categories.map((c) => s.byCategory.find((b) => b.categoryCd === c.categoryCd)?.qty ?? 0),
                    backgroundColor: [css('--c1'), css('--c2'), css('--c3'), css('--c4'), css('--ok')],
                    borderColor: css('--surface'),
                    borderWidth: 3,
                    hoverOffset: 6,
                  },
                ],
              }}
              options={{ ...(base as unknown as ChartOptions<'doughnut'>), cutout: '64%', plugins: { ...(base.plugins as ChartOptions<'doughnut'>['plugins']), legend: { ...base.plugins!.legend, position: 'right' } as never } }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
