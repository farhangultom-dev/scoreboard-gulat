import * as XLSX from 'xlsx';
import {
  Athlete,
  DivisionFormat,
  ExcelImportResult,
  ExcelParseError,
} from '../types/tournament';
import { AgeCategory, WrestlingStyle } from '../types/match';

/**
 * Mendeteksi format bagan resmi UWW berdasarkan jumlah peserta (N).
 * Sesuai aturan UWW:
 * - N = 2: Single Bout
 * - N = 3..5: Nordic System (Round-Robin Penuh)
 * - N = 6..7: 2-Pool Group + Cross Semifinal
 * - N >= 8: Direct Elimination with Single Repechage
 */
export function detectRecommendedFormat(athleteCount: number): DivisionFormat {
  if (athleteCount <= 2) {
    return 'SINGLE_BOUT';
  }
  if (athleteCount >= 3 && athleteCount <= 5) {
    return 'NORDIC';
  }
  if (athleteCount === 6 || athleteCount === 7) {
    return 'GROUP_CROSS';
  }
  return 'ELIMINATION_REPECHAGE';
}

/**
 * Normalisasi format kelas berat ke standar UWW "<angka> KG".
 * Menerima contoh: 74, "74", "74kg", "74 KG", "74.5", " 97 kg ".
 */
export function normalizeWeightClass(weightRaw: unknown): string {
  if (weightRaw === undefined || weightRaw === null) return '';
  const str = String(weightRaw).trim().toUpperCase();
  if (!str) return '';

  // Ekstrak angka bulat atau desimal
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (!match) return '';

  const numPart = match[1];
  return `${numPart} KG`;
}

/**
 * Normalisasi kode daerah kontingen (maksimal 5 huruf uppercase).
 * Jika kosong, otomatis membuat singkatan 3-4 huruf dari nama daerah asal.
 */
export function normalizeRegionCode(region: string, codeRaw?: unknown): string {
  if (codeRaw !== undefined && codeRaw !== null) {
    const customCode = String(codeRaw)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (customCode.length > 0) {
      return customCode.slice(0, 5);
    }
  }

  const cleanRegion = region.trim().toUpperCase().replace(/[^A-Z\s]/g, '');
  if (!cleanRegion) return 'KONT';

  const words = cleanRegion.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    // Ambil huruf pertama 3-4 kata (misal: "DAERAH KHUSUS IBUKOTA" -> "DKI")
    return words
      .map((w) => w[0])
      .join('')
      .slice(0, 5);
  }

  if (words.length === 2) {
    // Dua kata: misal "JAWA BARAT" -> "JBR" (J + 2 huruf kata kedua)
    const first = words[0][0];
    const second = words[1].replace(/[AEIOU]/g, '');
    const candidate = first + (second.length >= 2 ? second.slice(0, 2) : words[1].slice(0, 2));
    return candidate.slice(0, 4);
  }

  // 1 kata: misal "LAMPUNG" -> hapus vokal setelah huruf pertama atau ambil 3 huruf
  const firstChar = words[0][0];
  const restConsonants = words[0].slice(1).replace(/[AEIOU]/g, '');
  if (restConsonants.length >= 2) {
    return (firstChar + restConsonants).slice(0, 4);
  }
  return words[0].slice(0, 3);
}

/**
 * Normalisasi Kategori Usia UWW.
 */
export function normalizeAgeCategory(raw?: unknown): AgeCategory {
  if (!raw) return 'SENIOR';
  const val = String(raw).trim().toUpperCase();
  if (val === 'U23' || val === 'U20' || val === 'U17' || val === 'U15') {
    return val;
  }
  return 'SENIOR';
}

/**
 * Normalisasi Style Gulat (FS, GR, WW).
 */
export function normalizeStyle(raw?: unknown): WrestlingStyle | null {
  if (!raw) return null;
  const val = String(raw).trim().toUpperCase();
  if (val === 'FS' || val === 'FREESTYLE') return 'FS';
  if (val === 'GR' || val === 'GRECO' || val === 'GRECO-ROMAN') return 'GR';
  if (val === 'WW' || val === 'WOMEN' || val === "WOMEN'S") return 'WW';
  return null;
}

/**
 * Normalisasi Seed (1..4).
 */
export function normalizeSeed(raw?: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = parseInt(String(raw).trim(), 10);
  if (!isNaN(num) && num >= 1 && num <= 4) {
    return num;
  }
  return undefined;
}

