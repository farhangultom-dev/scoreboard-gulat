# UWW Official Bracket PDF Download (Per Kelas) — Implementation Plan

Dokumen ini adalah rencana implementasi fitur **Download Bracket PDF per Kelas** yang meniru tata letak resmi **UWW Arena Bracket Sheet** (seperti referensi PDF `Seniors - FS - 57 kg`, Arena v1.7), dibangun **100% client-side & offline-first** tanpa memerlukan server headless browser maupun migrasi skema MySQL.

> **Aturan Eksekusi untuk AI Coding Agent:**
>
> 1. Modul ini **100% frontend/pure TypeScript** menggunakan **`jspdf`** (vector PDF drawing berbasis milimeter) agar hasil cetak tajam di kertas A4 maupun saat diperbesar, bebas blur, dan instan (< 100 ms).
> 2. Jangan mengubah skema tabel MySQL (`server/prisma/schema.prisma`) untuk tahap ini.
> 3. Seluruh fungsi perhitungan layout & koordinat pohon bagan harus dipisahkan menjadi *pure module* yang mudah diuji dengan Vitest.
> 4. Verifikasi akhir wajib lulus `npx tsc --noEmit`, `npm run build:all`, dan `npx vitest run`.

---

## 0. Analisis Referensi Visual (UWW Arena Bracket Sheet)

Berdasarkan dokumen referensi UWW Arena (`Seniors - FS - 57 kg`, 2 halaman A4 Portrait), berikut elemen visual wajib yang akan direplikasi:

1. **Header Resmi Dokumen (Setiap Halaman)**
   * Bingkai kotak tipis di bagian atas dengan 3 zona:
     * **Kiri:** Timestamp export (`YYYY MMM DD HH:mm:ss`, misal `2026 Nov 22 16:45:00`)
     * **Tengah (Tebal & Dominan):** `<AgeCategory> - <Style> - <WeightClass>` (misal `Seniors - FS - 57 kg` atau `Senior - FS - 74 kg`)
     * **Kanan:** Nama Turnamen & Tahun (diambil dari `tournamentName` di `useTournamentStore`, misal `PORPROV X LAMPUNG 2026`)
2. **Header Kolom Babak (Black Rounded Pill Bars)**
   * Bar hitam solid (`#000000`) dengan teks putih bold di atas setiap kolom babak:
     * `Qualif.` | `1/16 Final` | `1/8 Final` | `1/4 Final` | `1/2 Final` | `Final 1-2`
   * Kolom menyesuaikan otomatis dengan ukuran bagan (`B = 8`, `B = 16`, `B = 32`, serta ada/tidaknya babak `QUALIFICATION`).
3. **Anatomi Node Partai (Bracket Tree Connector)**
   * **Slot Atas (RED)** dan **Slot Bawah (BLUE)** berupa garis horizontal.
   * **Batang Konektor Vertikal Hitam Gelap (`#333333`)** di sisi kanan yang menghubungkan slot atas & bawah, dengan **nomor partai (`boutNumber`)** tercetak putih bold di tengah batang (misal `14`, `856`, `976`). Jika `boutNumber` belum di-generate, tampilkan `-` atau posisi singkat.
   * **Highlight Pemenang:** Baris pemenang diberi arsir **hijau UWW (`#3c9a45`)** dengan teks putih bold.
   * **Format Label Atlet:** `<REGION_CODE> <NAMA_ATLET> (<TS seed | drawNumber>)`
     * Contoh ber-seed: `LPG UMAR NUGRAHA (TS 1)`
     * Contoh tanpa seed: `JBR BUDI SANTOSO (12)`
     * Jika slot belum terisi (`TBD`): biarkan garis kosong rapi (atau label sumber tipis bila preview).
   * **Baris Skor & Jenis Kemenangan** (di bawah garis pemenang / pasangan):
     * Format resmi UWW: `<CP_Win>-<CP_Lose>(<TP_Win>-<TP_Lose>) by <VictoryType>`
     * Contoh: `3-1(8-1) by VPO1`, `4-0(10-0) by VSU`, `5-0(10-2) by VFA`.
     * Untuk kemenangan non-teknis (`VIN` / `VFO` / `DSQ`): tambahkan badge merah kecil (`INJ`, `FFT`, `DSQ`) dan efek *strikethrough* tipis pada nama atlet yang kalah, persis seperti referensi UWW Arena.
