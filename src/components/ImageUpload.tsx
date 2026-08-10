import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
  bucket: 'avatars' | 'product-logos';
  value: string | null;
  onChange: (url: string | null) => void;
  shape?: 'circle' | 'square';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  /** preview placeholder when empty */
  placeholder?: React.ReactNode;
  className?: string;
}

export function ImageUpload({
  bucket,
  value,
  onChange,
  shape = 'square',
  size = 'md',
  label = 'Upload image',
  placeholder,
  className,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const sizeClasses = { sm: 'w-14 h-14', md: 'w-20 h-20', lg: 'w-28 h-28' };
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  const upload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5 MB)');
      return;
    }
    setUploading(true);
    setError('');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  };

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={cn('flex items-end gap-3', className)}>
      {/* Preview / trigger */}
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          'relative shrink-0 overflow-hidden border-2 border-dashed border-app transition-colors',
          'hover:border-[var(--accent)] hover:surface-2 cursor-pointer',
          sizeClasses[size],
          shapeClass,
          'flex items-center justify-center bg-[var(--surface-2)]'
        )}
        title={label}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        ) : value ? (
          <img
            src={value}
            alt="upload preview"
            className={cn('w-full h-full object-cover', shapeClass)}
            onError={() => onChange(null)}
          />
        ) : (
          placeholder ?? <Upload className="w-5 h-5 text-muted" />
        )}

        {/* Remove button — only when has value */}
        {value && !uploading && (
          <button
            type="button"
            onClick={remove}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </button>

      {/* Text label + clear */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          className="text-xs accent hover:underline disabled:opacity-50"
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : value ? 'Change image' : label}
        </button>
        {value && (
          <button
            type="button"
            onClick={remove}
            className="block text-xs text-muted hover:text-rose-500 transition-colors mt-0.5"
          >
            Remove
          </button>
        )}
        {error && <p className="text-xs text-rose-500 mt-0.5">{error}</p>}
        <p className="text-[10px] text-muted mt-0.5">PNG, JPG, WebP · max 5 MB</p>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </div>
  );
}
