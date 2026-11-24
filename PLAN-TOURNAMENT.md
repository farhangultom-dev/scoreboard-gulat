# UWW Olympic Wrestling Tournament & Live Schedule — AI Coding Implementation Plan (Extension)

Dokumen ini adalah rencana ekspansi terpisah (**Phase 8 – Phase 11**) yang melengkapi `PLAN.md` (Core Scoreboard Phase 1–6). Fokus dokumen ini mencakup:
1. **Bulk Import Atlet via Excel (`.xlsx` / `.csv`)** berdasarkan Daerah Asal, Kelas Berat, Kategori Usia, dan Style (`FS`, `GR`, `WW`).
2. **Pengundian & Bagan Resmi UWW** (*Nordic*, *2-Pool Group + Cross*, dan *Direct Elimination + Single Repechage*).
3. **Antrean Partai Otomatis (Bout Queue)** yang terhubung langsung ke `/controller` tanpa input manual berulang.
4. **Layar TV Jadwal Live & Partai Selanjutnya (`/schedule`)** serta *ticker* **Next Bout** di layar scoreboard utama (`/display`).

> **Prasyarat & Aturan Eksekusi untuk AI Coding Agent:**
> 1. Pastikan **Phase 1 – Phase 6** pada `PLAN.md` sudah selesai dan lolos `npm run build` serta `npx vitest run`.
> 2. Kerjakan **SATU FASE** per sesi sesuai instruksi pengguna.
> 3. Jangan memodifikasi kontrak dasar `src/types/match.ts` secara *breaking*; tambahkan hanya properti opsional (seperti `activeBoutId?: string | null`) agar kompatibel penuh dengan mode pertandingan manual.
> 4. Patuhi seluruh **Aturan Sistem Pertandingan Resmi UWW** pada Bagian 0.3 tanpa asumsi sendiri.

---

## 0. Konteks Ekspansi Arsitektur & Aturan Domain UWW

### 0.1 Dependency Tambahan
Install library berikut di root proyek:
- `xlsx` (SheetJS): membaca file Excel unggahan dan membuat file template `.xlsx` 100% di browser (offline).
- `idb-keyval`: wrapper IndexedDB ringan untuk persistensi state turnamen (menghindari batas kuota 5MB `localStorage` saat turnamen memiliki ratusan atlet dan partai).

### 0.2 Routing & Struktur Direktori Tambahan

**Routes yang diperbarui (`src/App.tsx`):**
- `/tournament` → Dashboard Manajemen Turnamen (Import Excel, Undian, Bagan, Master Bout Queue)
- `/schedule` → Layar TV Informasi Pertandingan (Sedang Bertanding & Pertandingan Selanjutnya)
- `/controller` → Panel Operator Matras (ditambah drawer/tab *Bout Queue* + *1-Click Load*)
- `/display` → Layar TV Scoreboard Utama (ditambah *footer ticker* `NEXT BOUT`)

**Struktur file baru:**
```text
src/
├── types/
│   └── tournament.ts                # Kontrak data Athlete, CategoryDivision, TournamentBout, ScheduleSnapshot
├── engine/
│   ├── excelImporter.ts             # Parser, validator, & generator template Excel (.xlsx)
│   ├── uwwClassification.ts         # Kalkulasi UWW Classification Points (5-0, 4-0, 4-1, 3-0, 3-1) & klasemen
│   ├── uwwDrawEngine.ts             # Algoritma undian (random + pemisahan daerah asal + seeding)
│   ├── uwwBracketEngine.ts          # Generator & propagator bagan (Nordic, Group+Cross, Elimination+Repechage)
│   └── uwwBracketEngine.test.ts     # Unit test lengkap untuk seluruh skenario jumlah atlet (2 s.d. 32)
├── store/
│   └── useTournamentStore.ts        # Zustand store turnamen (IndexedDB persist) + integrasi ke useMatchStore
├── components/
│   ├── tournament/
│   │   ├── ExcelUploadPanel.tsx     # Drag & drop Excel, download template, preview validasi & error
│   │   ├── AthleteTableModal.tsx    # CRUD manual ringan (koreksi weigh-in / tambah / hapus atlet)
│   │   ├── CategoryListSidebar.tsx  # Pengelompokan otomatis Style (FS/GR/WW) -> Usia -> Kelas Berat
│   │   ├── DrawCeremonyPanel.tsx    # Pengundian nomor (Shuffle, Pisah Daerah, Manual Swap, Lock Draw)
│   │   ├── BracketViewer.tsx        # Visualisasi Bagan Eliminasi + Repechage / Tabel Klasemen Nordic
│   │   └── BoutQueueManager.tsx     # Master Order of Bouts, assign Matras (MAT A/B/C), reorder
│   ├── controller/
│   │   └── MatchQueueDrawer.tsx     # Panel antrean partai per matras di layar operator
│   └── schedule/
│       ├── LiveMatCard.tsx          # Kartu partai yang sedang berlangsung (skor & timer real-time)
│       └── UpcomingBoutTable.tsx    # Tabel antrean ON DECK, IN THE HOLE, dan UPCOMING
└── pages/
    ├── TournamentPage.tsx           # Halaman Sekretariat / Panitia Pertandingan
    └── ScheduleDisplayPage.tsx      # Halaman Layar TV Jadwal & Warm-up Area (16:9)
```