4. **Blok Repechage & Perebutan Perunggu (`Final 3-5`)**
   * Ditempatkan di bawah bagan utama (atau otomatis pindah ke Halaman 2 bila `N > 16` / ruang halaman 1 tidak mencukupi).
   * Dua jalur terpisah (**TOP / Repechage 1 -> Final 3-5** dan **BOTTOM / Repechage 2 -> Final 3-5**) dengan bar header hitam `Repechage` (1 atau 2 kolom sesuai jumlah ronde repechage di `uwwBracketEngine`) dan `Final 3-5`.
5. **Footer Resmi (Setiap Halaman)**
   * Garis tipis horizontal di margin bawah, dengan teks info matras di kiri (misal `MAT A`) dan label sistem di kanan (`PORPROV X LAMPUNG 2026 • UWW Scoreboard`).
6. **Dukungan Lengkap Seluruh Format Divisi**
   * `ELIMINATION_REPECHAGE` (`N >= 8`): Pohon eliminasi penuh gaya UWW Arena + blok Repechage & `Final 3-5` (1 halaman untuk `N <= 16`, 2 halaman otomatis untuk `N = 17..32`).
   * `GROUP_CROSS` (`N = 6..7`): Tabel Klasemen Pool A & Pool B + daftar hasil grup + pohon mini `1/2 Final` -> `Final 1-2` & `Final 3-5` gaya UWW Arena.
   * `NORDIC` (`N = 3..5`): Tabel Klasemen Resmi UWW (Rank, Atlet, Kontingen, Main, Menang, CP, VFA, VSU, TP+, TP-) + tabel daftar partai per ronde berformat hasil UWW.
   * `SINGLE_BOUT` (`N = 2`): Bagan tunggal `Final 1-2` gaya UWW Arena + ringkasan hasil.

---

## Step 1: Instalasi Dependency & Struktur Modul PDF Engine

### Tujuan
Menyiapkan library vector PDF `jspdf` dan kontrak data *pure* untuk penyusunan dokumen bagan per kelas.

### Tugas Implementasi
1. Install dependency frontend:
   ```bash
   npm install jspdf
   ```
   *(Ukuran bundle diisolasi melalui dynamic `import()` saat tombol Download diklik, sehingga tidak menambah ukuran initial bundle aplikasi maupun memicu warning chunk Vite).*
2. Buat file helper & tipe layout baru:
   * `src/engine/bracketPdfLayout.ts` — *Pure TypeScript layout engine* (tanpa DOM/React) yang menghitung:
     * Daftar kolom babak aktif (`columns`), misal `['QUALIFICATION', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'GOLD_FINAL']`.
     * Koordinat Y (`topY`, `bottomY`, `midY`) setiap partai pada pohon eliminasi secara rekursif dari kolom awal hingga `GOLD_FINAL` sehingga garis konektor selalu sejajar presisi dan tidak bertabrakan.
     * Pemetaan format label atlet (`formatUwwAthleteLabel`), format skor hasil (`formatUwwResultLine`), status badge khusus (`INJ` / `FFT` / `DSQ`), dan penentuan pagination (`pages: 1 | 2`).
     * Pemetaan nama file yang aman (`buildBracketPdfFilename`, misal `Bracket_FS_SENIOR_57KG.pdf`).

### Acceptance Criteria (Step 1)
* [ ] `jspdf` terpasang di `package.json` dan tidak memperbesar main chunk Vite (dimuat secara *lazy* lewat dynamic import).
* [ ] `bracketPdfLayout.ts` menghitung posisi koordinat seluruh node partai tanpa tumpang tindih untuk `N = 2`, `N = 5` (Nordic), `N = 6` (Group Cross), `N = 8`, `N = 11`, `N = 16`, `N = 18`, dan `N = 32`.

---

## Step 2: Vector PDF Renderer Gaya UWW Arena (`bracketPdfExporter.ts`)

### Tujuan
Mengimplementasikan renderer `jsPDF` yang menggambar elemen vektor (header, kotak babak hitam, garis slot atlet, arsir pemenang hijau, batang konektor hitam berisi nomor partai, badge `INJ`/`FFT`, blok Repechage & `Final 3-5`, tabel Nordic/Group Cross, dan footer).

