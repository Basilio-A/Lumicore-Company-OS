import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase, type Product, canManageProducts } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface ProductsState {
  products: Product[];
  loading: boolean;
  refresh: () => Promise<void>;
  upsertProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
}

const ProductsContext = createContext<ProductsState | null>(null);

function sortProducts(list: Product[]) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const upsertProduct = useCallback((product: Product) => {
    setProducts((prev) => {
      const index = prev.findIndex((p) => p.id === product.id);
      if (index === -1) return sortProducts([...prev, product]);
      const next = [...prev];
      next[index] = product;
      return sortProducts(next);
    });
  }, []);

  const removeProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    if (!profile) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (canManageProducts(profile.role) || profile.role === 'investor') {
      const { data } = await supabase.from('products').select('*').order('name');
      setProducts((data as Product[]) || []);
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from('product_members')
      .select('product_id')
      .eq('user_id', profile.id);
    const ids = (memberships || []).map((m) => m.product_id);
    if (ids.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('products').select('*').in('id', ids).order('name');
    setProducts((data as Product[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ products, loading, refresh, upsertProduct, removeProduct }),
    [products, loading, refresh, upsertProduct, removeProduct],
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
