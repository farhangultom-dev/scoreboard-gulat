# UWW Manual Physical Ball Draw — AI Coding Implementation Plan

Dokumen ini adalah rencana modul terpisah (**Modul Add-on / Patch**) untuk mengimplementasikan sistem **Undian Manual Menggunakan Bola Fisik** di luar aplikasi. Dokumen ini dirancang untuk melengkapi dan menyempurnakan fitur pengundian pada `PLAN-TOURNAMENT.md` (Phase 8–9) serta backend MySQL lokal pada `PLAN-BACKEND-MYSQL.md` (Phase 12–13).

> **Konteks Penggunaan Lapangan:**
> Saat *Technical Meeting* atau setelah *Weigh-in* (timbang badan), setiap atlet mengambil bola bernomor fisik ($1$ s.d. $N$) secara acak dari wadah undian. Aplikasi **tidak** mengacak posisi secara otomatis sebagai jalur utama, melainkan bertindak sebagai **papan pencatat transparan, validator anti-duplikat, pratinjau bagan langsung, dan pembentuk bagan resmi UWW** berdasarkan nomor bola fisik yang dipilih atlet.

> **Aturan Eksekusi untuk AI Coding Agent:**
> 1. Modul ini dapat dieksekusi setelah **Phase 9** (untuk mode frontend) dan dilanjutkan ke **Step 4** setelah **Phase 13** (untuk persistensi MySQL lokal).
> 2. Kerjakan **SATU STEP** per sesi dan pastikan seluruh **Acceptance Criteria** lulus (`npx tsc --noEmit`, `npx vitest run`, dan `npm run build`).
> 3. Dilarang mengubah perilaku deterministik `uwwBracketEngine.ts` — engine wajib 100% patuh pada `athlete.drawNumber` tanpa melakukan pengacakan ulang di balik layar.

---

## 0. Aturan Domain Pemetaan Nomor Bola Fisik ke Bagan Resmi UWW

Misalkan jumlah atlet sah dalam satu kelas adalah $N$ (dengan $N \ge 2$). Nomor bola fisik yang sah adalah seluruh bilangan bulat unik dari $1$ sampai $N$.

1. **Single Bout ($N = 2$):**
   * Bola `#1` menempati sudut **RED**, Bola `#2` menempati sudut **BLUE**.
2. **Nordic / Round-Robin Penuh ($N \in \{3, 4, 5\}$):**
   * Seluruh bola `#1` s.d. `#N` berlabel `NORDIC` dan dipetakan secara deterministik ke tabel jadwal baku Round-Robin UWW (contoh $N = 4$: R1 `1 vs 2` & `3 vs 4`; R2 `1 vs 3` & `2 vs 4`; R3 `1 vs 4` & `2 vs 3`).
3. **2-Pool Group + Cross Semifinal ($N \in \{6, 7\}$):**
   * Bola `#1` s.d. `#`$\lceil N / 2 \rceil$ masuk **Pool A** (`#1–#3` untuk $N = 6$; `#1–#4` untuk $N = 7$).
   * Bola `#`$(\lceil N / 2 \rceil + 1)$ s.d. `#N` masuk **Pool B** (`#4–#6` untuk $N = 6$; `#5–#7` untuk $N = 7$).
4. **Direct Elimination + Single Repechage ($N \ge 8$):**
   * Tentukan ukuran babak utama dasar $B = 2^{\lfloor \log_2(N) \rfloor}$ (misal untuk $N = 11$, maka $B = 8$; untuk $N = 16$, maka $B = 16$).
   * Jumlah partai Kualifikasi adalah $Q = N - B$.
   * **Jika $Q = 0$** ($N \in \{8, 16, 32\}$): Tidak ada partai Qualification dan tidak ada BYE. Seluruh bola `#1` s.d. `#N` berlabel `MAIN` dan langsung berpasangan berurutan di babak utama (`1 vs 2`, `3 vs 4`, dst.).
   * **Jika $Q > 0$** (contoh $N = 11 \Rightarrow B = 8, Q = 3$):
     * Jumlah slot **BYE** adalah $B - Q = 2B - N$ (untuk $N = 11$, terdapat $5$ slot BYE).
     * Bola `#1` s.d. `#`$(B - Q)$ berlabel **`BYE`** dan langsung ditempatkan pada slot babak utama (*Quarterfinal* / *Round of 16*) dari atas ke bawah.
     * Bola `#`$(B - Q + 1)$ s.d. `#N` berlabel **`QUAL`** dan berpasangan berurutan di babak **Qualification** (contoh $N = 11$: `6 vs 7`, `8 vs 9`, `10 vs 11`).

