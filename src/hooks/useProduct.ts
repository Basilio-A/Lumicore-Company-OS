import { useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/context/ProductsContext';

export function useProduct() {
  const { productSlug } = useParams();
  const { profile } = useAuth();
  const { products, loading, refresh } = useProducts();

  const product = products.find((p) => p.slug === productSlug) ?? null;
  const accessDenied = !loading && !product && profile?.role === 'employee';

  return { product, loading, accessDenied, reload: refresh };
}