### 0.3 Aturan Resmi Sistem Pertandingan UWW (Ketat — Dilarang Berhalusinasi)
1. **Penentuan Format Bagan Otomatis Berdasarkan Jumlah Atlet (`N`):**
   - `N = 2`: **Single Bout** (1 partai final langsung, dengan opsi Best-of-3).
   - `N = 3, 4, 5`: **Nordic System (Round-Robin Penuh)** — setiap atlet bertanding melawan semua atlet lain 1 kali:
     - `N = 3` → 3 partai (3 ronde)
     - `N = 4` → 6 partai (3 ronde)
     - `N = 5` → 10 partai (5 ronde)
   - `N = 6, 7`: **UWW 2-Pool Group + Cross Semifinal**:
     - `N = 6`: Pool A (3 atlet) & Pool B (3 atlet).
     - `N = 7`: Pool A (4 atlet) & Pool B (3 atlet).
     - Masing-masing pool memainkan Round-Robin. Peringkat 1 & 2 setiap pool lolos ke **Cross Semifinal** (`A1 vs B2` dan `B1 vs A2`). Pemenang ke **Gold Final**, yang kalah ke **Bronze Final**.
     - *(Opsional: sediakan toggle bagi panitia untuk memilih Direct Elimination 8 slot bila diinginkan).*
   - `N >= 8` (hingga 32/64): **Direct Elimination with Single Repechage**:
     - Ukuran bracket dasar `B` adalah pangkat 2 terbesar yang `<= N` (misal untuk `N = 11`, `B = 8`).
     - Jumlah partai **Qualification Round** = `N - B` (melibatkan `2 * (N - B)` atlet).
     - Jumlah atlet yang mendapat **BYE** langsung ke babak utama (`B`) = `2 * B - N`.
     - Sesuai konvensi tabel resmi UWW, nomor undian awal (`1, 2, ...`) menempati slot **BYE** mulai dari bagian atas bagan (*top half*), sedangkan nomor undian terakhir menempati partai **Qualification** di bagian bawah (*bottom half*).
     - **Single Repechage:** Setelah kedua **Semifinal** selesai dan 2 **Finalis** (Finalis Atas & Finalis Bawah) diketahui, seluruh pegulat yang kalah dari **Finalis Atas** (secara kronologis dari babak terawal) masuk ke jalur **Repechage Atas** untuk memperebutkan **Medali Perunggu 1 (`BRONZE_1`)** melawan yang kalah di Semifinal Atas. Logika identik berlaku untuk **Finalis Bawah** menuju **Medali Perunggu 2 (`BRONZE_2`)**.
2. **UWW Classification Points (untuk peringkat Nordic & Group):**
   - `VFA`, `VIN`, `VFO`, `DSQ` → Pemenang: **`5`**, Kalah: **`0`**
   - `VSU` (Technical Superiority, lawan 0 poin) → Pemenang: **`4`**, Kalah: **`0`**
   - `VSU1` (Technical Superiority, lawan >= 1 poin) → Pemenang: **`4`**, Kalah: **`1`**
   - `VPO` (Points, lawan 0 poin) → Pemenang: **`3`**, Kalah: **`0`**
   - `VPO1` (Points, lawan >= 1 poin) → Pemenang: **`3`**, Kalah: **`1`**
3. **Urutan Tie-Breaker Klasemen Nordic / Group UWW:**
   1. Total **Classification Points** tertinggi.
   2. **Head-to-Head** (jika tepat 2 atlet memiliki poin sama).
   3. Jumlah kemenangan **VFA (Fall)** terbanyak.
   4. Jumlah kemenangan **VSU / VSU1** terbanyak.
   5. Total **Technical Points Scored** terbanyak.
   6. Total **Technical Points Conceded** paling sedikit.

---