---

## Step 1: Validator Manual Draw & Helper Pemetaan Slot Bola (Pure Logic)

### Tujuan
Menyediakan *pure functions* teruji yang memvalidasi kelengkapan nomor bola fisik, menghasilkan label posisi UWW (`BYE`, `QUAL`, `POOL A`, `POOL B`, `NORDIC`, `MAIN`) untuk setiap nomor bola, dan memastikan `uwwBracketEngine.ts` bekerja 100% deterministik.

### Struktur File Baru / Diperbarui
* `shared/engine/uwwManualDraw.ts` *(atau `src/engine/uwwManualDraw.ts` sebelum Phase 12)*
* `shared/engine/uwwManualDraw.test.ts`
* Pembaruan pada `shared/engine/uwwBracketEngine.ts`

### Spesifikasi Kontrak & Fungsi (`uwwManualDraw.ts`)
```ts
import { Athlete, DivisionFormat } from '../types/tournament';

export type BallZoneType = 'MAIN' | 'BYE' | 'QUAL' | 'POOL_A' | 'POOL_B' | 'NORDIC';

export interface BallSlotMeta {
  ballNumber: number;         // 1..N
  zone: BallZoneType;
  zoneLabel: string;          // "BYE", "QUAL", "POOL A", "POOL B", "NORDIC", "QF", "R16"
  slotDescription: string;    // Contoh: "Langsung ke Perempat Final (Slot #2)" atau "Kualifikasi #1 (Merah)"
}

export interface ManualDrawValidation {
  isValid: boolean;
  totalAthletes: number;
  assignedCount: number;
  missingAthleteIds: string[];
  duplicateNumbers: number[];
  outOfRangeAthleteIds: string[];
  availableNumbers: number[]; // Nomor bola 1..N yang belum terpakai
}
```

### Tugas Implementasi
1. Buat `getBallSlotMetadata(totalAthletes: number, format: DivisionFormat): BallSlotMeta[]`:
   * Mengembalikan metadata untuk seluruh nomor bola $1 \dots N$ persis mengikuti aturan Bagian 0.
2. Buat `validateManualDraw(athletes: Athlete[]): ManualDrawValidation`:
   * Mengecek seluruh atlet:
     * Menghitung `assignedCount` (atlet dengan `drawNumber !== undefined && drawNumber !== null`).
     * Mendeteksi `missingAthleteIds`, `duplicateNumbers`, dan `outOfRangeAthleteIds` (jika $< 1$ atau $> N$ atau bukan integer).
     * Mengembalikan daftar `availableNumbers` terurut naik untuk ditampilkan di papan bola tersisa.
     * `isValid` bernilai `true` hanya jika `assignedCount === totalAthletes`, `duplicateNumbers.length === 0`, dan `outOfRangeAthleteIds.length === 0`.
3. Perbarui `generateDivisionBouts(division, athletes)` di `uwwBracketEngine.ts`:
   * Panggil `validateManualDraw(athletes)` di baris pertama fungsi; lempar error deskriptif bila `!isValid`.
   * Urutkan atlet secara ketat berdasarkan `a.drawNumber - b.drawNumber` (dilarang ada pemanggilan `Math.random()`).
