# UWW Static Region Flags & Emblems — AI Coding Implementation Plan

Dokumen ini adalah rencana modul ringan (**Add-on**) untuk menampilkan **bendera atau lambang daerah** pada seluruh layar aplikasi (`/display`, `/schedule`, `/controller`, dan `/tournament`) menggunakan **aset statis lokal** di dalam proyek. Pendekatan ini dirancang khusus untuk skala ~15 kontingen/daerah tanpa memerlukan tabel database MySQL baru, middleware upload (`multer`), maupun halaman manajemen file.

> **Aturan Eksekusi untuk AI Coding Agent:**
>
> 1. Modul ini **100% frontend/static** — jangan menambahkan tabel database baru atau endpoint upload di `server/`.
> 2. Kerjakan seluruh langkah secara berurutan, lalu verifikasi dengan `npx tsc --noEmit` dan `npm run build`.
> 3. Pastikan tidak pernah muncul ikon *broken image* di layar TV apabila suatu kode daerah belum memiliki file gambar.

---

## 0. Konvensi Aset & Prinsip Desain TV

### 0.1 Lokasi & Penamaan File (`public/flags/`)
Seluruh 15 file gambar disimpan langsung di folder `public/flags/` dengan nama file mengikuti nilai kolom **`Kode_Daerah`** dari Excel (huruf kapital, tanpa spasi) dan ekstensi seragam `.png`:

```text
public/
└── flags/
    ├── README.txt          # Panduan singkat penamaan file untuk panitia
    ├── LPG.png
    ├── JBR.png
    ├── DKI.png
    ├── JTM.png
    ├── JTG.png
    ├── SUMUT.png
    └── ... (sesuai daftar Kode_Daerah panitia)
```

**Keunggulan folder `public/flags/`:**
* Vite menyalin seluruh isi `public/` secara utuh ke `dist/flags/` saat proses build, sehingga Express lokal langsung menyajikannya di `/flags/<KODE>.png`.
* Jika ada revisi logo mendadak di hari pertandingan, panitia cukup menimpa file `.png` pada folder `dist/flags/` (atau `public/flags/` saat dev) tanpa perlu melakukan build ulang.
* **Spesifikasi Gambar Disarankan:** Format `.png` transparan, ukuran sekitar `256×256 px` hingga `512×512 px` (< 150 KB per file) agar tetap tajam di layar TV 1080p/4K namun ringan dimuat.

### 0.2 Prinsip Visibilitas Layar TV (1080p / 4K)
* Lambang provinsi/kabupaten di Indonesia umumnya berbentuk **perisai dengan latar transparan** dan banyak detail warna gelap.
* Gunakan selalu `object-contain` (dilarang `object-cover` agar ujung perisai tidak terpotong).
* Bungkus gambar dalam wadah bernuansa terang/netral (`bg-white/95 rounded p-0.5 shadow-sm`) agar tetap kontras di atas layar gelap (`bg-slate-950`) maupun latar sudut Merah (`#DC2626`) dan Biru (`#2563EB`).

---

## Step 1: Struktur Folder Aset & Helper Normalisasi Kode

### Tujuan
Menyiapkan folder `public/flags/` beserta utilitas kecil untuk menormalisasi `Kode_Daerah` agar selalu aman dipakai sebagai nama path URL.

### Tugas Implementasi
1. Buat folder `public/flags/` beserta file `public/flags/README.txt` yang menjelaskan aturan penamaan file (`<KODE_DAERAH>.png`, huruf besar semua, misal `LPG.png`, `JBR.png`).
2. Buat helper `src/utils/flagHelper.ts`:
   ```ts
   export function normalizeRegionCode(code?: string | null): string {
     if (!code) return '';
     return code
       .trim()
       .toUpperCase()
       .replace(/[^A-Z0-9_-]/g, '');
   }

   export function getRegionFlagUrl(code?: string | null): string | null {
     const normalized = normalizeRegionCode(code);
     if (!normalized) return null;
     return `/flags/${normalized}.png`;
   }
   ```
3. *(Opsional jika gambar panitia campur ekstensi `.png` / `.webp` / `.svg`):* Siapkan fallback berurutan atau konversi seluruh 15 aset menjadi `.png` agar tidak terjadi request 404 berulang. Default wajib gunakan `.png` tunggal.