### Struktur File Baru
* `src/engine/bracketPdfExporter.ts`

### Tugas Implementasi
1. **Konstanta Desain A4 Portrait (`210mm × 297mm`):**
   * Margin kiri/kanan `8mm`, atas/bawah `8mm`, lebar area konten `194mm`.
   * Palet warna persis referensi UWW Arena:
     * Header pill & teks utama: `#000000`
     * Batang konektor partai: `#333333` (teks nomor partai putih bold)
     * Highlight pemenang: `#3c9a45` (teks putih bold)
     * Badge cedera/WO/DSQ: `#dc2626` (teks putih bold `INJ` / `FFT` / `DSQ`)
     * Garis pemisah & teks hasil sekunder: `#374151` / `#4b5563`
2. **Fungsi Utama yang Diekspor:**
   * `renderDivisionBracketToPdf(doc, params)` — merender 1 divisi ke instance `jsPDF` (mendukung multi-halaman otomatis bila `N > 16`).
   * `downloadDivisionBracketPdf(params)` — memuat `jsPDF` secara dinamis (`await import('jspdf')`), memanggil `renderDivisionBracketToPdf`, lalu men-trigger download `Bracket_<STYLE>_<AGE>_<WEIGHT>.pdf`.
   * `downloadAllBracketsPdf(params)` *(Opsional / Bonus)* — menggabungkan seluruh divisi yang sudah dikunci (`isDrawLocked === true`) ke dalam 1 file PDF turnamen lengkap (`All_Brackets_<TournamentName>.pdf`) dengan pemisah halaman otomatis antar kelas.
3. **Renderer Per Format Divisi:**
   * `renderEliminationBracketPages(...)`:
     * Menggambar kolom `Qualif.` (hanya slot pasangan yang punya partai kualifikasi), `1/16 Final` (jika `B = 32`), `1/8 Final` (jika `B >= 16`), `1/4 Final`, `1/2 Final`, dan `Final 1-2` (garis pemenang akhir).
     * Untuk `N <= 16`: Seluruh Main Bracket + blok `Repechage` & `Final 3-5` muat dalam **1 halaman A4 Portrait** yang padat dan terbaca jelas.
     * Untuk `N > 16` (`B = 16` dengan banyak Qualif atau `B = 32`): Otomatis dibagi menjadi **2 halaman A4 Portrait** (Halaman 1: Paruh Atas + sebagian Paruh Bawah hingga baris batas, Halaman 2: lanjutan Paruh Bawah + blok `Repechage` & `Final 3-5`), lengkap dengan konektor menerus antar halaman seperti referensi PDF.
   * `renderGroupCrossPage(...)`:
     * Tabel Klasemen Pool A & Pool B berdampingan (menggunakan `calculateNordicStandings`), daftar partai grup dengan format skor UWW, dan diagram pohon Cross Semifinal -> `Final 1-2` + `Final 3-5`.
   * `renderNordicPage(...)`:
     * Tabel Klasemen Resmi UWW + daftar lengkap pertandingan per ronde (`Round 1`..`Round 5`) dengan arsir hijau pemenang & format `CP(TP) by TYPE`.
   * `renderSingleBoutPage(...)`:
     * Diagram 1 partai `Final 1-2` gaya UWW Arena dengan highlight pemenang & detail skor.

### Acceptance Criteria (Step 2)
* [ ] File PDF dapat dibuka di Chrome, Edge, dan Adobe Reader dengan teks vektor tajam (dapat di-select/copy) dan bebas overlap teks.
* [ ] Pemenang pada setiap partai terarsir hijau `#3c9a45`, batang konektor hitam memuat nomor partai yang tepat, dan skor tampil dalam format `CP-CP(TP-TP) by TYPE`.
* [ ] Kemenangan `VIN`/`VFO`/`DSQ` menampilkan badge merah `INJ`/`FFT`/`DSQ` dan garis coret pada atlet yang kalah.
* [ ] Blok `Repechage` dan `Final 3-5` tampil rapi untuk kedua sisi (`TOP` & `BOTTOM`), termasuk rantai 2 ronde repechage pada `N = 17..31`.

---

## Step 3: Integrasi Tombol Download pada UI `/tournament`