4. Buat fungsi `buildDraftBracketPreview(division, athletes)` yang dapat merender pratinjau bagan meskipun sebagian nomor bola masih kosong (slot kosong tampil sebagai `"Menunggu Bola #X"`).
5. Buat `uwwManualDraw.test.ts` dengan minimal 8 test case:
   * Verifikasi `getBallSlotMetadata` untuk $N = 2, 4, 6, 7, 8, 10, 11, 16$.
   * Verifikasi $N = 11$ menghasilkan tepat 5 label `BYE` (`#1–#5`) dan 6 label `QUAL` (`#6–#11`).
   * Verifikasi $N = 8$ dan $N = 16$ tidak menghasilkan label `BYE` maupun `QUAL`.
   * Verifikasi `validateManualDraw` menangkap nomor ganda, nomor kosong, dan nomor di luar rentang ($0$ atau $N + 1$).
   * Verifikasi `generateDivisionBouts` menghasilkan susunan partai identik setiap kali dipanggil dengan `drawNumber` yang sama (100% deterministik).

### Acceptance Criteria (Step 1)
* [ ] `npx vitest run` lulus 100% untuk `uwwManualDraw.test.ts` dan seluruh test engine sebelumnya.
* [ ] `npx tsc --noEmit` lulus tanpa error.

---

## Step 2: Antarmuka Input Cepat Bola Fisik & Live Preview (`DrawCeremonyPanel.tsx`)

### Tujuan
Menjadikan **Input Undian Manual (Bola Fisik)** sebagai antarmuka utama di halaman `/tournament` yang cepat dioperasikan saat *Technical Meeting*, tahan salah ketik, dan transparan bila ditampilkan ke layar proyektor/TV.

### Komponen Baru / Diperbarui
* `src/components/tournament/BallTrackerBoard.tsx` *(Baru)*
* `src/components/tournament/DrawCeremonyPanel.tsx` *(Diperbarui)*

### Tugas Implementasi
1. **Bangun `BallTrackerBoard.tsx` (Papan Indikator Bola Tersisa):**
   * Menampilkan kotak/lingkaran angka bola `#1` sampai `#N` di bagian atas panel.
   * Setiap bola menampilkan sub-label zona dari `getBallSlotMetadata` (`BYE`, `QUAL`, `POOL A`, `POOL B`, dll.) dengan pembeda warna yang jelas.
   * Status visual tiap bola:
     * **Tersedia (Belum Dipilih):** Warna cerah kontras tinggi, dapat diklik.
     * **Terpakai:** Warna redup / tercoret, menampilkan tooltip atau sub-teks nama singkat atlet pemegangnya.
     * **Duplikat / Konflik:** Sorotan merah berkedip bila terjadi bentrok sementara.
2. **Perbarui `DrawCeremonyPanel.tsx` dengan Alur Input Ganda:**
   * **Mode Default:** Langsung membuka tab **"Input Bola Fisik (Manual)"**. Pindahkan fitur acak sistem (*Auto-Shuffle*) ke tombol opsional sekunder (`"Acak Otomatis (Opsional)"`) dengan konfirmasi agar tidak tertekan tidak sengaja.
   * **Input Mode 1 — Keyboard-First (Tercepat untuk Operator):**
     * Setiap baris atlet memiliki input angka nomor bola (`1..N`).
     * Saat operator mengetik angka lalu menekan `Enter` (atau `Tab`), fokus kursor **otomatis melompat ke baris atlet berikutnya yang masih kosong**.
   * **Input Mode 2 — Click-to-Assign:**
     * Operator mengklik satu baris atlet (baris tersorot sebagai *"Atlet Aktif"*), lalu cukup mengklik angka bola yang disebut atlet pada `BallTrackerBoard` di atasnya.
   * **Penanganan Konflik / Duplikat Cerdas:**
     * Jika operator memasukkan angka bola yang sudah dimiliki atlet lain (misal Bola `#4` sudah dipakai *Ahmad*), tampilkan peringatan inline yang jelas beserta tombol 1-klik **"Tukar Nomor (#4 ↔ ...)"** agar operator bisa langsung melakukan *swap* tanpa menghapus manual dua kali.
   * **Panel Pratinjau Bagan Langsung (Live Draft Preview):**
     * Tampilkan pratinjau `BracketViewer` dalam mode *draft* di sisi kanan/bawah. Setiap kali 1 nomor bola dimasukkan, nama atlet langsung muncul di posisi slot bagannya (misal masuk ke `BYE` atau `Qualification #1`).
   * **Mode Proyektor / Technical Meeting (`Presentation Mode`):**
     * Tambahkan tombol **"Tampilan Layar Penuh (Proyektor)"** yang memperbesar ukuran font nama atlet, `BallTrackerBoard`, dan pratinjau bagan agar mudah dibaca oleh seluruh pelatih dari jarak jauh.
   * **Pengaman Kunci Undian:**
     * Tampilkan progress bar jelas (`Terisi: 9 / 11 Atlet`).
     * Sediakan tombol **"Kosongkan Semua Nomor"** (dengan konfirmasi) jika terjadi perubahan mendadak sebelum dikunci.
     * Tombol **"Kunci Undian & Buat Bagan"** hanya aktif (`enabled`) saat `validation.isValid === true`.

