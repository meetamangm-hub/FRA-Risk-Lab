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
import { Viva } from './pages/Viva';

const NAV: { id: Page; label: string }[] = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'builder', label: 'Portfolio Builder' },
  { id: 'risk', label: 'Risk Definition' },
  { id: 'var', label: 'VaR Lab' },
  { id: 'stress', label: 'Crisis vs Calm' },
  { id: 'frontier', label: 'Efficient Frontier' },
  { id: 'data', label: 'Data' },
  { id: 'method', label: 'Methodology' },
  { id: 'viva', label: 'Viva Prep' },
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
            <span>FRA Risk Lab</span>
          </div>
          <nav className="nav" aria-label="Sections">
            {NAV.map((n) => (
              <button key={n.id} aria-current={page === n.id ? 'page' : undefined} onClick={() => setPage(n.id)}>{n.label}</button>
            ))}
          </nav>
          <button className="btn sm" onClick={() => setSettingsOpen(true)} aria-label="Open analysis settings">⚙ Settings</button>
        </div>
      </header>
      <main className={`page ${pending ? 'pending' : ''}`}>
        {page === 'overview' && <Overview />}
        {page === 'builder' && <Builder />}
        {page === 'risk' && <RiskDefinition />}
        {page === 'var' && <VarLab />}
        {page === 'stress' && <Stress />}
        {page === 'frontier' && <Frontier />}
        {page === 'data' && <DataPage />}
        {page === 'method' && <Methodology />}
        {page === 'viva' && <Viva />}
      </main>
      <SettingsDrawer />
    </>
  );
}