### Acceptance Criteria (Step 1)
* [ ] Folder `public/flags/` tersedia di root proyek dan ikut tersalin ke `dist/flags/` setelah `npm run build`.
* [ ] `normalizeRegionCode(" lpg ")` mengembalikan `"LPG"` dan `getRegionFlagUrl("jbr")` mengembalikan `"/flags/JBR.png"`.

---

## Step 2: Komponen Reusable `RegionFlag.tsx`

### Tujuan
Membangun satu komponen bendera/logo daerah yang konsisten di seluruh aplikasi, tahan terhadap gambar yang belum tersedia (*graceful fallback*), dan langsung memperbarui tampilan saat partai berganti.

### Struktur File Baru
* `src/components/common/RegionFlag.tsx`

### Spesifikasi Komponen
```tsx
interface RegionFlagProps {
  code?: string | null;
  regionName?: string;              // Untuk atribut alt & title
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'tv' | 'winner';
  showFallbackText?: boolean;       // Default: true (tampilkan badge kode jika gambar tidak ada)
  className?: string;
}
```

### Tugas Implementasi
1. Buat pemetaan ukuran responsif:
   * `xs`: `h-5 w-7 text-[9px]` (baris padat di tabel / bracket kecil)
   * `sm`: `h-6 w-8 text-[10px]` (daftar atlet, antrean partai, ticker footer)
   * `md`: `h-8 w-11 text-xs` (panel `/controller`, kartu `LiveMatCard` di `/schedule`)
   * `lg`: `h-12 w-16 text-sm` (header divisi / preview undian)
   * `tv`: `h-16 w-24 text-lg` (layar TV `/display` `ScorePanel`)
   * `winner`: `h-24 w-32 text-2xl` (layar perayaan pemenang `StatusOverlay`)
2. Kelola state `hasError` dengan `useState(false)` dan **wajib reset ke `false` di dalam `useEffect`** setiap kali prop `code` berubah (krusial agar saat ganti dari partai tanpa logo ke partai yang punya logo, gambar langsung muncul).
3. Aturan render:
   * Jika `flagUrl` valid dan `!hasError`: render `<span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-white/95 p-0.5 shadow-sm ...">` berisi `<img src={flagUrl} alt={regionName || normalized} loading="eager" draggable={false} onError={() => setHasError(true)} className="h-full w-full object-contain" />`.
   * Jika `hasError` atau kode kosong:
     * Bila `showFallbackText === false`, return `null`.
     * Bila `showFallbackText === true`, render badge kotak rapi `bg-slate-700/90 text-white font-bold tracking-wider rounded` berisi teks kode daerah (misal `LPG`).

### Acceptance Criteria (Step 2)
* [ ] Ketika file `/flags/LPG.png` ada, gambar tampil tajam dengan proporsi utuh (`object-contain`) di atas wadah terang.
* [ ] Ketika file `/flags/XXX.png` tidak ada, komponen menampilkan badge teks `XXX` yang rapi tanpa ikon *broken image*.
* [ ] Mengubah prop `code` dari `"XXX"` (tidak ada file) ke `"LPG"` (ada file) langsung merender gambar `LPG.png` tanpa perlu refresh halaman.

---

## Step 3: Integrasi `<RegionFlag />` ke Seluruh Layar Aplikasi

### Tujuan
Menampilkan bendera/logo daerah secara seragam di seluruh titik tampilan penonton, operator, dan panitia.

### Titik Pemasangan Wajib
1. **Layar TV Scoreboard Utama (`/display`):**
   * `src/components/display/ScorePanel.tsx`: Pasang `<RegionFlag code={wrestler.countryOrTeam} size="tv" />` di samping nama pegulat dan label kode daerah pada sudut Merah (kiri) dan Biru (kanan).
   * `src/components/display/StatusOverlay.tsx`: Pada tampilan pengumuman pemenang (`WINNER`), pasang `<RegionFlag code={winnerRegion} size="winner" />` mendampingi nama pemenang agar terlihat megah seperti siaran resmi.
   * Footer Ticker `NEXT UP`: Pasang `<RegionFlag code={...} size="xs" />` di sebelah nama atlet merah & biru partai selanjutnya.