### Acceptance Criteria (Step 2)
* [ ] Operator dapat mengisi 11 nomor bola secara berurutan hanya menggunakan keyboard (`angka` + `Enter`) dalam waktu di bawah 15 detik.
* [ ] Mengklik baris atlet lalu mengklik bola di `BallTrackerBoard` langsung mengisi nomor dan memindahkan sorotan ke atlet kosong berikutnya.
* [ ] Memasukkan nomor duplikat menampilkan peringatan dan tombol 1-klik **Tukar Nomor** yang berfungsi mulus.
* [ ] Pratinjau bagan otomatis ter-update secara live setiap kali nomor bola berubah.
* [ ] Tombol **"Kunci Undian & Buat Bagan"** tetap nonaktif selama masih ada atlet kosong atau duplikat.

---

## Step 3: Dukungan Kolom Opsional `Nomor_Undian` pada Bulk Import Excel

### Tujuan
Memungkinkan panitia yang mencatat hasil cabut bola undian langsung di lembar Excel saat timbang badan untuk mengunggah nama atlet sekaligus nomor undiannya dalam sekali import.

### Tugas Implementasi
1. Perbarui `src/engine/excelImporter.ts`:
   * Tambahkan kolom opsional ke-8 pada template dan parser: **`Nomor_Undian`** (toleran terhadap alias header: `Nomor_Undian`, `No_Undian`, `Draw`, `Draw_Number`, `Bola`).
   * **Aturan Validasi Kolom `Nomor_Undian`:**
     * Boleh dikosongkan sebagian atau seluruhnya (`drawNumber: undefined`).
     * Jika diisi, wajib berupa bilangan bulat positif $\ge 1$.
     * Dalam satu kategori (`Style + Kategori_Usia + Kelas_Berat`) pada file yang sama:
       * Tolak baris (tambahkan ke `errors`) jika ditemukan angka `Nomor_Undian` yang **duplikat**.
       * Beri peringatan (`warnings`) jika angka melebihi jumlah atlet yang ada di kelas tersebut (misal mengisi `#12` padahal hanya ada 10 atlet).
   * Perbarui `downloadAthleteTemplate()` agar menyertakan kolom `Nomor_Undian` (dibiarkan kosong pada baris contoh atau diisi contoh pada 1 kelas sebagai ilustrasi).
2. Perbarui tabel pratinjau di `ExcelUploadPanel.tsx`:
   * Tampilkan kolom `No. Bola` pada preview hasil baca Excel sehingga panitia dapat memverifikasi angka undian sebelum klik **"Simpan ke Turnamen"**.
3. Pastikan `useTournamentStore.importAthletes()` meneruskan nilai `drawNumber` ke state atlet (dan ke API backend pada Step 4).