## Phase 8: Bulk Import Atlet via Excel & Manajemen Kategori

### Tujuan
Memungkinkan panitia mengunggah daftar atlet secara massal menggunakan file Excel (`.xlsx` / `.csv`), memvalidasi data sebelum disimpan, dan mengelompokkan atlet secara otomatis berdasarkan **Style (`FS`, `GR`, `WW`)**, **Kategori Usia**, dan **Kelas Berat**.

### Spesifikasi Format File Excel (Template Resmi Aplikasi)

| Nama Kolom (Header) | Wajib | Contoh Nilai | Aturan Normalisasi & Validasi |
| :--- | :---: | :--- | :--- |
| `Nama_Atlet` | Ya | `Budi Santoso` | Non-kosong, trim spasi berlebih |
| `Daerah_Asal` | Ya | `LAMPUNG` / `JABAR` | Uppercase otomatis; dipakai untuk label kontingen & pemisahan undian |
| `Kode_Daerah` | Tidak | `LPG` / `JBR` | Maks 5 huruf. Jika kosong, ambil 3 huruf konsonan/awal dari `Daerah_Asal` |
| `Style` | Ya | `FS` / `GR` / `WW` | Case-insensitive; hanya menerima `FS`, `GR`, atau `WW` |
| `Kategori_Usia` | Tidak | `SENIOR` / `U20` / `U17` / `U15` / `U23` | Default `'SENIOR'` jika kosong |
| `Kelas_Berat` | Ya | `74 KG` atau `74` | Normalisasi otomatis ke format `<angka> KG` (misal `"74"` → `"74 KG"`) |
| `Seed` | Tidak | `1`, `2`, `3`, `4` | Opsional; angka bulat `1..4` untuk unggulan |

### Kontrak Tipe Data (`src/types/tournament.ts` — Bagian 1)

```ts
import { AgeCategory, WrestlingStyle } from './match';

export type DivisionFormat =
  | 'SINGLE_BOUT'
  | 'NORDIC'
  | 'GROUP_CROSS'
  | 'ELIMINATION_REPECHAGE';

export interface Athlete {
  id: string;
  name: string;
  region: string;           // Daerah asal penuh (contoh: "LAMPUNG")
  regionCode: string;       // Kode singkat di papan skor TV (contoh: "LPG")
  style: WrestlingStyle;
  ageCategory: AgeCategory;
  weightClass: string;      // Format terstandar (contoh: "74 KG")
  seed?: number;            // Opsional 1..4
  drawNumber?: number;      // Nomor hasil undian resmi UWW (1..N)
}

export interface CategoryDivision {
  id: string;               // Composite key: `${style}_${ageCategory}_${weightClass}`
  style: WrestlingStyle;
  ageCategory: AgeCategory;
  weightClass: string;
  athleteIds: string[];
  format: DivisionFormat;
  assignedMat: string;      // Default "MAT A"
  isDrawLocked: boolean;
}

export interface ExcelParseError {
  row: number;              // Nomor baris Excel (mulai dari 2)
  field: string;
  reason: string;
}

export interface ExcelImportResult {
  validAthletes: Omit<Athlete, 'id'>[];
  errors: ExcelParseError[];
  duplicateWarnings: string[];
}
```

### Tugas Implementasi
1. Install `xlsx` dan `idb-keyval`.
2. Buat `src/types/tournament.ts` (Bagian 1, dan persiapkan Bagian 2 untuk Phase 9).
3. Buat `src/engine/excelImporter.ts`:
   - `downloadAthleteTemplate()`: menghasilkan dan mengunduh file `Template_Atlet_UWW.xlsx` lengkap dengan 8 baris contoh valid lintas `FS`, `GR`, `WW`.
   - `parseAthleteExcel(file: File): Promise<ExcelImportResult>`: membaca sheet pertama via `XLSX.read()`, mencocokkan nama header secara toleran (abaikan huruf besar/kecil dan spasi/underscore), memvalidasi tiap baris, serta mendeteksi duplikasi nama atlet dalam kategori yang sama.
   - `detectRecommendedFormat(athleteCount: number): DivisionFormat`: mengembalikan format resmi UWW berdasarkan jumlah atlet.
4. Buat `src/store/useTournamentStore.ts` dengan persistensi IndexedDB (`idb-keyval`):
   - Action `importAthletes(athletes, mode: 'MERGE' | 'REPLACE')`: mengelompokkan atlet ke `divisions` secara otomatis.
   - Action CRUD ringan: `addAthlete`, `updateAthlete`, `deleteAthlete`, `clearDivision`, `resetTournament`.
