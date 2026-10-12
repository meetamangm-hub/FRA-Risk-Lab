import { ScenarioBar } from './components/ScenarioBar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { useStore, type Page } from './state/store';
import { Overview } from './pages/Overview';
import { Builder } from './pages/Builder';
import { RiskDefinition } from './pages/RiskDefinition';
import { VarLab } from './pages/VarLab';
import { Stress } from './pages/Stress';
import { Frontier } from './pages/Frontier';
import { DataPage } from './pages/DataPage';
import { Methodology } from './pages/Methodology';

const NAV: { id: Page; label: string }[] = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'builder', label: 'Portfolios' },
  { id: 'risk', label: '1 · Risk label' },
  { id: 'var', label: 'VaR lab' },
  { id: 'stress', label: '2 · Crisis vs calm' },
  { id: 'frontier', label: '3 · Allocation test' },
  { id: 'data', label: 'Data' },
  { id: 'method', label: 'Methodology' },
];

export function App() {
  const { page, setPage, setSettingsOpen, pending } = useStore();
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 32 32"><path d="M5 22l7-8 5 5 10-12" fill="none" stroke="#f2a541" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>FRA Risk Lab <small className="grp">Group 4 · FRA · Section A</small></span>
          </div>
          <nav className="nav" aria-label="Sections">
            {NAV.map((n) => (
              <button key={n.id} aria-current={page === n.id ? 'page' : undefined} onClick={() => setPage(n.id)}>{n.label}</button>
            ))}
          </nav>
          <button className="btn sm" onClick={() => setSettingsOpen(true)} aria-label="Open analysis settings">⚙ Settings</button>
        </div>
      </header>
      <ScenarioBar />
      <main className={`page ${pending ? 'pending' : ''}`}>
        {page === 'overview' && <Overview />}
        {page === 'builder' && <Builder />}
        {page === 'risk' && <RiskDefinition />}
        {page === 'var' && <VarLab />}
        {page === 'stress' && <Stress />}
        {page === 'frontier' && <Frontier />}
        {page === 'data' && <DataPage />}
        {page === 'method' && <Methodology />}
      </main>
      <SettingsDrawer />
    </>
  );
}