### Acceptance Criteria (Step 3)
* [ ] Mengunggah file Excel tanpa kolom `Nomor_Undian` tetap berjalan normal 100% (*backward-compatible*).
* [ ] Mengunggah file Excel dengan kolom `Nomor_Undian` terisi otomatis mengisi papan `DrawCeremonyPanel` sehingga panitia tinggal memeriksa pratinjau lalu klik **"Kunci Undian & Buat Bagan"**.
* [ ] Nomor undian duplikat di dalam satu kelas pada file Excel langsung terdeteksi dan ditampilkan pada panel error beserta nomor baris Excel-nya.

---

## Step 4: Integrasi MySQL Lokal & Transaksi Swap Anti-Bentrok (`server/`)

*(Eksekusi step ini apabila backend MySQL lokal dari `PLAN-BACKEND-MYSQL.md` sudah aktif.)*

### Tujuan
Menjamin keunikan nomor bola hingga level database MySQL sekaligus memastikan proses simpan batch maupun tukar nomor (*swap*) tidak pernah gagal karena *unique constraint collision*.

### Tugas Implementasi
1. **Perbarui Skema MySQL (`server/prisma/schema.prisma`):**
   * Tambahkan *composite unique constraint* pada model `Athlete`:
     ```prisma
     model Athlete {
       id           String   @id @default(uuid())
       tournamentId String   @map("tournament_id")
       divisionId   String   @map("division_id")
       name         String
       region       String
       regionCode   String   @map("region_code")
       seed         Int?
       drawNumber   Int?     @map("draw_number")

       @@unique([divisionId, drawNumber])
       @@map("athletes")
     }
     ```
     *(Catatan MySQL InnoDB: nilai `NULL` ganda pada `draw_number` tetap diizinkan secara native oleh MySQL, sehingga atlet yang belum mengambil bola tidak akan bentrok.)*
   * Jalankan `npx prisma db push` (atau `npx prisma migrate dev --name add_unique_draw_number`).
2. **Perbarui Endpoint Simpan Undian Manual (`PATCH /api/divisions/:id/draw/manual`):**
   * **Payload Request:**
     ```json
     {
       "assignments": [
         { "athleteId": "uuid-a", "drawNumber": 5 },
         { "athleteId": "uuid-b", "drawNumber": 1 },
         { "athleteId": "uuid-c", "drawNumber": null }
       ]
     }
     ```
   * **Validasi Server (Zod + Business Rules):**
     * Tolak `409 Conflict` jika `division.isDrawLocked === true`.
     * Pastikan seluruh `athleteId` benar-benar milik `divisionId` tersebut.
     * Pastikan setiap `drawNumber` non-null berada di rentang $1 \dots N$ dan tidak ada duplikat (setelah digabung dengan atlet lain yang tidak ikut dikirim di payload).
   * **Transaksi 2-Tahap Anti-Bentrok (`prisma.$transaction`):**
     Agar aksi tukar nomor (misal Atlet A `1 -> 2` dan Atlet B `2 -> 1`) tidak memicu error `P2002 Unique constraint failed` di tengah eksekusi:
     1. **Tahap 1:** Jalankan `tx.athlete.updateMany({ where: { id: { in: changedIds }, divisionId }, data: { drawNumber: null } })`.
     2. **Tahap 2:** Jalankan loop `tx.athlete.update({ where: { id }, data: { drawNumber } })` untuk setiap item dengan `drawNumber !== null`.
   * Kembalikan daftar atlet terbaru + status `ManualDrawValidation`.
3. **Perbarui `POST /api/tournaments/:id/athletes/bulk`:**
   * Terima properti opsional `drawNumber?: number | null` dari hasil import Excel Step 3 dan simpan langsung saat `createMany`.
