import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, type Product } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export function useProduct() {
  const { productSlug } = useParams();
  const { profile } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const load = useCallback(async () => {
    if (!productSlug) {
      setProduct(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('slug', productSlug)
      .maybeSingle();
    if (!data) {
      setProduct(null);
      setLoading(false);
      return;
    }
    const p = data as Product;
    setProduct(p);

    // Check access for employees
    if (profile?.role === 'employee') {
      const { data: member } = await supabase
        .from('product_members')
        .select('id')
        .eq('product_id', p.id)
        .eq('user_id', profile.id)
        .maybeSingle();
      setAccessDenied(!member);
    } else {
      setAccessDenied(false);
    }
    setLoading(false);
  }, [productSlug, profile]);

  useEffect(() => {
    load();
  }, [load]);

  return { product, loading, accessDenied, reload: load };
}
