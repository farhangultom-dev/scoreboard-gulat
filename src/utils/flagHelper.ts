/**
 * Menormalisasi Kode_Daerah agar aman dipakai sebagai nama file URL statis.
 * Contoh: " lpg " -> "LPG", "jawa-barat" -> "JAWA-BARAT"
 */
export function normalizeRegionCode(code?: string | null): string {
  if (!code) return '';
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

/**
 * Mengembalikan URL aset gambar bendera/logo daerah di /flags/<KODE>.png,
 * atau null apabila kode daerah kosong.
 */
export function getRegionFlagUrl(code?: string | null): string | null {
  const normalized = normalizeRegionCode(code);
  if (!normalized) return null;
  return `/flags/${normalized}.png`;
}