4. **Sinkronisasi Auto-Save Frontend (`DrawCeremonyPanel.tsx`):**
   * Setiap perubahan nomor bola atau aksi *Swap* otomatis memanggil `PATCH /api/divisions/:id/draw/manual` (gunakan *debounce* 250ms atau kirim saat `Enter` / klik bola) dengan indikator status ringan (`"Menyimpan..."` → `"Tersimpan di MySQL"`).

### Acceptance Criteria (Step 4)
* [ ] Database MySQL menolak keras percobaan penyisipan dua atlet dengan `draw_number` sama dalam satu divisi, namun tetap mengizinkan beberapa atlet bernilai `NULL`.
* [ ] Aksi tukar nomor bola (`Atlet A: 1 -> 2` dan `Atlet B: 2 -> 1`) melalui `PATCH /api/divisions/:id/draw/manual` berhasil 100% tanpa error `P2002`.
* [ ] Me-refresh browser di tengah proses pengundian fisik (misal baru terisi 6 dari 11 bola) tetap mempertahankan keenam nomor bola yang sudah diinput dari MySQL.

---

## Panduan Prompt Eksekusi ke AI Coding Agent

Salin dan kirim prompt berikut satu per satu sesuai tahap proyek Anda:

### Prompt Step 1 (Engine Deterministik & Validasi)
```text
Baca PLAN-MANUAL-DRAW.md secara menyeluruh. Kerjakan HANYA Step 1 (Validator Manual Draw & Helper Pemetaan Slot Bola). Buat `uwwManualDraw.ts` beserta unit test lengkap di `uwwManualDraw.test.ts`, dan pastikan `uwwBracketEngine.ts` memvalidasi dan mengurutkan atlet secara deterministik murni berdasarkan `drawNumber` tanpa pengacakan ulang. Jalankan `npx vitest run` dan `npx tsc --noEmit`, lalu laporkan hasilnya.
```

### Prompt Step 2 (UI Input Cepat & Live Ball Tracker)
```text
Baca PLAN-MANUAL-DRAW.md. Lanjutkan ke Step 2 (Antarmuka Input Cepat Bola Fisik & Live Preview). Buat `BallTrackerBoard.tsx` dengan label zona resmi UWW (`BYE`, `QUAL`, `POOL A/B`, `NORDIC`, `MAIN`), perbarui `DrawCeremonyPanel.tsx` agar mode input manual bola fisik menjadi tampilan default lengkap dengan keyboard-first (`Enter` pindah baris), click-to-assign, tombol 1-klik Tukar Nomor saat duplikat, live draft bracket preview, dan tombol mode Proyektor. Verifikasi dengan `npm run build`.
```

### Prompt Step 3 (Kolom Opsional `Nomor_Undian` di Excel)
```text
Baca PLAN-MANUAL-DRAW.md. Lanjutkan ke Step 3 (Dukungan Kolom Opsional `Nomor_Undian` di Excel). Perbarui `excelImporter.ts`, template `.xlsx`, dan preview di `ExcelUploadPanel.tsx` agar kolom opsional `Nomor_Undian` terbaca, tervalidasi anti-duplikat per kelas, dan tetap 100% backward-compatible bila kolom tidak diisi. Verifikasi dengan `npm run build` dan `npx vitest run`.
```

### Prompt Step 4 (Integrasi MySQL & Transaksi Anti-Bentrok)
```text
Baca PLAN-MANUAL-DRAW.md. Lanjutkan ke Step 4 (Integrasi MySQL Lokal & Transaksi Swap Anti-Bentrok). Tambahkan `@@unique([divisionId, drawNumber])` pada `server/prisma/schema.prisma`, jalankan `npx prisma db push`, perbarui endpoint `PATCH /api/divisions/:id/draw/manual` menggunakan transaksi 2-tahap (reset `null` lalu set nilai baru) agar swap nomor tidak pernah gagal, perbarui bulk import agar mendukung `drawNumber`, serta hubungkan auto-save dari `DrawCeremonyPanel.tsx`. Jalankan `npm run build:all` dan laporkan hasil seluruh Acceptance Criteria.
```