5. Bangun `TournamentPage.tsx`, `ExcelUploadPanel.tsx`, `CategoryListSidebar.tsx`, dan `AthleteTableModal.tsx`:
   - Area *drag & drop* file `.xlsx`/`.csv` + tombol **"Download Template Excel"**.
   - Preview hasil baca Excel: tampilkan ringkasan jumlah atlet per kelas, daftar baris error berwarna merah beserta nomor barisnya, dan opsi import **Gabung (Merge)** atau **Ganti Semua (Replace)**.
   - Sidebar pengelompokan hirarkis (`FS`, `GR`, `WW` → daftar kelas berat beserta jumlah atlet & status undian).
   - Form tambah/edit/hapus atlet satuan untuk perubahan mendadak saat *weigh-in*.

### Acceptance Criteria (Phase 8)
- [ ] `npx tsc --noEmit` dan `npm run build` lulus tanpa error.
- [ ] File `Template_Atlet_UWW.xlsx` berhasil diunduh, dibuka di Excel/Sheets, dan saat diunggah kembali langsung ter-parse sempurna.
- [ ] Baris tidak valid (misal `Style = "MMA"` atau `Kelas_Berat` kosong) tampil di panel error beserta nomor barisnya tanpa merusak baris valid lainnya.
- [ ] Data ratusan atlet tetap bertahan setelah halaman di-refresh (`F5`) melalui IndexedDB.

---

## Phase 9: UWW Official Draw & Bracket Engine (Pure Logic + Visualisasi Bagan)

### Tujuan
Membangun mesin pengundian (*Draw*), kalkulasi *Classification Points*, generator bagan resmi UWW (*Nordic*, *Group + Cross*, *Elimination + Single Repechage*), dan komponen visualisasi bagan yang interaktif.

### Kontrak Tipe Data (`src/types/tournament.ts` — Bagian 2)

```ts
import { Corner, VictoryType } from './match';

export type BoutRound =
  | 'NORDIC_R1' | 'NORDIC_R2' | 'NORDIC_R3' | 'NORDIC_R4' | 'NORDIC_R5'
  | 'GROUP_A' | 'GROUP_B'
  | 'QUALIFICATION' | 'ROUND_OF_32' | 'ROUND_OF_16'
  | 'QUARTERFINAL' | 'SEMIFINAL'
  | 'REPECHAGE_1' | 'REPECHAGE_2'
  | 'BRONZE_1' | 'BRONZE_2' | 'GOLD_FINAL';

export type BoutStatus =
  | 'TBD'           // Menunggu pemenang partai sebelumnya
  | 'SCHEDULED'     // Kedua atlet sudah pasti, masuk antrean
  | 'ON_DECK'       // Partai berikutnya (atlet bersiap di pinggir matras)
  | 'IN_PROGRESS'   // Sedang dimainkan di matras
  | 'COMPLETED';    // Selesai, hasil terkunci

export interface BoutResult {
  winnerCorner: Corner;
  winnerAthleteId: string;
  loserAthleteId: string;
  redScore: number;
  blueScore: number;
  victoryType: VictoryType;
  redClassificationPts: number;
  blueClassificationPts: number;
  completedAt: number;
}

export interface TournamentBout {
  id: string;
  divisionId: string;
  boutNumber: number | null;       // Nomor urut partai resmi di matras (1, 2, 3...)
  matName: string;                 // "MAT A", "MAT B", dst.
  round: BoutRound;
  roundOrder: number;              // Urutan kronologis babak (10=Qual, 20=R16, 30=QF, 40=SF, 50=Rep, 60=Bronze/Final)
  bracketPosition: number;         // Posisi vertikal pada bagan untuk rendering visual
  bracketSide?: 'TOP' | 'BOTTOM';  // Sisi bagan untuk kalkulasi Single Repechage
  redAthleteId: string | null;
  blueAthleteId: string | null;
  redSourceLabel?: string;         // Contoh: "Winner QF #1" / "A1" / "Loser SF #1"
  blueSourceLabel?: string;
  nextWinBoutId?: string;
  nextWinSlot?: Corner;
  nextLoseBoutId?: string;
  nextLoseSlot?: Corner;
  status: BoutStatus;
  result?: BoutResult;
}

export interface StandingRow {
  athleteId: string;
  rank: number;
  matchesPlayed: number;
  wins: number;
  classificationPoints: number;
  vfaCount: number;
  vsuCount: number;
  technicalPointsFor: number;
  technicalPointsAgainst: number;
}
```