/**
 * Validasi & normalisasi Nomor_Undian (Bola Fisik >= 1).
 * Mengembalikan:
 * - { value: undefined, isValid: true } jika kosong
 * - { value: number, isValid: true } jika bilangan bulat positif >= 1
 * - { value: undefined, isValid: false } jika tidak valid (<= 0, desimal, atau teks)
 */
export function parseDrawNumberCell(raw?: unknown): {
  value: number | undefined;
  isValid: boolean;
} {
  if (raw === undefined || raw === null) {
    return { value: undefined, isValid: true };
  }
  const str = String(raw).trim();
  if (str === '') {
    return { value: undefined, isValid: true };
  }
  if (!/^\d+$/.test(str)) {
    return { value: undefined, isValid: false };
  }
  const num = Number(str);
  if (!Number.isInteger(num) || num < 1) {
    return { value: undefined, isValid: false };
  }
  return { value: num, isValid: true };
}

/**
 * 8 baris contoh atlet valid resmi lintas gaya dan kelas untuk template Excel.
 * Kelas FS 74 KG menyertakan contoh pengisian Nomor_Undian bola fisik (1..4),
 * sedangkan kelas lainnya dikosongkan sebagai ilustrasi bahwa kolom Nomor_Undian bersifat opsional.
 */
export const SAMPLE_ATHLETE_TEMPLATE_ROWS = [
  {
    Nama_Atlet: 'Budi Santoso',
    Daerah_Asal: 'JAWA BARAT',
    Kode_Daerah: 'JBR',
    Style: 'FS',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '74 KG',
    Seed: 1,
    Nomor_Undian: 1,
  },
  {
    Nama_Atlet: 'Rahmat Hidayat',
    Daerah_Asal: 'JAWA TIMUR',
    Kode_Daerah: 'JTM',
    Style: 'FS',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '74 KG',
    Seed: 2,
    Nomor_Undian: 4,
  },
  {
    Nama_Atlet: 'Agus Setiawan',
    Daerah_Asal: 'DKI JAKARTA',
    Kode_Daerah: 'DKI',
    Style: 'FS',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '74 KG',
    Seed: '',
    Nomor_Undian: 2,
  },
  {
    Nama_Atlet: 'Ahmad Fauzi',
    Daerah_Asal: 'KALIMANTAN TIMUR',
    Kode_Daerah: 'KTM',
    Style: 'FS',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '74 KG',
    Seed: '',
    Nomor_Undian: 3,
  },
  {
    Nama_Atlet: 'Dewi Lestari',
    Daerah_Asal: 'JAWA TENGAH',
    Kode_Daerah: 'JTG',
    Style: 'WW',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '53 KG',
    Seed: 1,
    Nomor_Undian: '',
  },
  {
    Nama_Atlet: 'Siti Rahma',
    Daerah_Asal: 'SUMATERA BARAT',
    Kode_Daerah: 'SMB',
    Style: 'WW',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '53 KG',
    Seed: 2,
    Nomor_Undian: '',
  },
  {
    Nama_Atlet: 'Eko Yulianto',
    Daerah_Asal: 'LAMPUNG',
    Kode_Daerah: 'LPG',
    Style: 'GR',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '67 KG',
    Seed: 1,
    Nomor_Undian: '',
  },
  {
    Nama_Atlet: 'Dimas Pratama',
    Daerah_Asal: 'PAPUA',
    Kode_Daerah: 'PPA',
    Style: 'GR',
    Kategori_Usia: 'SENIOR',
    Kelas_Berat: '67 KG',
    Seed: '',
    Nomor_Undian: '',
  },
];

/**
 * Menghasilkan file Template_Atlet_UWW.xlsx dan memicu pengunduhan di browser.
 */
export function downloadAthleteTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ATHLETE_TEMPLATE_ROWS);

  // Atur lebar kolom agar rapi
  ws['!cols'] = [
    { wch: 25 }, // Nama_Atlet
    { wch: 20 }, // Daerah_Asal
    { wch: 14 }, // Kode_Daerah
    { wch: 10 }, // Style
    { wch: 16 }, // Kategori_Usia
    { wch: 14 }, // Kelas_Berat
    { wch: 10 }, // Seed
    { wch: 15 }, // Nomor_Undian
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Template_Atlet');
  XLSX.writeFile(wb, 'Template_Atlet_UWW.xlsx');
}

