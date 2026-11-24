import { Corner } from '../types/match';

/**
 * Menghasilkan label kiri atas sesuai standar layar UWW (misal: "S87" untuk Senior 87 KG,
 * "U20 74" untuk U20 74 KG).
 */
export function formatAgeWeightCode(
  ageCategory: string,
  weightClass: string
): string {
  const weightDigits = weightClass.replace(/\s*KG/i, '').trim() || weightClass;
  const ageUpper = (ageCategory || 'SENIOR').toUpperCase();
  if (ageUpper === 'SENIOR') {
    return `S${weightDigits}`;
  }
  return `${ageUpper} ${weightDigits}`;
}

/**
 * Mengekstrak angka nomor partai untuk trapesium tengah (misal: "BOUT 64" -> "64").
 */
export function formatBoutDigits(boutNumber: string): string {
  const digits = boutNumber.replace(/[^0-9]/g, '');
  if (digits) return digits;
  const trimmed = (boutNumber || '').trim().toUpperCase();
  return !trimmed || trimmed === 'BOUT' ? '1' : boutNumber;
}

/**
 * Mengembalikan nama gaya gulat untuk sisi kanan atas layar UWW.
 */
export function formatFullStyleName(style: string): string {
  switch (style) {
    case 'FS':
      return 'Freestyle';
    case 'GR':
      return 'Greco-Roman';
    case 'WW':
      return "Women's";
    default:
      return style;
  }
}

/**
 * Mengembalikan kelas gradien merah/biru resmi papan skor UWW Arena.
 */
export function getCornerGradientClass(corner: Corner): string {
  return corner === 'RED'
    ? 'bg-gradient-to-b from-[#d80000] via-[#b80000] to-[#7a0000]'
    : 'bg-gradient-to-b from-[#0022e0] via-[#0018b8] to-[#000c7a]';
}
