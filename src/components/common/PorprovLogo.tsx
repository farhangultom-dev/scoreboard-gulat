import { useState } from 'react';

interface PorprovLogoProps {
  isMini?: boolean;
  className?: string;
}

/**
 * Logo resmi PORPROV X LAMPUNG 2026.
 * Memuat aset resmi `/porprov-logo.webp` di folder `public/`,
 * dan fallback ke lambang vektor SVG Siger Lampung + X apabila file belum tersedia.
 */
export default function PorprovLogo({
  isMini = false,
  className = '',
}: PorprovLogoProps) {
  const [hasImgError, setHasImgError] = useState(false);

  const boxSizeClass = isMini
    ? 'w-4 h-4 rounded-[2px] p-[1px]'
    : 'w-7 h-7 md:w-10 md:h-10 xl:w-12 xl:h-12 rounded-lg p-0.5 md:p-1';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white/95 shadow-sm border border-amber-400/60 ${boxSizeClass} ${className}`}
      title="Logo PORPROV X LAMPUNG 2026"
    >
      {!hasImgError ? (
        <img
          src="/porprov-logo.webp"
          alt="Logo Porprov X Lampung 2026"
          loading="eager"
          draggable={false}
          onError={() => setHasImgError(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <svg
          viewBox="0 0 64 64"
          aria-label="Logo Porprov X Lampung 2026"
          className="h-full w-full"
        >
          {/* Lingkaran perisai dasar */}
          <circle cx="32" cy="32" r="30" fill="#0f172a" stroke="#eab308" strokeWidth="3" />
          {/* Aksen pita warna olahraga (Merah - Biru - Hijau) */}
          <path d="M10 44 A24 24 0 0 0 54 44" fill="none" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
          <path d="M14 48 A22 22 0 0 0 50 48" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
          {/* Mahkota Siger Lampung Emas */}
          <path
            d="M12 24 L19 13 L25 20 L32 10 L39 20 L45 13 L52 24 L47 28 L17 28 Z"
            fill="#facc15"
            stroke="#b45309"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Angka Romawi X */}
          <path
            d="M22 33 L42 51 M42 33 L22 51"
            stroke="#ffffff"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <path
            d="M22 33 L42 51 M42 33 L22 51"
            stroke="#f59e0b"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}
