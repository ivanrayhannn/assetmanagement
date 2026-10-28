import { useEffect, useState } from 'react';
import { TABS_BY_ROLE, useApp, type TabKey } from './app/AppContext';
import { Shell } from './app/Shell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AssetListPage } from './features/assets/AssetListPage';
import { TrackingPage } from './features/tracking/TrackingPage';
import { OpnamePage } from './features/opname/OpnamePage';
import { VariancePage } from './features/reports/VariancePage';

/* Routing berbasis hash (#/opname) agar jalan di GitHub Pages & IIS tanpa rewrite rule. */
const readHash = () => window.location.hash.replace(/^#\/?/, '') as TabKey;

export default function App() {
  const { me } = useApp();
  const tabs = TABS_BY_ROLE[me.roleCd];
  const [tab, setTab] = useState<TabKey>(() => (tabs.includes(readHash()) ? readHash() : tabs[0]));

  useEffect(() => {
    if (!tabs.includes(tab)) setTab(tabs[0]);
  }, [tabs, tab]);

  useEffect(() => {
    const onHash = () => {
      const h = readHash();
      if (tabs.includes(h)) setTab(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [tabs]);

  const go = (t: TabKey) => {
    setTab(t);
    window.history.replaceState(null, '', `#/${t}`);
    window.scrollTo(0, 0);
  };

  const current = tabs.includes(tab) ? tab : tabs[0];
  return (
    <Shell tab={current} onTab={go}>
      {current === 'dashboard' && <DashboardPage />}
      {current === 'assets' && <AssetListPage />}
      {current === 'tracking' && <TrackingPage />}
      {current === 'opname' && <OpnamePage onGo={go} />}
      {current === 'laporan' && <VariancePage onGo={go} />}
    </Shell>
  );
}
