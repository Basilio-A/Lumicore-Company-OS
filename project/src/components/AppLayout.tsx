import { useEffect, useState, type ReactNode } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import { supabase, type Product } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { Logo } from '@/components/AuthShell';
import { CommandPalette } from '@/components/CommandPalette';
import { Avatar, Button, Input, Modal } from '@/components/ui';
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
  const [products, setProducts] = useState<Product[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);

  const isFounder = profile?.role === 'founder';
  const isInvestor = profile?.role === 'investor';

  const loadProducts = () => {
    supabase.from('products').select('*').order('name').then(({ data }) => {
      if (data) setProducts(data as Product[]);
    });
  };

  useEffect(() => { loadProducts(); }, []);

  useEffect(() => {
    if (productSlug) {
      const p = products.find((p) => p.slug === productSlug);
      setCurrentProduct(p || null);
    } else {
      setCurrentProduct(null);
    }
  }, [productSlug, products]);

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
      {/* Company header — logo only, no duplicate text */}
      <div className="p-3 border-b border-app">
        <button
          onClick={() => navigate('/overview')}
          className="w-full flex items-center gap-1.5 rounded-lg px-2.5 py-2 hover:surface-2 transition-colors"
        >
          <Logo size="sm" showWordmark={true} />
        </button>
      </div>

      {/* Products section */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between px-0.5 mb-1.5">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Products</span>
          {isFounder && (
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
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/product/${p.slug}/dashboard`)}
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
                {p.name[0]}
              </div>
              <span className="flex-1 text-left truncate">{p.name}</span>
            </button>
          ))}
          {products.length === 0 && (
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

      {/* User */}
      <div className="p-3 border-t border-app">
        <div className="flex items-center gap-2.5">
          <Avatar name={profile?.full_name || 'U'} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--text)] truncate">{profile?.full_name || 'User'}</div>
            <div className="text-xs text-muted truncate capitalize">{profile?.role}</div>
          </div>
          <button onClick={signOut} className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2" title="Sign out">
            <LogOut className="w-4 h-4" />
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
        {/* Topbar — search centered, utilities top-right */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 md:px-5 border-b border-app bg-[var(--surface)]">
          <button
            onClick={() => setMobileSidebar(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* Left spacer to center search on desktop */}
          <div className="hidden md:block w-32 shrink-0" />
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex-1 max-w-md mx-auto flex items-center gap-2 rounded-lg surface-2 px-3 py-1.5 text-sm text-muted hover:opacity-80 transition-opacity"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search or jump to…</span>
            <span className="sm:hidden">Search…</span>
            <kbd className="ml-auto hidden sm:inline text-[10px] surface rounded px-1.5 py-0.5">⌘K</kbd>
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

      {createProductOpen && (
        <CreateProductModal
          onClose={() => setCreateProductOpen(false)}
          onCreated={() => {
            setCreateProductOpen(false);
            loadProducts();
          }}
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

function ProductColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const PRESETS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#6C63FF', '#EC4899', '#14B8A6', '#F97316',
    '#8B5CF6', '#06B6D4', '#84CC16', '#E11D48',
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-lg transition-transform hover:scale-105 ${color === c ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)] ring-[var(--text)] scale-110' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <label className="w-7 h-7 rounded-lg border-2 border-dashed border-app flex items-center justify-center cursor-pointer hover:border-[var(--accent)] relative overflow-hidden" title="Custom">
          <span className="text-muted text-xs font-bold">+</span>
          <input type="color" value={color} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
        <input
          type="text"
          value={color}
          onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
          className="text-xs rounded surface-2 border border-app px-2 py-0.5 w-20 text-[var(--text)] focus:outline-none font-mono"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function CreateProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const generateSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    const finalSlug = slug.trim() || generateSlug(name);
    const { error } = await supabase.from('products').insert({
      name: name.trim(),
      slug: finalSlug,
      description: description.trim(),
      color,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreated();
  };

  return (
    <Modal open onClose={onClose} title="New Product">
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Name</label>
          <Input value={name} onChange={(e) => { setName(e.target.value); setSlug(generateSlug(e.target.value)); }} placeholder="Product name" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Slug</label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="url-slug" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this product do?" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-2">Color</label>
          <ProductColorPicker color={color} onChange={setColor} />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create'}</Button>
      </div>
    </Modal>
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