### Tugas Implementasi
1. Buat `src/engine/uwwClassification.ts`:
   - `getClassificationPoints(victoryType: VictoryType): { winner: number; loser: number }`
   - `calculateNordicStandings(athleteIds: string[], bouts: TournamentBout[]): StandingRow[]` mengikuti 6 urutan tie-breaker resmi UWW.
2. Buat `src/engine/uwwDrawEngine.ts`:
   - `generateOfficialDraw(athletes: Athlete[], options: { separateSameRegion: boolean }): Athlete[]`:
     - Menempatkan `seed` (1 di atas, 2 di bawah, 3 & 4 di sisi berlawanan jika ada).
     - Mengacak sisa atlet untuk mendapatkan `drawNumber` `1..N`.
     - Jika `separateSameRegion` aktif, lakukan optimisasi penukaran (*swap pass*) untuk meminimalkan pertemuan sesama `region` di babak pertama.
3. Buat `src/engine/uwwBracketEngine.ts`:
   - `generateDivisionBouts(division: CategoryDivision, drawnAthletes: Athlete[]): TournamentBout[]`:
     - Menangani `SINGLE_BOUT` (`N=2`), `NORDIC` (`N=3..5` menggunakan algoritma *circle method* agar jadwal per ronde seimbang), `GROUP_CROSS` (`N=6..7`), dan `ELIMINATION_REPECHAGE` (`N=8..32`).
     - Untuk `ELIMINATION_REPECHAGE`: hitung tepat jumlah partai `QUALIFICATION` (`N - B`) dan slot `BYE` (`2*B - N`), sambungkan `nextWinBoutId` dan `nextWinSlot` hingga `GOLD_FINAL`, serta siapkan placeholder partai `BRONZE_1` dan `BRONZE_2`.
   - `advanceBoutResult(allBouts: TournamentBout[], completedBoutId: string, result: BoutResult): TournamentBout[]`:
     - Mengunci hasil partai, memindahkan pemenang ke `nextWinBoutId` (`RED`/`BLUE`), dan mengubah status partai tujuan dari `TBD` menjadi `SCHEDULED` begitu kedua slot terisi.
     - Untuk `GROUP_CROSS`: begitu seluruh partai `GROUP_A` dan `GROUP_B` selesai, otomatis isi semifinal silang (`A1 vs B2`, `B1 vs A2`).
     - Untuk `ELIMINATION_REPECHAGE`: begitu `SEMIFINAL` sisi `TOP` atau `BOTTOM` selesai, otomatis telusuri seluruh lawan yang dikalahkan oleh Finalis sisi tersebut untuk men-generate / mengisi partai `REPECHAGE_1`, `REPECHAGE_2`, hingga `BRONZE_1` / `BRONZE_2` secara kronologis!
4. Buat `src/engine/uwwBracketEngine.test.ts` (minimal 10 test case wajib):
   - Verifikasi `getClassificationPoints` untuk seluruh `VictoryType` (`VFA`, `VSU`, `VSU1`, `VPO`, `VPO1`, `DSQ`, `VIN`, `VFO`).
   - Verifikasi `N = 3, 4, 5` Nordic menghasilkan tepat 3, 6, dan 10 partai tanpa duplikasi pairing + klasemen akurat.
   - Verifikasi `N = 6, 7` menghasilkan Pool A/B + pengisian otomatis Cross Semifinal setelah grup selesai.
   - Verifikasi `N = 8, 11, 16`:
     - Untuk `N = 11`: tepat 3 partai `QUALIFICATION` dan 5 slot `BYE` ke `QUARTERFINAL`.
     - Simulasi penuh dari Qualification hingga Semifinal menghasilkan jalur `REPECHAGE` dan `BRONZE_1`/`BRONZE_2` yang hanya berisi pegulat yang kalah dari kedua Finalis.
   - Verifikasi `separateSameRegion` memisahkan 2 atlet daerah sama pada babak pertama.
5. Bangun `DrawCeremonyPanel.tsx` dan `BracketViewer.tsx`:
   - `DrawCeremonyPanel.tsx`: tombol **"Undi Acak (Shuffle)"**, checkbox **"Pisahkan Daerah Asal Sama"**, fitur tukar nomor undian manual (*swap*), dan tombol **"Kunci Undian & Buat Bagan"** (disertai opsi *Unlock/Reset Bracket* dengan konfirmasi ganda).
   - `BracketViewer.tsx`:
     - Mode **Eliminasi**: bagan horizontal berkolom (`Qualification` → `R16` → `QF` → `SF` → `Gold Final`) dengan garis penghubung rapi, plus blok **Repechage & Bronze Finals** di bagian bawah.
     - Mode **Nordic / Group**: tabel klasemen live (`Rank`, `Atlet`, `Daerah`, `Main`, `Menang`, `CP`, `VFA`, `VSU`, `TP`) + daftar partai per ronde.