### Tujuan
Menyediakan tombol **Download Bracket (PDF)** yang mudah dijangkau panitia di halaman Sekretariat Turnamen (`/tournament`) tanpa mengganggu layout existing.

### File yang Dimodifikasi
1. `src/components/tournament/BracketViewer.tsx`:
   * Tambahkan tombol **"Download PDF"** (ikon `FileDown` dari `lucide-react`) di header panel `BracketViewer` (sebelah kanan judul bagan, tampil baik saat format `ELIMINATION_REPECHAGE`, `GROUP_CROSS`, `NORDIC`, maupun `SINGLE_BOUT`).
   * Saat `isPreview === true` (draft draw belum dikunci), tetap izinkan unduh dengan label watermark/header tambahan `(DRAFT PREVIEW)` atau nonaktifkan sesuai kebutuhan — disarankan tetap aktif dengan label `DRAFT` agar panitia bisa cetak draft hasil undian untuk ditandatangani manajer tim!
   * Tambahkan state loading singkat (`isExportingPdf`) agar mencegah klik ganda saat dynamic import pertama kali berjalan.
2. `src/pages/TournamentPage.tsx`:
   * Tambahkan tombol cepat **"Download Bracket PDF"** di area kontrol header kategori aktif (atau di dekat tombol `Print` pada navbar kanan) ketika `activeDivision` memiliki partai / sedang melihat tab `BRACKET`.
   * *(Opsional)* Tambahkan tombol **"Export Semua Bagan (PDF)"** di grup aksi turnamen bila terdapat minimal 1 divisi yang sudah dikunci (`isDrawLocked`).

### Acceptance Criteria (Step 3)
* [ ] Klik tombol **"Download PDF"** pada suatu kelas langsung mengunduh file `.pdf` bernama rapi (contoh: `Bracket_FS_SENIOR_74KG.pdf`) tanpa membuka dialog print browser.
* [ ] Tombol berfungsi pada seluruh 4 format divisi (`SINGLE_BOUT`, `NORDIC`, `GROUP_CROSS`, `ELIMINATION_REPECHAGE`), baik sebelum hasil diisi (kosong untuk panitia matras) maupun setelah hasil pertandingan terisi sebagian/seluruhnya.

---

## Step 4: Unit Testing & Verifikasi Build

### Tujuan
Memastikan perhitungan koordinat bagan, formatting label/skor UWW, pemisahan halaman, dan integrasi UI bebas bug serta tidak memengaruhi 110 test existing.

### File Test Baru
* `src/engine/bracketPdfLayout.test.ts`:
  * Uji `formatUwwAthleteLabel` (dengan `seed` -> `(TS 1)`, tanpa `seed` -> `(12)`, nama panjang terpotong rapi).
  * Uji `formatUwwResultLine` untuk semua `VictoryType` (`VFA`, `VSU`, `VSU1`, `VPO`, `VPO1`, `VIN`, `VFO`, `DSQ`) dan deteksi status badge (`INJ`, `FFT`, `DSQ`).
  * Uji `computeEliminationPdfLayout` untuk `N = 8`, `N = 11`, `N = 16` (1 halaman, 1 kolom repechage), `N = 18` (2 kolom repechage), dan `N = 32` (2 halaman, mencakup `1/16 Final` hingga `Final 1-2`): pastikan tidak ada node yang beririsan (overlap) dan semua konektor merujuk koordinat yang valid.
  * Uji `buildBracketPdfFilename` untuk karakter spasi & huruf besar/kecil.
* Update ringan di `src/pages/TournamentPage.test.tsx` (jika relevan) untuk memastikan tombol Download PDF tampil saat divisi memiliki bagan.

### Perintah Verifikasi Akhir
```bash
npm run build:all
npx vitest run
```

### Acceptance Criteria Akhir
* [ ] `npm run build:all` sukses (`exit code 0`) dan seluruh chunk frontend tetap `< 500 kB` (karena `jspdf` dimuat via dynamic `import()`).
* [ ] Seluruh unit test lama (110 test) + test baru untuk PDF layout lulus 100%.
* [ ] Hasil file PDF yang diunduh secara visual menyerupai dokumen referensi UWW Arena (header resmi, pil hitam nama babak, konektor hitam + nomor partai, highlight hijau pemenang, format skor `CP(TP) by TYPE`, serta blok Repechage & `Final 3-5`).
