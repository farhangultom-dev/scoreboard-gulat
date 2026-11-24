# UWW Olympic Wrestling Digital Scoreboard — AI Coding Implementation Plan

Dokumen ini adalah blueprint pengembangan aplikasi papan skor digital gulat berbasis web sesuai peraturan **United World Wrestling (UWW)** untuk skenario kontrol dari **Laptop (`/controller`)** dan tampilan layar penuh di **TV (`/display`)**.

> **Aturan Eksekusi untuk AI Coding Agent:**
> 1. Kerjakan **SATU FASE** saja dalam setiap sesi sesuai instruksi pengguna.
> 2. Dilarang melompat ke fase berikutnya sebelum seluruh **Acceptance Criteria** pada fase aktif lulus verifikasi (`npm run build`, `tsc --noEmit`, dan `vitest` bila relevan).
> 3. Patuhi seluruh **Aturan Domain UWW** pada Bagian 0.3 tanpa modifikasi atau asumsi sendiri.

---

## 0. Konteks Global & Aturan Wajib

### 0.1 Tech Stack
- **Framework:** React 19 + TypeScript (`strict: true`) + Vite
- **Routing:** `react-router-dom` (`/controller`, `/display`, `/` redirect ke `/controller`)
- **Styling:** Tailwind CSS v4 + `lucide-react`
- **State Management:** Zustand (single source of truth berbasis Event Sourcing ringan untuk *Undo* deterministik & kalkulasi *Criteria*)
- **Dual-Screen Sync:** Native `BroadcastChannel API` + `localStorage` persistence (100% offline-first untuk setup HDMI Extended Display)
- **Audio:** Web Audio API (synthesized Olympic buzzer/horn tanpa ketergantungan file eksternal, dengan opsi ekstensi audio lokal)
- **Testing:** Vitest (wajib untuk pengujian unit *UWW Rules Engine*)

### 0.2 Struktur Direktori Target
```text
src/
├── types/
│   └── match.ts                 # Semua kontrak tipe data UWW & Sync Protocol
├── engine/
│   ├── uwwRules.ts              # Pure functions: scoring, VSU, tie-breaker criteria, DSQ
│   ├── uwwRules.test.ts         # Unit test lengkap untuk seluruh skenario UWW
│   ├── timerEngine.ts           # Kalkulasi waktu berbasis timestamp (anti-drift)
│   └── audioEngine.ts           # Web Audio API buzzer (Period End & Activity Clock End)
├── store/
│   ├── useMatchStore.ts         # Zustand store + Undo stack + LocalStorage persistence
│   └── syncChannel.ts           # BroadcastChannel publisher/subscriber + handshake protocol
├── hooks/
│   ├── usePrecisionTimer.ts     # requestAnimationFrame loop untuk render timer 60fps
│   └── useKeyboardShortcuts.ts  # Shortcut keyboard khusus operator (/controller)
├── components/
│   ├── controller/
│   │   ├── MatchSetupModal.tsx  # Input nama, kontingen, gaya (FS/WW/GR), kelas berat
│   │   ├── WrestlerControl.tsx  # Panel poin (+1,+2,+4,+5), O, P, Activity, Challenge, Injury
│   │   ├── ClockControls.tsx    # Start/Pause, edit waktu manual, Period switch, Break
│   │   ├── EventLogPanel.tsx    # Riwayat kronologis poin & tombol Undo
│   │   ├── VictoryModal.tsx     # Konfirmasi VFA, VSU/VSU1, VPO/VPO1, DSQ, VIN, VFO
│   │   └── MiniPreview.tsx      # Pratinjau mini layar TV secara real-time
│   └── display/
│       ├── DisplayHeader.tsx    # Mat, Bout #, Style, Weight Class, Period (P1/P2)
│       ├── ScorePanel.tsx       # Skor dominan Merah/Biru + indikator Criteria, O, P, Challenge
│       ├── CenterClock.tsx      # Jam utama besar + Activity Clock 30s pop-up
│       └── StatusOverlay.tsx    # Banner overlay: BREAK, CHALLENGE, INJURY, WINNER
├── pages/
│   ├── ControllerPage.tsx       # Halaman operator (Laptop)
│   └── DisplayPage.tsx          # Halaman penonton (TV 16:9 Fullscreen)
└── App.tsx
```

### 0.3 Aturan Domain UWW (Ketat — Dilarang Berhalusinasi)
1. **Nilai Poin Sah UWW:** Hanya **`+1`**, **`+2`**, **`+4`**, dan **`+5`**. **TIDAK ADA poin `+3`** pada peraturan UWW modern.
2. **Durasi Pertandingan:**
   - `SENIOR` / `U23` / `U20`: 2 babak × `180_000 ms` (3:00), jeda `30_000 ms` (0:30).
   - `U17` / `U15`: 2 babak × `120_000 ms` (2:00), jeda `30_000 ms` (0:30).