### Acceptance Criteria (Phase 9)
- [ ] `npx vitest run` lulus 100% untuk `uwwBracketEngine.test.ts` dan seluruh test lama (`uwwRules.test.ts`).
- [ ] Panitia dapat mengundi dan mengunci bagan untuk kelas berisi 3, 5, 6, 8, maupun 11 atlet secara visual dan rapi.
- [ ] Menyelesaikan partai di babak awal otomatis memajukan pemenang ke babak berikutnya dan mengisi Repechage/Bronze saat Semifinal selesai.

---

## Phase 10: Integrasi Seamless Bout Queue ke Scoreboard (`/controller`)

### Tujuan
Menghilangkan input manual di papan skor. Panitia menyusun urutan partai lintas kelas pada satu atau beberapa matras, operator cukup klik **"Load ke Matras"** dari antrean, dan setiap hasil `DECLARE WINNER` otomatis memperbarui bagan turnamen.

### Perubahan Minor pada `src/types/match.ts`
Tambahkan 2 properti opsional pada `MatchState` (100% *backward-compatible*):
```ts
activeBoutId?: string | null;
nextBoutPreview?: {
  boutNumber: number | null;
  divisionLabel: string;
  redName: string;
  redRegion: string;
  blueName: string;
  blueRegion: string;
} | null;
```

### Tugas Implementasi
1. Bangun `BoutQueueManager.tsx` di dalam `/tournament`:
   - Tombol **"Generate Master Order of Bouts"**: menyusun semua partai yang sudah `SCHEDULED` (serta placeholder `TBD`) dari seluruh kelas secara bergantian berdasarkan `roundOrder` (semua ronde awal dimainkan lebih dulu sebelum babak berikutnya agar atlet mendapat jeda istirahat).
   - Penugasan matras per kelas atau per partai (`MAT A`, `MAT B`, `MAT C`) serta penomoran partai otomatis per matras (`1, 2, 3, ...`).
   - Kontrol geser urutan partai (`Move Up` / `Move Down`) untuk penyesuaian mendadak di lapangan.
2. Bangun `MatchQueueDrawer.tsx` & integrasikan ke `ControllerPage.tsx`:
   - Selector **Matras Aktif** di Top Bar `/controller` (misal `MAT A`).
   - Panel/Drawer **"Antrean Partai (Bout Queue)"** menampilkan:
     - Partai **`IN_PROGRESS`** (sedang dimainkan di matras).
     - Partai **`ON_DECK`** (berikutnya, disorot kuning).
     - Daftar partai **`SCHEDULED`** selanjutnya.
   - Aksi **"Load ke Matras" (1 Klik)**:
     - Mengisi otomatis `useMatchStore`: `metadata` (`matName`, `boutNumber`, `style`, `ageCategory`, `weightClass`), `red` (`name`, `countryOrTeam`), `blue` (`name`, `countryOrTeam`), `activeBoutId`, dan `nextBoutPreview`.
     - Mereset skor ke `0-0`, challenge ke `true`, dan mengatur `mainClock` otomatis sesuai `ageCategory` (`3:00` atau `2:00`).
     - Mengubah status partai di `useTournamentStore` menjadi `IN_PROGRESS` dan menandai partai `SCHEDULED` urutan pertama setelahnya sebagai `ON_DECK`.
3. Sinkronisasi Otomatis saat `DECLARE WINNER` di `VictoryModal.tsx`:
   - Ketika operator mengonfirmasi pemenang dan `activeBoutId` tidak null:
     - Hitung `redClassificationPts` & `blueClassificationPts` via `uwwClassification.ts`.
     - Panggil `useTournamentStore.completeBout(activeBoutId, result)` yang langsung memicu `advanceBoutResult()`.
     - Tampilkan tombol aksi utama **"Lanjut Muat Partai Berikutnya (Bout #N+1)"** langsung pada layar sukses agar perpindahan partai berlangsung seketika.
   - Jika operator melakukan *"Cancel / Reset Match"* sebelum pemenang dikonfirmasi, kembalikan status partai dari `IN_PROGRESS` ke `SCHEDULED`.
4. Pertahankan tombol **"Manual Match Setup"** agar scoreboard tetap bisa dipakai untuk partai ekshibisi tanpa turnamen.