/**
 * Memetakan nama header secara toleran (abaikan spasi, underscore, huruf besar/kecil).
 */
function normalizeHeaderKey(rawHeader: string): string {
  const clean = rawHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['namaatlet', 'nama', 'athlete', 'athletename', 'wrestler'].includes(clean)) {
    return 'name';
  }
  if (['daerahasal', 'daerah', 'kontingen', 'provinsi', 'region', 'team'].includes(clean)) {
    return 'region';
  }
  if (['kodedaerah', 'kode', 'kodedaerahasal', 'regioncode', 'teamcode'].includes(clean)) {
    return 'regionCode';
  }
  if (['style', 'gaya', 'wrestlingstyle'].includes(clean)) {
    return 'style';
  }
  if (['kategoriusia', 'usia', 'age', 'agecategory', 'kategori'].includes(clean)) {
    return 'ageCategory';
  }
  if (['kelasberat', 'berat', 'weight', 'weightclass', 'kelas'].includes(clean)) {
    return 'weightClass';
  }
  if (['seed', 'unggulan', 'seeding'].includes(clean)) {
    return 'seed';
  }
  if (
    [
      'nomorundian',
      'noundian',
      'draw',
      'drawnumber',
      'bola',
      'nomorbola',
      'nobola',
      'undian',
    ].includes(clean)
  ) {
    return 'drawNumber';
  }
  return clean;
}

/**
 * Parsing file Excel / CSV atlet gulat dengan validasi toleran & deteksi duplikasi.
 */