2. **Layar TV Jadwal Live (`/schedule`):**
   * `src/components/schedule/LiveMatCard.tsx`: Pasang `<RegionFlag code={...} size="md" />` pada sisi Merah & Biru kartu sedang bertanding.
   * `src/components/schedule/UpcomingBoutTable.tsx`: Pasang `<RegionFlag code={...} size="sm" />` di samping nama atlet pada daftar `ON DECK`, `IN THE HOLE`, dan `UPCOMING`.
3. **Panel Operator Matras (`/controller`):**
   * `src/components/controller/WrestlerControl.tsx`: Pasang `<RegionFlag code={wrestler.countryOrTeam} size="md" />` di header sudut Merah & Biru agar operator dapat memverifikasi kontingen sekilas.
   * `src/components/controller/MatchQueueDrawer.tsx`: Pasang `<RegionFlag code={...} size="xs" />` pada item antrean partai.
4. **Dashboard Turnamen (`/tournament`):**
   * `src/components/tournament/BracketViewer.tsx`: Pasang `<RegionFlag code={athlete.regionCode} size="xs" />` di dalam kartu peserta bagan Eliminasi dan baris klasemen Nordic/Group (pastikan ikut tampil rapi saat dicetak via `@media print`).
   * `src/components/tournament/DrawCeremonyPanel.tsx` & `ExcelUploadPanel.tsx`: Pasang `<RegionFlag code={...} size="sm" />` di tabel daftar atlet & preview Excel sehingga panitia langsung tahu apakah file logo untuk kode daerah tersebut sudah terdeteksi.

### Acceptance Criteria (Step 3)
* [ ] Logo daerah muncul sinkron pada `/display`, `/schedule`, `/controller`, dan `/tournament` tanpa menggeser layout (`overflow-hidden` di `/display` dan `/schedule` tetap terjaga di `1280×720`, `1920×1080`, dan `3840×2160`).
* [ ] Hasil cetak PDF bagan (`Print Bracket`) menampilkan logo dengan proporsional dan tidak pecah.
* [ ] Aplikasi tetap 100% bekerja dalam mode offline (*Airplane Mode*).

---

## Step 4: Checklist Persiapan 15 File Bendera oleh Panitia

Setelah AI Coding Agent menyelesaikan Step 1–3, lakukan langkah berikut sebelum hari pertandingan:

1. Kumpulkan seluruh 15 file bendera/lambang daerah dalam format `.png`.
2. Pastikan setiap nama file **persis sama** dengan kolom `Kode_Daerah` pada file Excel atlet (contoh: jika di Excel tertulis `LPG`, nama file wajib `LPG.png`).
3. Salin ke-15 file ke folder `public/flags/`.
4. Jalankan `npm run build:all` (atau `npm run build`), lalu unggah Excel di `/tournament` — cek tabel pratinjau untuk memastikan seluruh 15 kontingen menampilkan gambar logo (bukan badge teks fallback).

---

## Panduan Prompt Eksekusi ke AI Coding Agent

Salin dan kirim prompt berikut ke AI Coding Agent (dapat dieksekusi sekaligus dalam 1 sesi karena ruang lingkupnya ringkas):

```text
Baca PLAN-REGION-FLAGS.md secara menyeluruh. Kerjakan seluruh langkah (Step 1 hingga Step 3) untuk menambahkan dukungan bendera/logo daerah menggunakan aset statis di folder `public/flags/` tanpa mengubah skema MySQL atau menambah backend upload:
1. Buat folder `public/flags/` dengan `README.txt` dan buat `src/utils/flagHelper.ts`.
2. Buat komponen reusable `src/components/common/RegionFlag.tsx` dengan semua preset ukuran (`xs`, `sm`, `md`, `lg`, `tv`, `winner`), wadah kontras `bg-white/95` + `object-contain`, reset state `hasError` saat prop `code` berubah, serta fallback badge teks rapi jika file `.png` belum tersedia.
3. Pasang `<RegionFlag />` pada `/display` (`ScorePanel`, `StatusOverlay`, dan footer ticker), `/schedule` (`LiveMatCard`, `UpcomingBoutTable`), `/controller` (`WrestlerControl`, `MatchQueueDrawer`), dan `/tournament` (`BracketViewer`, `DrawCeremonyPanel`, `ExcelUploadPanel`).
4. Pastikan layout TV 16:9 tetap bebas overflow dan print CSS tetap rapi. Jalankan `npx tsc --noEmit` dan `npm run build`, lalu laporkan status seluruh Acceptance Criteria.
```