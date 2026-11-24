import { useEffect, useState } from 'react';
import { getRegionFlagUrl, normalizeRegionCode } from '../../utils/flagHelper';

export type RegionFlagSize = 'xs' | 'sm' | 'md' | 'lg' | 'tv' | 'winner';

export interface RegionFlagProps {
  code?: string | null;
  regionName?: string;
  size?: RegionFlagSize;
  showFallbackText?: boolean;
  className?: string;
  /** Opsional: override ukuran/padding wadah secara eksplisit (misal untuk banner intro TV proporsional) */
  overrideBoxClass?: string;
}

const SIZE_CLASSES: Record<RegionFlagSize, string> = {
  xs: 'h-5 w-7 text-[9px]',
  sm: 'h-6 w-8 text-[10px]',
  md: 'h-8 w-11 text-xs',
  lg: 'h-12 w-16 text-sm',
  tv: 'h-16 w-24 text-lg',
  winner: 'h-24 w-32 text-2xl',
};

/**
 * Komponen bendera/logo kontingen daerah berbasis aset statis (/flags/<KODE>.png).
 * - Selalu membungkus gambar di wadah netral terang (bg-white/95) dengan object-contain
 *   agar lambang perisai daerah tetap tajam dan tidak terpotong di latar gelap/merah/biru.
 * - Mereset status hasError setiap kali prop code berubah agar pergantian partai langsung
 *   menampilkan logo jika tersedia, dan fallback ke badge teks rapi bila belum ada file .png.
 */
export default function RegionFlag({
  code,
  regionName,
  size = 'md',
  showFallbackText = true,
  className = '',
  overrideBoxClass,
}: RegionFlagProps) {
  const normalizedCode = normalizeRegionCode(code);
  const flagUrl = getRegionFlagUrl(normalizedCode);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [normalizedCode]);

  const sizeClass = overrideBoxClass || SIZE_CLASSES[size];
  const labelText = regionName || normalizedCode;

  if (flagUrl && !hasError) {
    return (
      <span
        title={labelText}
        className={`region-flag inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-white/95 p-0.5 shadow-sm ${sizeClass} ${className}`}
      >
        <img
          src={flagUrl}
          alt={labelText}
          loading="eager"
          draggable={false}
          onError={() => setHasError(true)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  if (!showFallbackText || !normalizedCode) {
    return null;
  }

  return (
    <span
      title={labelText}
      className={`region-flag inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-slate-700/90 px-1 text-white font-bold tracking-wider uppercase select-none ${sizeClass} ${className}`}
    >
      <span className="truncate">{normalizedCode}</span>
    </span>
  );
}
