import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ItemBrowser } from './components/ItemBrowser';
import { ItemDetail } from './components/ItemDetail';
import { RunMonitor } from './components/RunMonitor';
import { ConfigPanel } from './components/ConfigPanel';
import { ScanPanel } from './components/ScanPanel';
import { MergePanel } from './components/MergePanel';
import { ReviewQueue } from './components/ReviewQueue';
import { OntologyBrowser } from './components/OntologyBrowser';
import { VectorStoreManager } from './components/VectorStoreManager';
import { LineageGraph } from './components/LineageGraph';
import type { RegPulseItem, RegPulseConfig, RunRecord, DashboardStats } from '@regpulse/shared';
import { getConfig, getItems, getRuns, clearData } from './lib/api-client';

// Default config (server overrides)
const defaultConfig: RegPulseConfig = {
  time_window_days: 90,
  jurisdictions: ['EU', 'UN_ECE', 'DE', 'FR', 'UK', 'ES', 'IT', 'CZ', 'PL'],
  allowed_domains: [
    'unece.org',
    'globalautoregs.com',
    'futurium.ec.europa.eu',
    'commission.europa.eu',
    'digital-strategy.ec.europa.eu',
    'ec.europa.eu',
    'eur-lex.europa.eu',
    'op.europa.eu',
    'gesetze-im-internet.de',
    'legifrance.gouv.fr',
    'legislation.gov.uk',
    'rdw.nl',
    'vca.gov.uk',
    'edpb.europa.eu',
    'bfdi.bund.de',
    'bsi.bund.de',
    'cnil.fr',
    'enisa.europa.eu',
    'wiki.unece.org',
    'www.gov.uk',
    'kba.de',
    'utac.com',
    'idiada.com',
    'vda.de'
  ],
  openai_api_key_configured: false,
  openai_model: 'gpt-5.2',
  reasoning_effort: 'medium',
  confidence_min: 0.7,
  auto_schedule_enabled: false,
  schedule_cron: '0 6 * * *'
};

const emptyStats: DashboardStats = {
  total_items: 0,
  items_by_jurisdiction: {
    EU: 0,
    UN_ECE: 0,
    DE: 0,
    FR: 0,
    UK: 0,
    GLOBAL: 0,
    ES: 0,
    IT: 0,
    CZ: 0,
    PL: 0
  },
  items_by_status: {
    proposed: 0,
    adopted: 0,
    in_force: 0,
    repealed: 0,
    unknown: 0,
  },
  items_by_priority: {
    P0: 0,
    P1: 0,
    P2: 0,
  },
  last_run: null,
  pending_review: 0,
  quarantined: 0,
};