3. **Technical Superiority (VSU / VSU1):**
   - `FS` (Freestyle) & `WW` (Women's Wrestling): selisih **>= 10 poin**.
   - `GR` (Greco-Roman): selisih **>= 8 poin**.
   - Jika lawan memiliki `0` poin → sarankan `VSU`; jika lawan memiliki `>= 1` poin → sarankan `VSU1`.
   - Saat ambang tercapai, tampilkan notifikasi/alert konfirmasi di `/controller`. **Jangan** otomatis mengakhiri atau mereset laga tanpa konfirmasi operator.
4. **Passivity (`P`) & Activity Time (30s Shot Clock):**
   - **`FS` & `WW`:**
     - Passivity ke-1: peringatan verbal (`passivityCount = 1`), belum mengaktifkan shot clock.
     - Passivity ke-2 dan seterusnya: aktifkan **Activity Clock 30 detik** (`30_000 ms`) pada pegulat pasif (`activeCorner`).
     - Jika **30 detik habis** tanpa ada poin dari siapa pun → lawan otomatis mendapat **`+1` poin** (`ACTIVITY_POINT`).
     - Jika **salah satu pegulat** mencetak poin selama 30 detik berjalan → Activity Clock **langsung dibatalkan** tanpa poin penalti.
     - **Edge case:** Jika sisa waktu babak utama `< 30 detik` dan babak utama habis duluan → Activity Clock berhenti tanpa memberi poin otomatis.
   - **`GR` (Greco-Roman):**
     - Tidak menggunakan Activity Clock 30 detik.
     - Setiap Passivity (`P`) langsung memberikan **`+1` poin** kepada lawan (dan posisi *Par Terre*).
5. **Caution (`O`):**
   - Maksimal 3 kali per pegulat.
   - Caution dapat diikuti +1 atau +2 poin untuk lawan (sesuai keputusan wasit).
   - Pada Caution ke-3 (`cautions >= 3`), tampilkan alert **DSQ (3 Cautions)** di `/controller`.
6. **Tie-Breaker Criteria (Otomatis aktif saat `red.score === blue.score && red.score > 0`):**
   Evaluasi berurutan:
   - **Kriteria 1 (`HIGHEST_VALUE`):** Nilai poin teknis tunggal tertinggi. Bandingkan jumlah poin `5`, jika sama bandingkan jumlah poin `4`, lalu `2`, lalu `1`.
   - **Kriteria 2 (`FEWEST_CAUTIONS`):** Jumlah Caution (`O`) paling sedikit.
   - **Kriteria 3 (`LAST_POINT`):** Pencetak poin terakhir (*Last Point Scored* berdasarkan urutan kronologis di array `events`).
7. **Challenge:**
   - Setiap sudut memulai laga dengan 1 kuota (`hasChallenge: true`).
   - Jika *Challenge Won*: kuota tetap `true`.
   - Jika *Challenge Lost*: lawan mendapat **`+1` poin** (`CHALLENGE_LOST_POINT`) dan `hasChallenge` menjadi `false`.
8. **Timer Medis:**
   - `injuryTimer`: maksimal kumulatif `120_000 ms` (2:00) per pegulat.
   - `bloodTimer`: maksimal kumulatif `240_000 ms` (4:00) per pegulat.
   - Menjalankan timer medis otomatis mem-pause `mainClock`.

---

## Phase 1: Fondasi Proyek, Kontrak Tipe Data & Dual-Screen Sync Engine

### Tujuan
Menyiapkan boilerplate React + Vite + TypeScript + Tailwind CSS, mengunci kontrak tipe data di `src/types/match.ts`, dan membangun sinkronisasi real-time antar tab (`/controller` ↔ `/display`) menggunakan `BroadcastChannel API` dengan fallback `localStorage`.

### Kontrak Tipe Data (`src/types/match.ts`)
```ts
export type Corner = 'RED' | 'BLUE';
export type WrestlingStyle = 'FS' | 'WW' | 'GR';
export type AgeCategory = 'SENIOR' | 'U23' | 'U20' | 'U17' | 'U15';
export type MatchPhase = 'PRE_MATCH' | 'PERIOD_1' | 'BREAK' | 'PERIOD_2' | 'FINISHED';

export type VictoryType =
  | 'VFA'   // Fall (Pin)
  | 'VSU'   // Technical Superiority (loser 0 pts)
  | 'VSU1'  // Technical Superiority (loser >= 1 pt)
  | 'VPO'   // Points (loser 0 pts)
  | 'VPO1'  // Points (loser >= 1 pt)
  | 'DSQ'   // Disqualification (3 Cautions / Brutality)
  | 'VIN'   // Injury
  | 'VFO';  // Forfeit

export type PointValue = 1 | 2 | 4 | 5;

export type MatchEventType =
  | 'POINT'
  | 'CAUTION'
  | 'PASSIVITY'
  | 'ACTIVITY_POINT'
  | 'CHALLENGE_LOST_POINT'
  | 'MANUAL_ADJUST';

export interface MatchEvent {
  id: string;
  timestamp: number;        // Date.now()
  period: 1 | 2;
  matchClockMs: number;     // Sisa waktu main clock saat kejadian
  corner: Corner;           // Sudut yang menerima event/poin (untuk CAUTION/PASSIVITY = sudut yang dihukum)
  type: MatchEventType;
  points: number;           // 0 untuk CAUTION/PASSIVITY tanpa poin
  note?: string;
}

export interface TimerState {
  remainingMs: number;
  isRunning: boolean;
  lastSyncedAt: number | null; // Date.now() saat terakhir start/sync
}

export interface ActivityClockState extends TimerState {
  activeCorner: Corner | null; // Pegulat pasif yang wajib mencetak poin dalam 30s
}

export interface WrestlerState {
  name: string;
  countryOrTeam: string;    // Maks 3-6 huruf (misal: INA, JPN, JABAR)
  score: number;
  cautions: number;         // 0..3
  passivityCount: number;
  hasChallenge: boolean;
  injuryTimer: TimerState;  // Maks kumulatif 120_000 ms (2:00)
  bloodTimer: TimerState;   // Maks kumulatif 240_000 ms (4:00)
}

export interface MatchMetadata {
  matName: string;          // Contoh: "MAT A"
  boutNumber: string;       // Contoh: "BOUT 14"
  style: WrestlingStyle;
  ageCategory: AgeCategory;
  weightClass: string;      // Contoh: "74 KG"
}

export interface MatchState {
  version: number;          // Monotonic counter untuk mencegah out-of-order sync
  metadata: MatchMetadata;
  phase: MatchPhase;
  mainClock: TimerState;
  breakClock: TimerState;
  activityClock: ActivityClockState;
  red: WrestlerState;
  blue: WrestlerState;
  events: MatchEvent[];
  activeChallengeCorner: Corner | null;
  winner: {
    corner: Corner;
    type: VictoryType;
  } | null;
}

export type SyncMessage =
  | { type: 'STATE_UPDATE'; payload: MatchState }
  | { type: 'REQUEST_STATE' }
  | { type: 'DISPLAY_PING' }
  | { type: 'TRIGGER_BUZZER'; sound: 'PERIOD_END' | 'ACTIVITY_END' };
```

### Tugas Implementasi
1. Inisialisasi proyek Vite React-TS, install `react-router-dom`, `zustand`, `lucide-react`, Tailwind CSS v4, dan `vitest`.
2. Implementasikan `src/types/match.ts` persis sesuai kontrak di atas.
3. Buat `src/store/syncChannel.ts`:
   - Channel name: `'uww-wrestling-scoreboard-v1'`.
   - Storage key: `'uww_match_state_v1'`.
   - Saat `/display` dimuat, baca snapshot awal dari `localStorage` lalu kirim `{ type: 'REQUEST_STATE' }`.
   - Saat `/controller` menerima `REQUEST_STATE`, kirim segera `{ type: 'STATE_UPDATE', payload: currentState }`.
   - `/display` wajib bersifat **strictly read-only** (hanya menerima `STATE_UPDATE` dan mengabaikan state dengan `version` lebih lama kecuali setelah reset).
4. Konfigurasikan routing di `src/App.tsx` (`/controller`, `/display`, `*` redirect ke `/controller`).
5. Buat halaman stub `ControllerPage.tsx` (tombol uji +1 Merah, +1 Biru, Reset) dan `DisplayPage.tsx` (tampilkan skor real-time + badge status koneksi).

### Acceptance Criteria (Phase 1)
- [ ] `npm run build` dan `npx tsc --noEmit` lulus tanpa error.
- [ ] Perubahan di `/controller` tampil di `/display` pada tab terpisah secara instan (< 16ms).
- [ ] Refresh (`F5`) pada `/display` langsung memulihkan skor terakhir tanpa kembali ke 0.
- [ ] Refresh (`F5`) pada `/controller` mempertahankan state terakhir dari `localStorage`.

---

## Phase 2: UWW Rules Engine & Unit Testing (Pure Logic)

### Tujuan
Mengimplementasikan seluruh aturan penilaian UWW sebagai *pure functions* yang terisolasi dari UI dan terverifikasi 100% melalui Vitest.

### Tugas Implementasi
1. Buat `src/engine/uwwRules.ts`:
   - `getPeriodDurationMs(ageCategory: AgeCategory): number`
   - `getTechSuperiorityThreshold(style: WrestlingStyle): number` (`10` untuk `FS`/`WW`, `8` untuk `GR`)
   - `recalculateStatsFromEvents(events: MatchEvent[], corner: Corner): { score: number; cautions: number; passivityCount: number }`:
     - Hitung ulang secara deterministik dari `events` agar fungsi *Undo* tidak pernah menghasilkan state korup.
   - `evaluateTieBreaker(red: WrestlerState, blue: WrestlerState, events: MatchEvent[]): { leader: Corner | null; reason: 'HIGHEST_VALUE' | 'FEWEST_CAUTIONS' | 'LAST_POINT' | null }`:
     - Return `{ leader: null, reason: null }` jika `red.score !== blue.score` atau `red.score === 0`.
     - Kriteria 1: Hitung frekuensi poin bernilai `5`, lalu `4`, lalu `2`, lalu `1` (termasuk `POINT`, `ACTIVITY_POINT`, dan `CHALLENGE_LOST_POINT` sebagai poin bernilai 1).
     - Kriteria 2: Bandingkan `cautions` (lebih sedikit unggul).
     - Kriteria 3: Cari event terakhir dengan `points > 0` di array `events`.
   - `checkTechnicalSuperiority(state: MatchState): { triggered: boolean; leader: Corner | null; suggestedVictoryType: 'VSU' | 'VSU1' | null }`
   - `checkDisqualification(state: MatchState): { triggered: boolean; disqualifiedCorner: Corner | null; winnerCorner: Corner | null }`
   - `suggestEndOfMatchVictory(state: MatchState): { corner: Corner; type: 'VPO' | 'VPO1' } | null`
2. Buat/lengkapi `src/store/useMatchStore.ts` dengan action berikut:
   - `updateMetadata(metadata)` & `updateWrestlers(redInfo, blueInfo)`
   - `addPoints(corner, points: PointValue, type?: MatchEventType, note?: string)`:
     - Menambahkan event ke `events`, menghitung ulang skor, dan **otomatis membatalkan `activityClock`** jika sedang aktif.
   - `addCaution(penalizedCorner: Corner, opponentPoints: 0 | 1 | 2)`:
     - Mencatat event `CAUTION` untuk `penalizedCorner`.
     - Jika `opponentPoints > 0`, tambahkan juga event poin untuk lawan (atau kelompokkan dengan `groupId` opsional agar 1x `undoLastEvent()` membatalkan keduanya secara atomik).
   - `addPassivity(penalizedCorner: Corner)`:
     - Jika `style === 'GR'`: catat `PASSIVITY` + berikan `+1` poin kepada lawan.
     - Jika `style === 'FS' || style === 'WW'`: catat `PASSIVITY`; jika `passivityCount >= 2` setelah ditambah dan `activityClock` belum aktif, aktifkan `activityClock` (`30_000 ms`, `activeCorner: penalizedCorner`, `isRunning: mainClock.isRunning`).
   - `startActivityClock(corner: Corner)` & `cancelActivityClock()` (kontrol manual jika wasit meminta).
   - `openChallenge(corner: Corner)` & `resolveChallenge(outcome: 'WON' | 'LOST' | 'CANCEL')`.
   - `undoLastEvent()`: menghapus event terakhir (atau grup event terakhir) dan menghitung ulang seluruh skor/caution/passivity.
   - `declareWinner(corner: Corner, type: VictoryType)` & `clearWinner()`.
   - `resetMatch(options?: { keepMetadata?: boolean; incrementBout?: boolean })`.
3. Buat `src/engine/uwwRules.test.ts` yang mencakup minimal 12 skenario test:
   - `4` poin mengalahkan `2 + 2` poin pada tie-breaker (`HIGHEST_VALUE`).
   - `2 + 2` poin mengalahkan `2 + 1 + 1` poin pada tie-breaker (`HIGHEST_VALUE`).
   - Poin identik (`2 + 1` vs `2 + 1`), caution lebih sedikit menang (`FEWEST_CAUTIONS`).
   - Poin & caution identik, pencetak poin terakhir menang (`LAST_POINT`).
   - Skor `0 - 0` mengembalikan `leader: null`.
   - VSU `FS` memicu di selisih `10` (selisih `9` tidak memicu).
   - VSU `GR` memicu di selisih `8` (selisih `7` tidak memicu).
   - Membedakan `VSU` (`10-0`) dan `VSU1` (`11-1`).
   - `cautions === 3` memicu DSQ alert dan menentukan lawan sebagai pemenang.
   - `addPoints` membatalkan `activityClock` yang sedang berjalan.
   - `GR` passivity langsung menambah `+1` lawan tanpa menyalakan `activityClock`.
   - `undoLastEvent` mengembalikan skor, caution, dan evaluasi tie-breaker secara akurat.

### Acceptance Criteria (Phase 2)
- [ ] `npx vitest run` lulus 100% untuk semua test case.
- [ ] `npx tsc --noEmit` lulus tanpa error.
- [ ] Seluruh perhitungan skor dan kriteria bersumber tunggal dari `src/engine/uwwRules.ts`.

---

## Phase 3: Precision Timer Engine & Web Audio Buzzer

### Tujuan
Membangun engine waktu berpresisi tinggi berbasis selisih timestamp (`Date.now()`) agar bebas *clock drift* di browser, sinkron mulus antara `/controller` dan `/display`, serta menghasilkan bunyi buzzer otomatis via Web Audio API.

### Tugas Implementasi
1. Buat `src/engine/timerEngine.ts`:
   - `computeRemainingMs(timer: TimerState, now = Date.now()): number`:
     - Jika `!timer.isRunning || timer.lastSyncedAt === null`, return `timer.remainingMs`.
     - Return `Math.max(0, timer.remainingMs - (now - timer.lastSyncedAt))`.
   - `formatClock(ms: number, showTenthsUnderTenSeconds = true): string`:
     - Jika `ms <= 0`: return `'0:00'` (atau `'0:00.0'` bila mode tenths aktif).
     - Jika `ms >= 10_000` atau `!showTenthsUnderTenSeconds`: gunakan `Math.ceil(ms / 1000)` lalu format `M:SS`.
     - Jika `ms < 10_000` dan `showTenthsUnderTenSeconds`: format `0:0S.t` (misal `0:09.4`).
2. Buat `src/engine/audioEngine.ts`:
   - Gunakan Web Audio API (`AudioContext`):
     - `unlockAudio()`: memanggil `audioCtx.resume()` saat interaksi klik pertama operator.
     - `playPeriodEndBuzzer()`: suara buzzer/horn olahraga (dual oscillator sawtooth/square 220Hz + 277Hz dengan gain envelope, durasi ~1.2 detik).
     - `playActivityEndBeep()`: bunyi beep tajam (880Hz, durasi ~0.4 detik).
   - Mendukung toggle `isMuted` di controller dan di display (default: bunyi aktif di controller, opsional di display via tombol audio).
3. Tambahkan action kontrol waktu di `useMatchStore.ts`:
   - `toggleMainClock()` — saat di-pause, `activityClock` **ikut di-pause** (menyimpan `remainingMs` terbaru); saat di-resume, `activityClock` (jika `activeCorner !== null`) **ikut berjalan kembali**.
   - `adjustMainClock(deltaMs: number)` & `setMainClock(ms: number)` (hanya saat paused).
   - `toggleBreakClock()`, `switchPhase(phase: MatchPhase)`.
   - `toggleMedicalTimer(corner: Corner, kind: 'injury' | 'blood')` — otomatis mem-pause `mainClock` saat timer medis dinyalakan.
4. Buat `src/hooks/usePrecisionTimer.ts`:
   - Menggunakan `requestAnimationFrame` untuk membaca `computeRemainingMs` di 60fps tanpa memicu broadcast berulang.
   - Khusus di `/controller` (master tick loop ~50ms):
     - **Transisi `mainClock === 0`:**
       - Di `PERIOD_1`: pause `mainClock`, batalkan `activityClock` (**tanpa menambah poin!**), bunyikan `PERIOD_END`, pindah ke `phase: 'BREAK'`, set `breakClock` ke `30_000 ms` dan mulai otomatis.
       - Di `PERIOD_2`: pause `mainClock`, batalkan `activityClock`, bunyikan `PERIOD_END`, tampilkan saran pemenang akhir.
     - **Transisi `breakClock === 0`:**
       - Bunyikan `ACTIVITY_END` beep, pindah ke `phase: 'PERIOD_2'`, set `mainClock` ke `getPeriodDurationMs(ageCategory)` dalam kondisi paused.
     - **Transisi `activityClock === 0` (ketika `mainClock > 0`):**
       - Bunyikan `ACTIVITY_END` beep, nonaktifkan `activityClock`, dan otomatis tambahkan **`+1` poin (`ACTIVITY_POINT`)** kepada **lawan** dari `activeCorner`.

### Acceptance Criteria (Phase 3)
- [ ] Selisih tampilan jam antara `/controller` dan `/display` selalu <= 50ms selama 3 menit berjalan penuh.
- [ ] Pause `mainClock` otomatis mem-pause `activityClock`, dan resume melanjutkannya secara akurat.
- [ ] `activityClock` habis di tengah babak otomatis memberi `+1` ke lawan dan tercatat di `events`.
- [ ] `mainClock` habis lebih dulu daripada `activityClock` membatalkan `activityClock` tanpa menambah poin.
- [ ] Menjalankan `injuryTimer` / `bloodTimer` otomatis mem-pause `mainClock`.
- [ ] Buzzer berbunyi otomatis saat akhir babak dan akhir activity time.

---

## Phase 4: Operator Controller UI (`/controller`)

### Tujuan
Membangun antarmuka meja operator yang cepat, jelas, muat pada resolusi laptop standar (`1366×768` s.d. `1920×1080`), anti salah klik (*anti-misclick*), dan mendukung navigasi keyboard penuh.

### Tugas Implementasi
1. **Top Navigation Bar:**
   - Info partai aktif (`MAT A • BOUT 14 • FS 74 KG • SENIOR`).
   - Tombol **"Match Setup"** (membuka `MatchSetupModal.tsx` untuk ubah nama, kontingen, gaya FS/WW/GR, kategori umur, berat, matras, nomor partai).
   - Tombol **"Open TV Display"** (`window.open('/display', 'UWW_TV_DISPLAY', 'width=1280,height=720')`).
   - Badge status sinkronisasi (`Display Online` / `Standby`), tombol Mute/Test Buzzer, dan tombol `?` untuk cheat-sheet Keyboard Shortcuts.
2. **Main 3-Column Workspace (`RED | CENTER | BLUE`):**
   - **`WrestlerControl.tsx` (Kiri = RED, Kanan = BLUE):**
     - Header nama pegulat, kode kontingen, skor besar, dan badge emas **`CRITERIA`** saat unggul tie-breaker.
     - 4 tombol poin berukuran besar dan kontras: **`+1`**, **`+2`**, **`+4`**, **`+5`**.
     - Panel pelanggaran & status:
       - **Caution (`O`)**: 3 indikator bulatan + tombol cepat (`O`, `O +1`, `O +2`).
       - **Passivity (`P`)**: badge jumlah P + tombol aksi Passivity (otomatis mengikuti aturan `FS`/`WW` vs `GR`) + tombol kontrol manual `30s Activity` / `Cancel Activity` (khusus `FS`/`WW`).
       - **Challenge**: tombol trigger Challenge (`Won`, `Lost +1`, `Cancel`) + status kuota tersisa.
       - **Medis**: tombol toggle **Injury (2:00)** dan **Blood (4:00)** lengkap dengan tampilan sisa waktu.
   - **`ClockControls.tsx` & `MiniPreview.tsx` (Tengah):**
     - Tampilan jam utama besar (`tabular-nums`) + tombol dominan **`START / PAUSE (Space)`**.
     - Kontrol koreksi waktu (`-1s`, `+1s`, dan modal/inline edit `MM:SS` saat paused).
     - Tombol kontrol babak (`P1`, `BREAK 0:30`, `P2`).
     - Banner alert mencolok otomatis saat **VSU terdeteksi** atau **3 Cautions (DSQ) terdeteksi** dengan tombol langsung menuju `VictoryModal`.
     - Tombol **`DECLARE WINNER`** (membuka `VictoryModal.tsx`) dan **`RESET MATCH`** (wajib dengan dialog konfirmasi).
     - **`MiniPreview.tsx`**: pratinjau rasio 16:9 yang merender tampilan mini TV secara live.
3. **Bottom Panel (`EventLogPanel.tsx`):**
   - Daftar riwayat event kronologis (terbaru di atas) dengan format: `[P1 02:14] RED +2 (POINT)`.
   - Tombol **`UNDO (Ctrl+Z)`** yang mudah dijangkau.
4. **Keyboard Shortcuts (`src/hooks/useKeyboardShortcuts.ts`):**
   - Wajib nonaktif otomatis ketika `document.activeElement` berada di `<input>`, `<textarea>`, atau `<select>`, atau saat modal sedang terbuka.
   - Pemetaan tombol:
     - `Space`: Start / Pause Main Clock
     - `Q`, `W`, `E`, `R`: Poin `+1, +2, +4, +5` untuk **RED**
     - `U`, `I`, `O`, `P`: Poin `+1, +2, +4, +5` untuk **BLUE**
     - `A`: Passivity **RED** | `L`: Passivity **BLUE**
     - `Ctrl+Z` / `Cmd+Z`: Undo Event Terakhir

### Acceptance Criteria (Phase 4)
- [ ] Seluruh kontrol utama muat dalam 1 layar `1366×768` tanpa perlu scroll vertikal berlebihan.
- [ ] Seluruh keyboard shortcuts bekerja akurat dan tidak bocor saat mengetik di `MatchSetupModal`.
- [ ] Tombol destruktif (`Reset Match`) dilindungi konfirmasi.
- [ ] `VictoryModal` otomatis menyorot pemenang & kode kemenangan yang disarankan (`VSU`/`VSU1`/`VPO`/`VPO1`/`DSQ`).

---

## Phase 5: Olympic Broadcast TV Display UI (`/display`)

### Tujuan
Membangun antarmuka layar penonton 16:9 bergaya siaran resmi UWW (*high-contrast*, terbaca dari jarak 20–30 meter, tanpa scrollbar, tanpa clutter).

### Spesifikasi Desain Visual
- **Root Container:** `h-screen w-screen overflow-hidden bg-slate-950 text-white select-none` dengan `font-variant-numeric: tabular-nums`.
- **Palet Warna Resmi UWW:**
  - Sudut Merah: `#DC2626` (aksen gelap `#7F1D1D`)
  - Sudut Biru: `#2563EB` (aksen gelap `#1E3A8A`)
  - Jam Utama: Putih terang (`#FFFFFF`), berubah menjadi Kuning Neon (`#FACC15`) saat `< 10 detik`.
  - Aksen Criteria / Activity / Challenge: Emas/Kuning (`#FACC15` / `#F59E0B`).
- **Struktur 3 Zona Vertikal:**
  1. **Header Strip (~12% tinggi layar) — `DisplayHeader.tsx`:**
     - Kiri: `MAT A • BOUT 14`
     - Tengah: Badge Gaya & Kelas Berat (misal: `FREESTYLE • 74 KG`)
     - Kanan: Indikator Babak besar (`PERIOD 1` / `BREAK` / `PERIOD 2`).
  2. **Arena Skor Utama (~76% tinggi layar) — `ScorePanel.tsx` & `CenterClock.tsx`:**
     - **Kiri (RED) & Kanan (BLUE):**
       - Nama Pegulat berukuran besar (uppercase, bold) + Badge Kontingen (`INA`).
       - **Angka Skor Raksasa** (`clamp(6rem, 16vw, 18rem)`), rata tengah.
       - **Indikator Tie-Breaker Criteria:** Bingkai/garis bawah kuning emas terang + label `CRITERIA` pada kotak skor pegulat yang sedang unggul saat seri.
       - **Status Bar Bawah Skor:**
         - 3 indikator kotak Caution **`O`** (menyala kuning/oranye sesuai jumlah caution).
         - Badge Passivity **`P`** (menyala saat `passivityCount > 0`, menampilkan angka jika > 1).
         - Badge **`CHALLENGE`** (terang jika `hasChallenge: true`, redup/dicoret jika sudah hangus).
     - **Kolom Tengah (`CenterClock.tsx`):**
       - Jam Utama raksasa (`clamp(4rem, 9vw, 10rem)`).
       - **Activity Clock 30s Box:** Muncul menonjol di bawah jam utama hanya saat aktif, dengan panah arah ke sudut pasif (`◀ ACTIVITY 0:24` untuk Merah, `ACTIVITY 0:24 ▶` untuk Biru).
  3. **Footer Ticker (~12% tinggi layar):**
     - Menampilkan aksi terakhir (`LAST: RED +2`) atau bar *Injury/Blood Timer* berukuran jelas jika sedang berjalan.
- **Overlays (`StatusOverlay.tsx`):**
  - `BREAK`: Banner tengah besar `BREAK — 0:28` (skor kedua sudut tetap terlihat di samping/latar).
  - `CHALLENGE`: Banner kontras tinggi kuning/hitam `CHALLENGE REVIEW — RED / BLUE`.
  - `WINNER`: Layar pengumuman hasil akhir menampilkan warna sudut pemenang, Nama, Kontingen, Skor Akhir, dan label kemenangan lengkap (misal: `WINNER BY TECHNICAL SUPERIORITY (VSU)`).
- **Fullscreen UX:** Tombol melayang kecil `Fullscreen` + tombol `Audio` di pojok kanan bawah yang muncul hanya saat kursor bergerak, lalu otomatis menghilang (*auto-hide cursor & controls*) setelah 3 detik diam.

### Acceptance Criteria (Phase 5)
- [ ] Tampilan proporsional tanpa overflow/scrollbar pada `1280×720`, `1920×1080`, dan `3840×2160`.
- [ ] Angka jam dan skor tidak bergeser horizontal saat berubah (`tabular-nums`).
- [ ] Indikator `CRITERIA`, `O`, `P`, `CHALLENGE`, dan `30s ACTIVITY` kontras tinggi dan terbaca jelas dari jauh.

---

## Phase 6: Ketahanan Lapangan, Export Data & PWA Offline

### Tujuan
Menjadikan aplikasi siap pakai untuk turnamen lokal/nasional secara 100% offline, memiliki arsip hasil pertandingan, dan mudah diekspor oleh panitia.

### Tugas Implementasi
1. **Match History & Export:**
   - Simpan arsip pertandingan selesai ke `localStorage` (`uww_match_history_v1`) saat operator mengonfirmasi pemenang di `VictoryModal`.
   - Tambahkan modal **Match History** di `/controller` untuk melihat daftar partai yang sudah selesai.
   - Tambahkan fungsi **"Export CSV"** (ringkasan semua partai + skor akhir + kode kemenangan) dan **"Export Match Sheet (JSON)"** (detail lengkap termasuk kronologi `events`).
   - Tambahkan tombol **"Save & Next Bout"** yang menyimpan partai aktif ke riwayat, menaikkan angka pada `boutNumber` secara otomatis (`BOUT 14` → `BOUT 15`), mengosongkan nama pegulat, dan mereset skor/timer.
2. **PWA (Progressive Web App) Offline-First:**
   - Install & konfigurasi `vite-plugin-pwa` (`registerType: 'autoUpdate'`, manifest aplikasi + ikon SVG scoreboard).
   - Pastikan seluruh bundle JS/CSS/font tersimpan di Service Worker cache sehingga aplikasi bisa dibuka dan dijalankan penuh dalam kondisi *Airplane Mode* (tanpa internet).
3. **Verifikasi End-to-End Lapangan:**
   - Simulasi 1 laga `FS 74 KG`: 2 babak, break 30s, 2× passivity → activity clock habis → `+1` otomatis, challenge lost, tie-breaker criteria, menang `VPO1`.
   - Simulasi 1 laga `GR 87 KG`: passivity langsung `+1` tanpa activity clock, selisih 8 poin → alert `VSU`.
   - Uji *hard refresh* kedua jendela di tengah babak berjalan.

### Acceptance Criteria (Phase 6)
- [ ] Aplikasi dapat di-install sebagai PWA di Chrome/Edge dan tetap berfungsi penuh dalam mode offline (*Network: Offline* di DevTools).
- [ ] Export CSV menghasilkan file valid yang terbuka rapi di Excel/Google Sheets.
- [ ] "Save & Next Bout" menyimpan riwayat dan menyiapkan partai berikutnya tanpa error.

---

## Phase 7 (Opsional / Ekspansi): Nirkabel LAN Multi-Screen (Node.js + Socket.io)

*Eksekusi fase ini hanya jika dibutuhkan skenario tanpa kabel HDMI (misal: 1 laptop mengontrol Smart TV / Mini PC via Wi-Fi lokal atau multi-matras).*

### Tugas Implementasi
1. Buat abstraksi interface `SyncTransport` (`src/store/transports/`):
   - `BroadcastChannelTransport` (default, tanpa server, untuk HDMI).
   - `SocketIoTransport` (opsional, aktif jika mode LAN dipilih).
2. Buat server ringan di folder `server/` (Node.js + Express + `socket.io`):
   - Mendukung multi-matras berbasis room (`matId`: `MAT A`, `MAT B`, `MAT C`).
   - Menyajikan hasil build statis Vite (`dist/`) pada port lokal (misal `:3000`) sehingga Smart TV cukup membuka `http://<IP-LAPTOP>:3000/display?mat=A`.
3. Tampilkan QR Code URL `/display` lokal di layar `/controller` agar perangkat TV/tablet dapat langsung terhubung.

---

## Panduan Prompt Eksekusi ke AI Coding Agent

Salin dan kirim prompt berikut satu per satu sesuai fase yang sedang dikerjakan:

### Prompt Phase 1
```text
Baca file PLAN.md secara menyeluruh. Kerjakan HANYA Phase 1 (Fondasi Proyek, Kontrak Tipe Data & Dual-Screen Sync Engine) sesuai spesifikasi dan struktur direktori pada PLAN.md. Jangan kerjakan Phase 2 dulu. Setelah selesai, jalankan `npx tsc --noEmit` dan `npm run build`, lalu laporkan status setiap Acceptance Criteria Phase 1.
```

### Prompt Phase 2
```text
Baca PLAN.md. Lanjutkan ke Phase 2 (UWW Rules Engine & Unit Testing). Pastikan semua aturan domain UWW di Bagian 0.3 diimplementasikan secara ketat di `src/engine/uwwRules.ts`, integrasikan ke Zustand store, dan buat minimal 12 unit test di `src/engine/uwwRules.test.ts`. Jalankan `npx vitest run` dan `npx tsc --noEmit`, lalu laporkan hasilnya.
```

### Prompt Phase 3
```text
Baca PLAN.md. Lanjutkan ke Phase 3 (Precision Timer Engine & Web Audio Buzzer). Implementasikan `timerEngine.ts`, `audioEngine.ts`, dan `usePrecisionTimer.ts` lengkap dengan seluruh aturan sinkronisasi Main Clock, Break Clock, Activity Clock 30s, dan Injury/Blood Timer. Pastikan `npm run build` dan seluruh test lulus.
```

### Prompt Phase 4
```text
Baca PLAN.md. Lanjutkan ke Phase 4 (Operator Controller UI `/controller`). Bangun seluruh komponen di `src/components/controller/` dan `useKeyboardShortcuts.ts` agar nyaman di layar 1366x768, responsif, anti-misclick, dan terhubung penuh ke store & timer engine. Verifikasi dengan `npm run build`.
```

### Prompt Phase 5
```text
Baca PLAN.md. Lanjutkan ke Phase 5 (Olympic Broadcast TV Display UI `/display`). Bangun tampilan 16:9 high-contrast standar UWW di `src/components/display/` lengkap dengan indikator Criteria, O, P, Challenge, Activity Clock 30s, StatusOverlay, dan auto-hide fullscreen controls. Verifikasi dengan `npm run build`.
```

### Prompt Phase 6
```text
Baca PLAN.md. Lanjutkan ke Phase 6 (Ketahanan Lapangan, Export Data & PWA Offline). Tambahkan Match History, Export CSV/JSON, tombol "Save & Next Bout", dan konfigurasi `vite-plugin-pwa` agar berjalan 100% offline. Jalankan seluruh test dan `npm run build`, lalu berikan ringkasan verifikasi akhir.
```