### Acceptance Criteria (Phase 10)
- [ ] Operator dapat menjalankan turnamen penuh dari Partai #1 hingga Final tanpa pernah mengetik nama atlet atau kelas di `/controller`.
- [ ] Menekan konfirmasi di `VictoryModal` langsung mengunci skor di `BracketViewer`, memajukan pemenang ke babak berikutnya, dan memunculkan partai baru yang sudah lengkap atletnya ke dalam antrean.
- [ ] Tombol *"Lanjut Muat Partai Berikutnya"* memuat atlet, gaya, dan durasi babak secara akurat dengan 1 klik.

---

## Phase 11: Layar TV Live Schedule & Upcoming Matches (`/schedule` + Ticker `/display`)

### Tujuan
Menyediakan tampilan TV khusus yang menampilkan daftar **pertandingan yang sedang dilaksanakan (*On Mat*)** secara live beserta **pertandingan selanjutnya (*On Deck* & *Upcoming*)**, ditambah *ticker* **Next Bout** di layar TV scoreboard utama dan fitur cetak bagan resmi.

### Protokol Sinkronisasi Jadwal (`src/store/syncChannel.ts`)
Perluas `SyncMessage` dengan event `SCHEDULE_UPDATE`:

```ts
export interface ActiveMatSnapshot {
  matName: string;
  boutNumber: number | null;
  divisionLabel: string;       // Contoh: "FS • 74 KG • QUARTERFINAL"
  redName: string;
  redRegion: string;
  redScore: number;
  blueName: string;
  blueRegion: string;
  blueScore: number;
  periodLabel: string;         // "P1", "BREAK", "P2", "READY", "FINAL"
  remainingMs: number;
  isRunning: boolean;
  lastSyncedAt: number | null;
}

export interface UpcomingBoutSnapshot {
  id: string;
  matName: string;
  boutNumber: number | null;
  divisionLabel: string;       // Contoh: "FS • 74 KG"
  roundLabel: string;          // Contoh: "SEMIFINAL"
  redName: string;
  redRegion: string;
  blueName: string;
  blueRegion: string;
  queueBadge: 'ON_DECK' | 'IN_THE_HOLE' | 'UPCOMING';
}

export interface ScheduleSnapshot {
  updatedAt: number;
  activeMats: ActiveMatSnapshot[];
  upcomingBouts: UpcomingBoutSnapshot[];
}
```
- Simpan snapshot terbaru ke `localStorage` (`'uww_schedule_snapshot_v1'`) dan broadcast lewat `BroadcastChannel` setiap kali partai dimuat, skor berubah, timer start/pause, atau urutan antrean diperbarui.

### Tugas Implementasi
1. Bangun `ScheduleDisplayPage.tsx` (`/schedule`), `LiveMatCard.tsx`, dan `UpcomingBoutTable.tsx`:
   - **Desain TV 16:9 Kontras Tinggi:** latar `bg-slate-950`, teks besar, `tabular-nums`, tanpa scrollbar (*overflow-hidden*), terbaca jelas dari jarak 15–20 meter di area pemanasan atlet (*call room*) atau tribun penonton.
   - **Zona Atas — "SEDANG BERTANDING / ON MAT":**
     - Menampilkan kartu live untuk setiap matras aktif (`MAT A`, `MAT B`, dst.) dengan Nomor Partai, Kelas & Babak, Nama + Kode Daerah sudut Merah & Biru, **Skor Live**, dan **Sisa Waktu Babak** (menggunakan `usePrecisionTimer` agar jam tetap berjalan mulus 60fps tanpa membanjiri channel).
   - **Zona Bawah — "PERTANDINGAN SELANJUTNYA / UPCOMING BOUTS":**
     - Tabel bersih menampilkan 6–10 partai berikutnya dengan badge warna tegas:
       - **`ON DECK`** (Kuning/Emas menyala): Partai tepat berikutnya — atlet wajib bersiap di pinggir matras.
       - **`IN THE HOLE`** (Biru Muda): 2 partai lagi — atlet mulai pemanasan.
       - **`UPCOMING`** (Abu terang): Antrean selanjutnya.
     - Mendukung query parameter filter matras di URL: `/schedule?mat=MAT%20A` (menampilkan khusus Matras A) atau `/schedule` (menampilkan seluruh matras).
   - Auto-hide tombol `Fullscreen (F11)` dan pemilih filter matras saat kursor diam 3 detik.
