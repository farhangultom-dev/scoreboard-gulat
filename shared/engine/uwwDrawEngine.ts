import { Athlete } from '../types/tournament';

export interface DrawOptions {
  separateSameRegion?: boolean;
}

/**
 * Mengundi nomor undian resmi UWW (1..N) untuk daftar atlet dalam suatu kategori.
 *
 * Mengikuti Aturan Resmi UWW:
 * 1. Penempatan Unggulan (Seeding):
 *    - Seed 1: Selalu menempati nomor undian 1 (bagian teratas bagan).
 *    - Seed 2: Selalu menempati nomor undian N (bagian terbawah bagan).
 *    - Seed 3: Menempati separuh bawah (misal posisi awal kuadran bawah).
 *    - Seed 4: Menempati separuh atas (misal posisi akhir kuadran atas).
 * 2. Pengacakan Atlet Non-Unggulan:
 *    - Menggunakan algoritma Fisher-Yates shuffle untuk mengisi nomor undian yang tersisa.
 * 3. Pemisahan Daerah Asal Sama (separateSameRegion):
 *    - Melakukan optimisasi swap pass agar dua atlet dari kontingen/daerah yang sama
 *      tidak langsung berhadapan di partai babak pertama (Round 1 / Pasangan ganjil-genap).
 */
export function generateOfficialDraw(
  athletes: Athlete[],
  options: DrawOptions = { separateSameRegion: true }
): Athlete[] {
  const n = athletes.length;
  if (n <= 1) {
    return athletes.map((a, idx) => ({ ...a, drawNumber: idx + 1 }));
  }

  const assignedMap = new Map<number, Athlete>();
  const availableSlots = new Set<number>();
  for (let i = 1; i <= n; i++) {
    availableSlots.add(i);
  }

  // 1. Tentukan posisi unggulan (Seeds)
  const seededAthletes = athletes
    .filter((a) => a.seed && a.seed >= 1 && a.seed <= 4)
    .sort((a, b) => (a.seed || 0) - (b.seed || 0));

  const unseededAthletes = athletes.filter(
    (a) => !a.seed || a.seed < 1 || a.seed > 4
  );

  // Penempatan Seed 1 di #1
  const seed1 = seededAthletes.find((a) => a.seed === 1);
  if (seed1 && availableSlots.has(1)) {
    assignedMap.set(1, seed1);
    availableSlots.delete(1);
  }

  // Penempatan Seed 2 di #N
  const seed2 = seededAthletes.find((a) => a.seed === 2);
  if (seed2 && availableSlots.has(n)) {
    assignedMap.set(n, seed2);
    availableSlots.delete(n);
  }

  // Penempatan Seed 3 & 4 jika ada dan N >= 4
  if (n >= 4) {
    const seed3 = seededAthletes.find((a) => a.seed === 3);
    const seed4 = seededAthletes.find((a) => a.seed === 4);

    // Seed 3 di awal paruh kedua (Math.floor(n / 2) + 1)
    const slotSeed3 = Math.floor(n / 2) + 1;
    if (seed3 && availableSlots.has(slotSeed3)) {
      assignedMap.set(slotSeed3, seed3);
      availableSlots.delete(slotSeed3);
    }

    // Seed 4 di akhir paruh pertama (Math.floor(n / 2))
    const slotSeed4 = Math.floor(n / 2);
    if (seed4 && availableSlots.has(slotSeed4)) {
      assignedMap.set(slotSeed4, seed4);
      availableSlots.delete(slotSeed4);
    }
  }

  // Sisanya yang belum dapat slot dari seededAthletes dimasukkan ke unseeded
  seededAthletes.forEach((s) => {
    let isAssigned = false;
    for (const val of assignedMap.values()) {
      if (val.id === s.id) {
        isAssigned = true;
        break;
      }
    }
    if (!isAssigned) {
      unseededAthletes.push(s);
    }
  });

  // 2. Acak atlet yang belum ditempatkan (Fisher-Yates)
  const shuffledUnseeded = [...unseededAthletes];
  for (let i = shuffledUnseeded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledUnseeded[i], shuffledUnseeded[j]] = [
      shuffledUnseeded[j],
      shuffledUnseeded[i],
    ];
  }

  // Masukkan ke slot yang tersisa
  const remainingSlots = Array.from(availableSlots);
  for (let i = 0; i < shuffledUnseeded.length; i++) {
    const slot = remainingSlots[i];
    assignedMap.set(slot, shuffledUnseeded[i]);
  }

  // 3. Optimisasi Pemisahan Daerah Asal Sama (separateSameRegion)
  if (options.separateSameRegion !== false && n >= 4) {
    // Di babak pertama sistem eliminasi atau pairing awal, pasangan adalah (1 vs 2), (3 vs 4), dst.
    // Jika dua atlet bertetangga memiliki region sama, tukar dengan atlet non-seed lain
    for (let r = 1; r < n; r += 2) {
      const ath1 = assignedMap.get(r);
      const ath2 = assignedMap.get(r + 1);

      if (ath1 && ath2 && ath1.region && ath2.region && ath1.region === ath2.region) {
        // Cari kandidat swap di slot lain yang tidak seeded dan tidak menyebabkan bentrok baru
        for (let targetSlot = 1; targetSlot <= n; targetSlot++) {
          if (targetSlot === r || targetSlot === r + 1) continue;

          const candidate = assignedMap.get(targetSlot);
          if (!candidate) continue;

          // Jangan tukar posisi Seed 1 atau Seed 2
          if (candidate.seed === 1 || candidate.seed === 2) continue;
          if (ath2.seed === 1 || ath2.seed === 2) continue;

          // Cek apakah swap ini aman untuk slot r + 1 dan targetSlot
          const targetNeighborSlot =
            targetSlot % 2 === 1 ? targetSlot + 1 : targetSlot - 1;
          const targetNeighbor = assignedMap.get(targetNeighborSlot);

          if (
            candidate.region !== ath1.region &&
            (!targetNeighbor || targetNeighbor.region !== ath2.region)
          ) {
            // Lakukan penukaran
            assignedMap.set(r + 1, candidate);
            assignedMap.set(targetSlot, ath2);
            break;
          }
        }
      }
    }
  }

  // 4. Bangun daftar atlet baru dengan drawNumber terpasang
  const result: Athlete[] = [];
  for (let slot = 1; slot <= n; slot++) {
    const ath = assignedMap.get(slot);
    if (ath) {
      result.push({
        ...ath,
        drawNumber: slot,
      });
    }
  }

  return result.sort((a, b) => (a.drawNumber || 0) - (b.drawNumber || 0));
}
