import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  detectRecommendedFormat,
  normalizeWeightClass,
  normalizeRegionCode,
  parseAthleteExcel,
  SAMPLE_ATHLETE_TEMPLATE_ROWS,
} from './excelImporter';

describe('excelImporter - Domain Functions', () => {
  it('detectRecommendedFormat follows official UWW rules based on N', () => {
    expect(detectRecommendedFormat(2)).toBe('SINGLE_BOUT');
    expect(detectRecommendedFormat(3)).toBe('NORDIC');
    expect(detectRecommendedFormat(4)).toBe('NORDIC');
    expect(detectRecommendedFormat(5)).toBe('NORDIC');
    expect(detectRecommendedFormat(6)).toBe('GROUP_CROSS');
    expect(detectRecommendedFormat(7)).toBe('GROUP_CROSS');
    expect(detectRecommendedFormat(8)).toBe('ELIMINATION_REPECHAGE');
    expect(detectRecommendedFormat(16)).toBe('ELIMINATION_REPECHAGE');
  });

  it('normalizeWeightClass standardizes numeric and string inputs to "<num> KG"', () => {
    expect(normalizeWeightClass(74)).toBe('74 KG');
    expect(normalizeWeightClass('74')).toBe('74 KG');
    expect(normalizeWeightClass('74kg')).toBe('74 KG');
    expect(normalizeWeightClass(' 74.5 KG ')).toBe('74.5 KG');
    expect(normalizeWeightClass('')).toBe('');
    expect(normalizeWeightClass(null)).toBe('');
    expect(normalizeWeightClass('none')).toBe('');
  });

  it('normalizeRegionCode extracts code or falls back cleanly', () => {
    expect(normalizeRegionCode('LAMPUNG', 'LPG')).toBe('LPG');
    expect(normalizeRegionCode('JAWA TIMUR', 'JTM123')).toBe('JTM12');
    expect(normalizeRegionCode('JAWA BARAT')).toBe('JBR');
    expect(normalizeRegionCode('DAERAH KHUSUS IBUKOTA')).toBe('DKI');
    expect(normalizeRegionCode('BALI')).toBe('BAL');
  });

  it('parses valid template rows without errors', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ATHLETE_TEMPLATE_ROWS);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseAthleteExcel(u8);
    expect(result.errors).toHaveLength(0);
    expect(result.validAthletes).toHaveLength(8);
    expect(result.validAthletes[0]).toMatchObject({
      name: 'Budi Santoso',
      region: 'JAWA BARAT',
      regionCode: 'JBR',
      style: 'FS',
      ageCategory: 'SENIOR',
      weightClass: '74 KG',
      seed: 1,
    });
  });

  it('catches invalid styles and missing required fields with proper row numbers', async () => {
    const invalidRows = [
      {
        Nama_Atlet: '', // Kosong (Error row 2)
        Daerah_Asal: 'JABAR',
        Style: 'FS',
        Kelas_Berat: '74',
      },
      {
        Nama_Atlet: 'John Doe',
        Daerah_Asal: '', // Kosong (Error row 3)
        Style: 'FS',
        Kelas_Berat: '74',
      },
      {
        Nama_Atlet: 'Alex',
        Daerah_Asal: 'BALI',
        Style: 'MMA', // Invalid style (Error row 4)
        Kelas_Berat: '74',
      },
      {
        Nama_Atlet: 'Steve',
        Daerah_Asal: 'BALI',
        Style: 'FS',
        Kelas_Berat: '', // Invalid weight (Error row 5)
      },
      {
        Nama_Atlet: 'Valid Guy',
        Daerah_Asal: 'SUMUT',
        Style: 'GR',
        Kelas_Berat: '87',
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(invalidRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseAthleteExcel(u8);
    expect(result.validAthletes).toHaveLength(1);
    expect(result.validAthletes[0].name).toBe('Valid Guy');
    expect(result.errors).toHaveLength(4);
    expect(result.errors[0]).toEqual({
      row: 2,
      field: 'Nama_Atlet',
      reason: 'Nama atlet wajib diisi dan tidak boleh kosong',
    });
    expect(result.errors[1]).toEqual({
      row: 3,
      field: 'Daerah_Asal',
      reason: 'Daerah asal wajib diisi',
    });
    expect(result.errors[2]).toEqual({
      row: 4,
      field: 'Style',
      reason: 'Style "MMA" tidak valid. Hanya menerima FS, GR, atau WW',
    });
    expect(result.errors[3]).toEqual({
      row: 5,
      field: 'Kelas_Berat',
      reason: 'Kelas berat "" tidak valid. Contoh: "74" atau "74 KG"',
    });
  });

  it('detects duplicate athletes within the same division and flags warning', async () => {
    const duplicateRows = [
      {
        Nama_Atlet: 'Budi Santoso',
        Daerah_Asal: 'JABAR',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '74 KG',
      },
      {
        Nama_Atlet: 'Budi Santoso', // Duplicate in FS SENIOR 74 KG
        Daerah_Asal: 'JABAR',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '74 KG',
      },
      {
        Nama_Atlet: 'Budi Santoso', // Different weight -> Not duplicate
        Daerah_Asal: 'JABAR',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '86 KG',
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(duplicateRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseAthleteExcel(u8);
    expect(result.validAthletes).toHaveLength(3);
    expect(result.duplicateWarnings).toHaveLength(1);
    expect(result.duplicateWarnings[0]).toContain('Atlet "Budi Santoso" terduplikasi');
  });

  it('supports optional Nomor_Undian column (with aliases), rejects duplicate draw numbers per class, and warns if > N', async () => {
    const rowsWithDraw = [
      {
        Nama_Atlet: 'Atlet Satu',
        Daerah_Asal: 'JAWA BARAT',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '74 KG',
        Nomor_Undian: 2,
      },
      {
        Nama_Atlet: 'Atlet Dua',
        Daerah_Asal: 'JAWA TIMUR',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '74 KG',
        Nomor_Undian: 1,
      },
      {
        Nama_Atlet: 'Atlet Tiga (Duplikat Bola #2)',
        Daerah_Asal: 'DKI JAKARTA',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '74 KG',
        Nomor_Undian: 2, // Duplikat di kelas yang sama (Baris 4)
      },
      {
        Nama_Atlet: 'Atlet Empat (Bola #10 > N)',
        Daerah_Asal: 'LAMPUNG',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '74 KG',
        Nomor_Undian: 10, // Valid integer tapi > jumlah atlet di kelas ini -> warning (Baris 5)
      },
      {
        Nama_Atlet: 'Atlet Lima (Bola #0 Invalid)',
        Daerah_Asal: 'BALI',
        Style: 'FS',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '74 KG',
        Nomor_Undian: 0, // Invalid < 1 -> error (Baris 6)
      },
      {
        Nama_Atlet: 'Atlet Kelas Lain (Bola #2 Boleh)',
        Daerah_Asal: 'BANTEN',
        Style: 'GR',
        Kategori_Usia: 'SENIOR',
        Kelas_Berat: '67 KG',
        Nomor_Undian: 2, // Kelas berbeda -> sah!
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rowsWithDraw);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseAthleteExcel(u8);

    // 4 atlet valid (Baris 2, 3, 5, dan 7)
    expect(result.validAthletes).toHaveLength(4);
    expect(result.validAthletes[0].drawNumber).toBe(2);
    expect(result.validAthletes[1].drawNumber).toBe(1);
    expect(result.validAthletes[2].drawNumber).toBe(10);
    expect(result.validAthletes[3].drawNumber).toBe(2);

    // 2 baris error: Baris 4 (duplikat #2) dan Baris 6 (angka 0 tidak valid)
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].row).toBe(4);
    expect(result.errors[0].field).toBe('Nomor_Undian');
    expect(result.errors[0].reason).toContain('duplikat');

    expect(result.errors[1].row).toBe(6);
    expect(result.errors[1].field).toBe('Nomor_Undian');

    // Warning karena Nomor_Undian #10 dan #2 melebihi jumlah peserta di kelasnya
    expect(
      result.duplicateWarnings.some((w) =>
        w.includes('Nomor_Undian #10 pada atlet "Atlet Empat (Bola #10 > N)" melebihi jumlah peserta')
      )
    ).toBe(true);
  });
});