2. Tambahkan tombol **"Open Schedule TV"** (`window.open('/schedule', 'UWW_SCHEDULE_TV', 'width=1280,height=720')`) di `/tournament` dan `/controller`.
3. **Ticker "NEXT BOUT" di Layar TV Scoreboard Utama (`/display`):**
   - Pada Footer Strip `DisplayPage.tsx`, tampilkan informasi partai berikutnya dari `state.nextBoutPreview`:
     `NEXT UP • BOUT 15 (FS 74 KG): AHMAD (LPG) vs RIZKY (JBR)`
   - Pastikan ticker otomatis memberi ruang jika sedang ada `Injury/Blood Timer` atau overlay darurat (`CHALLENGE`).
4. **Cetak Bagan & Daftar Partai (Print CSS):**
   - Tambahkan tombol **"Print Bracket / Order of Bouts"** di `/tournament` dengan stylesheet `@media print` yang bersih (latar putih, teks hitam, pemotongan halaman rapi) sehingga panitia bisa mencetak PDF resmi untuk ditempel di papan pengumuman GOR.

### Acceptance Criteria (Phase 11)
- [ ] Membuka `/schedule` di tab/jendela terpisah menampilkan kartu **Sedang Bertanding** (skor & timer live sinkron) sekaligus daftar **Pertandingan Selanjutnya** (`ON DECK`, `IN THE HOLE`, `UPCOMING`).
- [ ] Saat operator memuat partai berikutnya di `/controller`, partai `ON DECK` di `/schedule` langsung naik ke bagian `ON MAT` dan antrean di bawahnya bergeser otomatis tanpa refresh.
- [ ] URL `/schedule?mat=MAT%20A` hanya menampilkan informasi untuk Matras A.
- [ ] Footer layar `/display` menampilkan info `NEXT UP` yang selalu akurat.
- [ ] Fitur Print menghasilkan tata letak bagan dan urutan partai yang rapi di dialog cetak PDF browser.

---

## Panduan Prompt Eksekusi ke AI Coding Agent

Pastikan `PLAN.md` (Phase 1–6) telah selesai terlebih dahulu, lalu kirim prompt berikut satu per satu:

### Prompt Phase 8
```text
Baca PLAN-TOURNAMENT.md secara menyeluruh. Kerjakan HANYA Phase 8 (Bulk Import Atlet via Excel & Manajemen Kategori). Install `xlsx` dan `idb-keyval`, buat kontrak tipe data `src/types/tournament.ts`, implementasikan `src/engine/excelImporter.ts`, `useTournamentStore.ts`, dan UI upload/preview/manajemen kategori di `/tournament`. Jangan kerjakan Phase 9 dulu. Verifikasi dengan `npx tsc --noEmit` dan `npm run build`, lalu laporkan status seluruh Acceptance Criteria Phase 8.
```

### Prompt Phase 9
```text
Baca PLAN-TOURNAMENT.md. Lanjutkan ke Phase 9 (UWW Official Draw & Bracket Engine). Implementasikan `uwwClassification.ts`, `uwwDrawEngine.ts`, `uwwBracketEngine.ts` (Nordic 3-5, Group+Cross 6-7, Elimination+Single Repechage 8-32), komponen `DrawCeremonyPanel.tsx` & `BracketViewer.tsx`, serta unit test lengkap di `src/engine/uwwBracketEngine.test.ts`. Jalankan `npx vitest run` dan `npx tsc --noEmit`, lalu laporkan hasilnya.
```

### Prompt Phase 10
```text
Baca PLAN-TOURNAMENT.md. Lanjutkan ke Phase 10 (Integrasi Seamless Bout Queue ke Scoreboard `/controller`). Bangun `BoutQueueManager.tsx` di `/tournament` dan `MatchQueueDrawer.tsx` di `/controller` agar operator dapat memuat partai dengan 1 klik, serta hubungkan konfirmasi `VictoryModal` agar otomatis memperbarui hasil bagan turnamen dan menyiapkan tombol "Lanjut Muat Partai Berikutnya". Pastikan `npm run build` dan seluruh test lulus.
```

### Prompt Phase 11
```text
Baca PLAN-TOURNAMENT.md. Lanjutkan ke Phase 11 (Layar TV Live Schedule & Upcoming Matches). Perluas `syncChannel.ts` dengan `SCHEDULE_UPDATE`, bangun halaman `/schedule` (`ScheduleDisplayPage.tsx`, `LiveMatCard.tsx`, `UpcomingBoutTable.tsx`) dengan dukungan filter `?mat=`, tambahkan ticker `NEXT UP` di footer `/display`, serta tambahkan Print CSS untuk cetak bagan/daftar partai. Jalankan semua test dan `npm run build`, lalu berikan ringkasan verifikasi akhir.
```