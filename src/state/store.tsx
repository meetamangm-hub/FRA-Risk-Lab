import { createContext, useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import pricesCsv from '../data/prices.csv?raw';
import { parseBenchmarkCsv, parsePricesCsv } from '../engine/data';
import { analyse, defaultConfig, type Analysis, type Config } from '../engine/model';
import type { Benchmark, Dataset } from '../engine/types';

const KEY = 'fra-risk-lab:config:v1';
import { toPage, type Page } from './pages';
export type { Page };

const bundled: Dataset = parsePricesCsv(pricesCsv, 'Project workbook (02_Historical_Data)');

function sanitise(raw: unknown): Config | null {
  try {
    const c = raw as Config;
    const d = defaultConfig();
    if (!c || !c.holdings || !c.windows || !c.investment) return null;
    return {
      ...d, ...c,
      investment: { ...d.investment, ...c.investment },
      windows: { ...d.windows, ...c.windows },
      risk: { ...d.risk, ...c.risk, compositeWeights: { ...d.risk.compositeWeights, ...(c.risk?.compositeWeights ?? {}) } },
    };
  } catch { return null; }
}

function readStored(): Config {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const c = sanitise(JSON.parse(s)); if (c) return c; }
  } catch { /* storage unavailable: fall back to defaults */ }
  return defaultConfig();
}

interface Store {
  config: Config;
  setConfig: (f: (c: Config) => Config) => void;
  resetAll: () => void;
  loadConfig: (c: unknown) => string | null;
  dataset: Dataset;
  setDataset: (d: Dataset | null) => void;
  usingBundled: boolean;
  benchmark: Benchmark | null;
  setBenchmark: (b: Benchmark | null) => void;
  analysis: Analysis;
  pending: boolean;
  page: Page;
  setPage: (p: Page) => void;
  settingsOpen: boolean;
  setSettingsOpen: (b: boolean) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store missing');
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [config, setCfg] = useState<Config>(readStored);
  const [custom, setCustom] = useState<Dataset | null>(null);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [page, setPage] = useState<Page>(() => toPage(location.hash.slice(1)));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dataset = custom ?? bundled;

  useEffect(() => { location.hash = page; }, [page]);
  useEffect(() => {
    const h = () => setPage(toPage(location.hash.slice(1)));
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(config)); } catch { /* ignore */ }
  }, [config]);

  // Optional benchmark shipped with the site: public/data/benchmark.csv  (Date,Close)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/benchmark.csv`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => setBenchmark(parseBenchmarkCsv(t, 'Nifty 50 (bundled)')))
      .catch(() => { /* none bundled: beta stays "not available" */ });
  }, []);

  const deferred = useDeferredValue(config);
  const dataKey = custom ? `custom:${custom.dates.length}:${custom.dates[0]}:${custom.dates[custom.dates.length - 1]}` : 'bundled';
  const analysis = useMemo(() => analyse(deferred, dataset, benchmark, dataKey), [deferred, dataset, benchmark, dataKey]);

  const value: Store = {
    config,
    setConfig: (f) => setCfg((c) => f(c)),
    resetAll: () => setCfg(defaultConfig()),
    loadConfig: (raw) => {
      const c = sanitise(raw);
      if (!c) return 'This file is not a valid configuration.';
      setCfg(c);
      return null;
    },
    dataset, setDataset: setCustom, usingBundled: !custom,
    benchmark, setBenchmark,
    analysis, pending: deferred !== config,
    page, setPage, settingsOpen, setSettingsOpen,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
