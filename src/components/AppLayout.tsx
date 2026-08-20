import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useParams, useNavigate, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  KanbanSquare,
  GitBranch,
  FileText,
  BookOpen,
  MessageSquare,
  Users,
  Building2,
  TrendingUp,
  PieChart,
  Layers,
  Award,
  Search,
  Sun,
  Moon,
  DollarSign,
  LogOut,
  Check,
  Plus,
  Menu,
  X,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { type Product, canManageProducts } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { useProducts } from '@/context/ProductsContext';
import { Logo } from '@/components/AuthShell';
import { CommandPalette } from '@/components/CommandPalette';
import { AIAssistant } from '@/components/AIAssistant';
import { Avatar, Button } from '@/components/ui';
import { ProductEditor } from '@/components/ProductEditor';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme, currency, toggleCurrency } = usePrefs();
  const { productSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { products, loading: productsLoading } = useProducts();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const currentProductIdRef = useRef<string | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [lockedProductSlug, setLockedProductSlug] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('lumicore.activeProductSlug');
    } catch {
      return null;
    }
  });

  const isFounder = profile?.role === 'founder';
  const isInvestor = profile?.role === 'investor';
  const canEditProducts = canManageProducts(profile?.role);

  const lockProduct = (slug: string) => {
    setLockedProductSlug(slug);
    try {
      sessionStorage.setItem('lumicore.activeProductSlug', slug);
    } catch {
      /* ignore */
    }
  };

  const exitProduct = () => {
    setLockedProductSlug(null);
    try {
      sessionStorage.removeItem('lumicore.activeProductSlug');
    } catch {
      /* ignore */
    }
    navigate('/overview');
  };

  useEffect(() => {
    if (productSlug) lockProduct(productSlug);
  }, [productSlug]);

  useEffect(() => {
    if (location.pathname === '/overview') {
      setLockedProductSlug(null);
      try {
        sessionStorage.removeItem('lumicore.activeProductSlug');
      } catch {
        /* ignore */
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    const activeSlug = productSlug || lockedProductSlug;
    if (!activeSlug) {
      setCurrentProduct(null);
      currentProductIdRef.current = null;
      return;
    }

    let found = products.find((p) => p.slug === activeSlug) || null;
    if (!found && currentProductIdRef.current) {
      found = products.find((p) => p.id === currentProductIdRef.current) || null;
      if (found && productSlug && found.slug !== productSlug) {
        lockProduct(found.slug);
        const nextPath = location.pathname.replace(
          `/product/${productSlug}/`,
          `/product/${found.slug}/`,
        );
        if (nextPath !== location.pathname) navigate(nextPath, { replace: true });
      }
    }

    if (!found && productSlug && !productsLoading && currentProductIdRef.current) {
      navigate('/overview', { replace: true });
    }

    setCurrentProduct(found);
    currentProductIdRef.current = found?.id ?? null;
  }, [productSlug, lockedProductSlug, products, productsLoading, location.pathname, navigate]);

  useEffect(() => { setMobileSidebar(false); }, [location.pathname]);

  // Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const productNav: NavItem[] = currentProduct
    ? [
        { to: `/product/${currentProduct.slug}/dashboard`, label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: `/product/${currentProduct.slug}/tasks`, label: 'Task Board', icon: KanbanSquare },
        { to: `/product/${currentProduct.slug}/sprints`, label: 'Sprints', icon: GitBranch },
        { to: `/product/${currentProduct.slug}/docs`, label: 'Docs', icon: FileText },
        { to: `/product/${currentProduct.slug}/knowledge-base`, label: 'Knowledge Base', icon: BookOpen },
      ]
    : [];

  const companyNav: NavItem[] = isInvestor
    ? [{ to: '/company/investors', label: 'Investor Portal', icon: TrendingUp }]
    : [
        { to: '/company/team-hub', label: 'Team Hub', icon: Building2 },
        { to: '/company/employee-of-the-month', label: 'Employee of the Month', icon: Award },
        ...(isFounder
          ? [
              { to: '/company/investors', label: 'Investor Portal', icon: TrendingUp as LucideIcon },
              { to: '/company/financials', label: 'Financials', icon: DollarSign as LucideIcon },
              { to: '/company/equity', label: 'Equity', icon: PieChart as LucideIcon },
              { to: '/company/tech-stack', label: 'Tech Stack', icon: Layers as LucideIcon },
            ]
          : []),
      ];

  const sidebarContent = (
    <>
      {/* Company header â€” logo only, no duplicate text */}
      <div className="p-3 border-b border-app">
        <button
          onClick={exitProduct}
          className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-2 hover:surface-2 transition-colors"
          title="Back to company overview"
        >
          <Logo size="sm" showWordmark={true} />
        </button>
      </div>

      {/* Products section */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between px-0.5 mb-1.5">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Products</span>
          {canEditProducts && (
            <button
              onClick={() => setCreateProductOpen(true)}
              className="p-0.5 rounded text-muted hover:text-[var(--accent)] hover:surface-2 transition-colors"
              title="Add product"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {products
            .filter((p) => p.status !== 'archived' || p.id === currentProduct?.id)
            .map((p) => (
            <button
              key={p.id}
              onClick={() => {
                lockProduct(p.slug);
                navigate(`/product/${p.slug}/dashboard`);
              }}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                currentProduct?.id === p.id
                  ? 'accent-tint-bg accent font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:surface-2'
              )}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: p.color }}
              >
                {p.logo_url ? (
                  <img src={p.logo_url} alt="" className="w-5 h-5 rounded object-cover" />
                ) : (
                  p.name[0]
                )}
              </div>
              <span className="flex-1 text-left truncate">{p.name}</span>
              {p.status === 'archived' && (
                <span className="text-[9px] uppercase tracking-wide text-muted">Archived</span>
              )}
            </button>
          ))}
          {products.filter((p) => p.status !== 'archived').length === 0 && (
            <div className="text-xs text-muted px-2.5 py-2">No products yet</div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {currentProduct && <NavSection title="Product" items={productNav} />}
        {currentProduct && (
          <NavSection
            title="People"
            items={[
              { to: `/product/${currentProduct.slug}/chat`, label: 'Chat', icon: MessageSquare },
              { to: `/product/${currentProduct.slug}/team`, label: 'Team', icon: Users },
            ]}
          />
        )}
        <NavSection title="Company" items={companyNav} />
      </nav>

      {/* User row */}
      <div className="p-3 border-t border-app">
        {/* Clickable profile area â†’ /settings */}
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:surface-2 transition-colors group text-left"
        >
          <Avatar name={profile?.full_name || 'U'} src={profile?.avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--text)] truncate leading-tight">
              {profile?.full_name || 'User'}
            </div>
            <div className="text-[10px] text-muted truncate capitalize">{profile?.role}</div>
          </div>
          {/* Settings gear â€” visible on hover */}
          <Settings className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>

        {/* Settings + Sign out row */}
        <div className="flex items-center gap-1 mt-1 px-1">
          <button
            onClick={() => navigate('/settings')}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted hover:text-[var(--text)] hover:surface-2 transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
          <div className="w-px h-4 surface-2" />
          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted hover:text-rose-500 hover:surface-2 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen flex bg-[var(--bg)] overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="w-60 shrink-0 hidden md:flex flex-col border-r border-app bg-[var(--surface)]">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      {mobileSidebar && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileSidebar(false)} />
          <aside className="relative w-60 flex flex-col border-r border-app bg-[var(--surface)] animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar â€” search centered, utilities top-right */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 md:px-5 border-b border-app bg-[var(--surface)]">
          <button
            onClick={() => setMobileSidebar(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={exitProduct}
            className="flex items-center rounded-lg px-1.5 py-1 hover:surface-2 transition-colors shrink-0"
            title="Back to company overview"
          >
            <Logo size="sm" showWordmark={true} />
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex-1 max-w-md mx-auto flex items-center gap-2 rounded-lg surface-2 px-3 py-1.5 text-sm text-muted hover:opacity-80 transition-opacity"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search or jump toâ€¦</span>
            <span className="sm:hidden">Searchâ€¦</span>
            <kbd className="ml-auto hidden sm:inline text-[10px] surface rounded px-1.5 py-0.5">âŒ˜K</kbd>
          </button>
          {/* Right-side utilities */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={toggleCurrency}
              className="flex items-center gap-1 rounded-lg surface-2 px-2.5 py-1.5 text-xs font-medium text-[var(--text)] hover:opacity-80 transition-opacity"
              title="Toggle currency"
            >
              <DollarSign className="w-3.5 h-3.5" />
              {currency}
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2 transition-colors"
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <AIAssistant />

      {createProductOpen && (
        <ProductEditor
          product={null}
          onClose={() => setCreateProductOpen(false)}
          onSaved={() => setCreateProductOpen(false)}
        />
      )}
    </div>
  );
}

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <div className="px-2.5 mb-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">{title}</div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                isActive ? 'accent-tint-bg accent font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:surface-2'
              )
            }
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function PageContainer({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  return (
    <div className="animate-fade-in">
      {(title || actions) && (
        <div className="px-4 md:px-8 pt-6 pb-4 flex items-center justify-between gap-3 flex-wrap">
          {title && <h1 className="text-xl font-display font-semibold text-[var(--text)]">{title}</h1>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="px-4 md:px-8 pb-8">{children}</div>
    </div>
  );
}
