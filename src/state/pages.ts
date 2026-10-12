export type Page = 'overview' | 'builder' | 'risk' | 'var' | 'stress' | 'frontier' | 'data' | 'method';
export const PAGES: Page[] = ['overview', 'builder', 'risk', 'var', 'stress', 'frontier', 'data', 'method'];
/** Unknown or retired hashes fall back to the dashboard instead of a blank page. */
export const toPage = (h: string): Page => (PAGES.includes(h as Page) ? (h as Page) : 'overview');