export async function parseAthleteExcel(
  fileOrBuffer: File | ArrayBuffer | Uint8Array
): Promise<ExcelImportResult> {
  let arrayBuffer: ArrayBuffer;

  if (typeof File !== 'undefined' && fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    arrayBuffer = fileOrBuffer;
  } else {
    // Uint8Array or Buffer
    const u8 = fileOrBuffer as Uint8Array;
    arrayBuffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return {
      validAthletes: [],
      errors: [{ row: 1, field: 'File', reason: 'File Excel kosong atau tidak memiliki lembar kerja' }],
      duplicateWarnings: [],
    };
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  const validAthletes: Omit<Athlete, 'id'>[] = [];
  const errors: ExcelParseError[] = [];
  const duplicateWarnings: string[] = [];

  // Peta untuk mendeteksi duplikat nama per divisi: `${style}_${ageCategory}_${weightClass}` -> { name, row }[]
  const divisionRosterMap = new Map<string, { name: string; row: number }[]>();
  // Peta untuk mendeteksi duplikat Nomor_Undian per divisi: `${style}_${ageCategory}_${weightClass}` -> Map<drawNumber, { name, row }>
  const divisionDrawMap = new Map<
    string,
    Map<number, { name: string; row: number }>
  >();
  // Menyimpan metadata baris untuk pengecekan batas atas Nomor_Undian > N setelah seluruh baris dibaca
  const parsedAthleteMeta: Array<{
    athlete: Omit<Athlete, 'id'>;
    excelRow: number;
    divisionKey: string;
  }> = [];

  rawRows.forEach((row, index) => {
    const excelRow = index + 2; // Baris 1 adalah header, baris data mulai dari 2

    // Normalisasi kunci header
    const normalizedRow: Record<string, unknown> = {};
    Object.keys(row).forEach((key) => {
      const normalizedKey = normalizeHeaderKey(key);
      normalizedRow[normalizedKey] = row[key];
    });

    // Validasi 1: Nama_Atlet (Wajib)
    const rawName = String(normalizedRow['name'] ?? '').trim();
    if (!rawName) {
      errors.push({
        row: excelRow,
        field: 'Nama_Atlet',
        reason: 'Nama atlet wajib diisi dan tidak boleh kosong',
      });
      return;
    }

    // Validasi 2: Daerah_Asal (Wajib)
    const rawRegion = String(normalizedRow['region'] ?? '').trim();
    if (!rawRegion) {
      errors.push({
        row: excelRow,
        field: 'Daerah_Asal',
        reason: 'Daerah asal wajib diisi',
      });
      return;
    }

    // Validasi 3: Style (Wajib: FS, GR, WW)
    const styleVal = normalizeStyle(normalizedRow['style']);
    if (!styleVal) {
      errors.push({
        row: excelRow,
        field: 'Style',
        reason: `Style "${normalizedRow['style']}" tidak valid. Hanya menerima FS, GR, atau WW`,
      });
      return;
    }

    // Validasi 4: Kelas_Berat (Wajib)
    const weightVal = normalizeWeightClass(normalizedRow['weightClass']);
    if (!weightVal) {
      errors.push({
        row: excelRow,
        field: 'Kelas_Berat',
        reason: `Kelas berat "${normalizedRow['weightClass']}" tidak valid. Contoh: "74" atau "74 KG"`,
      });
      return;
    }

    // Field Opsional
    const ageVal = normalizeAgeCategory(normalizedRow['ageCategory']);
    const regionCodeVal = normalizeRegionCode(rawRegion, normalizedRow['regionCode']);
    const seedVal = normalizeSeed(normalizedRow['seed']);

    // Validasi 5 (Opsional): Nomor_Undian (Bola Fisik)
    const drawParsed = parseDrawNumberCell(normalizedRow['drawNumber']);
    if (!drawParsed.isValid) {
      errors.push({
        row: excelRow,
        field: 'Nomor_Undian',
        reason: `Nomor_Undian "${normalizedRow['drawNumber']}" tidak valid. Wajib berupa bilangan bulat positif (>= 1) atau dikosongkan`,
      });
      return;
    }

    const divisionKey = `${styleVal}_${ageVal}_${weightVal}`;
    const drawNumberVal = drawParsed.value;

    // Cek Duplikasi Nomor_Undian dalam kategori yang sama (Tolak baris jika duplikat)
    if (drawNumberVal !== undefined) {
      const divDraws =
        divisionDrawMap.get(divisionKey) ||
        new Map<number, { name: string; row: number }>();
      const existingHolder = divDraws.get(drawNumberVal);
      if (existingHolder) {
        errors.push({
          row: excelRow,
          field: 'Nomor_Undian',
          reason: `Nomor_Undian #${drawNumberVal} pada atlet "${rawName}" duplikat dengan "${existingHolder.name}" (Baris ${existingHolder.row}) di kelas ${styleVal} ${ageVal} ${weightVal}`,
        });
        return;
      }
      divDraws.set(drawNumberVal, { name: rawName, row: excelRow });
      divisionDrawMap.set(divisionKey, divDraws);
    }

    // Cek Duplikasi Nama dalam kategori yang sama
    const existingInDivision = divisionRosterMap.get(divisionKey) || [];
    const lowerName = rawName.toLowerCase();
    const duplicateEntry = existingInDivision.find(
      (e) => e.name.toLowerCase() === lowerName
    );

    if (duplicateEntry) {
      duplicateWarnings.push(
        `[Baris ${excelRow}] Atlet "${rawName}" terduplikasi dengan baris ${duplicateEntry.row} pada kategori ${styleVal} ${ageVal} ${weightVal}`
      );
    }
    existingInDivision.push({ name: rawName, row: excelRow });
    divisionRosterMap.set(divisionKey, existingInDivision);

    const athleteObj: Omit<Athlete, 'id'> = {
      name: rawName,
      region: rawRegion.toUpperCase(),
      regionCode: regionCodeVal,
      style: styleVal,
      ageCategory: ageVal,
      weightClass: weightVal,
      seed: seedVal,
      ...(drawNumberVal !== undefined ? { drawNumber: drawNumberVal } : {}),
    };

    validAthletes.push(athleteObj);
    parsedAthleteMeta.push({
      athlete: athleteObj,
      excelRow,
      divisionKey,
    });
  });

  // Peringatan (warnings) jika Nomor_Undian melebihi jumlah atlet yang ada di kelas tersebut pada file ini
  for (const item of parsedAthleteMeta) {
    const drawNum = item.athlete.drawNumber;
    if (drawNum !== undefined) {
      const totalInDivision =
        divisionRosterMap.get(item.divisionKey)?.length ?? 0;
      if (drawNum > totalInDivision) {
        duplicateWarnings.push(
          `[Baris ${item.excelRow}] Nomor_Undian #${drawNum} pada atlet "${item.athlete.name}" melebihi jumlah peserta (${totalInDivision} atlet) di kelas ${item.athlete.style} ${item.athlete.ageCategory} ${item.athlete.weightClass}`
        );
      }
    }
  }

  return {
    validAthletes,
    errors,
    duplicateWarnings,
  };
}
