import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type Currency = 'USD' | 'ETB';
type Theme = 'light' | 'dark';

interface Prefs {
  currency: Currency;
  theme: Theme;
  setCurrency: (c: Currency) => void;
  toggleCurrency: () => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(() => {
    return (localStorage.getItem('lumicore_currency') as Currency) || 'USD';
  });
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('lumicore_theme') as Theme) || 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('lumicore_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lumicore_currency', currency);
  }, [currency]);

  const value = useMemo<Prefs>(
    () => ({
      currency,
      theme,
      setCurrency,
      toggleCurrency: () => setCurrency((c) => (c === 'USD' ? 'ETB' : 'USD')),
      setTheme,
      toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    }),
    [currency, theme]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
}