export function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedItem, setSelectedItem] = useState<RegPulseItem | null>(null);
  const [config, setConfig] = useState<RegPulseConfig>(defaultConfig);
  const [items, setItems] = useState<RegPulseItem[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [stats, setStats] = useState<DashboardStats>(emptyStats);

  const refreshAll = useCallback(async () => {
    try {
      const [cfg, itemsRes, runsRes] = await Promise.all([
        getConfig(),
        getItems(),
        getRuns()
      ]);

      setConfig(prev => ({
        ...prev,
        allowed_domains: cfg.allowed_domains,
        openai_api_key_configured: cfg.openai_configured,
        reasoning_effort: cfg.reasoning_effort,
        confidence_min: cfg.confidence_min,
        openai_model: cfg.openai_model
      }));

      setItems(itemsRes.items as RegPulseItem[]);
      setRuns(runsRes.runs as RunRecord[]);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const newStats: DashboardStats = {
      total_items: items.length,
      items_by_jurisdiction: {
        EU: items.filter(i => i.jurisdiction === 'EU').length,
        UN_ECE: items.filter(i => i.jurisdiction === 'UN_ECE').length,
        DE: items.filter(i => i.jurisdiction === 'DE').length,
        FR: items.filter(i => i.jurisdiction === 'FR').length,
        UK: items.filter(i => i.jurisdiction === 'UK').length,
        GLOBAL: items.filter(i => i.jurisdiction === 'GLOBAL').length,
        ES: items.filter(i => i.jurisdiction === 'ES').length,
        IT: items.filter(i => i.jurisdiction === 'IT').length,
        CZ: items.filter(i => i.jurisdiction === 'CZ').length,
        PL: items.filter(i => i.jurisdiction === 'PL').length,
      },
      items_by_status: {
        proposed: items.filter(i => i.status === 'proposed').length,
        adopted: items.filter(i => i.status === 'adopted').length,
        in_force: items.filter(i => i.status === 'in_force').length,
        repealed: items.filter(i => i.status === 'repealed').length,
        unknown: items.filter(i => i.status === 'unknown').length,
      },
      items_by_priority: {
        P0: items.filter(i => i.priority === 'P0').length,
        P1: items.filter(i => i.priority === 'P1').length,
        P2: items.filter(i => i.priority === 'P2').length,
      },
      last_run: runs[0] || null,
      pending_review: items.filter(i => i.confidence < 0.8).length,
      quarantined: items.filter(i => i.confidence < 0.5).length,
    };
    setStats(newStats);
  }, [items, runs]);

  const handleItemClick = (item: RegPulseItem) => {
    setSelectedItem(item);
  };

  const handleCloseDetail = () => {
    setSelectedItem(null);
  };

  const handleClearData = async () => {
    await clearData();
    await refreshAll();
  };

  const handleNavigateToBrowser = () => {
    setCurrentView('browser');
  };

  const panelClass = (view: string) => (currentView === view ? '' : 'hidden');

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-8">
          <section className={panelClass('dashboard')} aria-hidden={currentView !== 'dashboard'}>
            <Dashboard
              stats={stats}
              items={items}
              onItemClick={handleItemClick}
              onClearData={handleClearData}
            />
          </section>

          <section className={panelClass('browser')} aria-hidden={currentView !== 'browser'}>
            <ItemBrowser items={items} onItemClick={handleItemClick} onRefresh={refreshAll} />
          </section>

          <section className={panelClass('scan')} aria-hidden={currentView !== 'scan'}>
            <ScanPanel
              apiConfigured={config.openai_api_key_configured}
              onAfterScan={refreshAll}
            />
          </section>

          <section className={panelClass('merge')} aria-hidden={currentView !== 'merge'}>
            <MergePanel
              apiConfigured={config.openai_api_key_configured}
              onAfterMerge={refreshAll}
            />
          </section>

          <section className={panelClass('runs')} aria-hidden={currentView !== 'runs'}>
            <RunMonitor
              runs={runs}
              apiConfigured={config.openai_api_key_configured}
              onAfterRun={refreshAll}
            />
          </section>

          <section className={panelClass('review')} aria-hidden={currentView !== 'review'}>
            <ReviewQueue onAfterDecision={refreshAll} onNavigateToBrowser={handleNavigateToBrowser} />
          </section>

          <section className={panelClass('ontology')} aria-hidden={currentView !== 'ontology'}>
            <OntologyBrowser />
          </section>

          <section className={panelClass('vector-store')} aria-hidden={currentView !== 'vector-store'}>
            <VectorStoreManager />
          </section>

          <section className={panelClass('lineage')} aria-hidden={currentView !== 'lineage'}>
            <LineageGraph />
          </section>

          <section className={panelClass('config')} aria-hidden={currentView !== 'config'}>
            <ConfigPanel config={config} onRefresh={refreshAll} />
          </section>
        </div>
      </main>

      {selectedItem && (
        <ItemDetail item={selectedItem} onClose={handleCloseDetail} />
      )}

      <div className="fixed bottom-4 right-4 z-40">
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ${
          config.openai_api_key_configured
            ? 'bg-green-500 text-white'
            : 'bg-yellow-500 text-yellow-900'
        }`}>
          <span className={`h-2 w-2 rounded-full ${
            config.openai_api_key_configured ? 'bg-green-200' : 'bg-yellow-200'
          }`} />
          {config.openai_api_key_configured ? 'OpenAI 已连接' : 'OpenAI 未配置'}
        </div>
      </div>
    </div>
  );
}
