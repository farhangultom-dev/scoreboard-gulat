# UWW Olympic Wrestling Scoreboard & Tournament — Local MySQL Backend Plan

Dokumen ini adalah rencana ekspansi terpisah (**Phase 12 – Phase 15**) yang melengkapi `PLAN.md` (Core Scoreboard Phase 1–6) dan `PLAN-TOURNAMENT.md` (Tournament & Schedule Phase 8–11). Dokumen ini menggantikan *Phase 7* opsional di `PLAN.md` dengan backend **Node.js + Express + Prisma + MySQL + Socket.IO** yang dirancang khusus untuk **eksekusi 100% lokal (offline di laptop panitia/GOR, tanpa deploy ke server cloud)**.

> **Prasyarat & Aturan Eksekusi untuk AI Coding Agent:**
> 1. Pastikan **Phase 1 – Phase 6** (`PLAN.md`) dan **Phase 8 – Phase 11** (`PLAN-TOURNAMENT.md`) sudah selesai dan lolos `npm run build` serta `npx vitest run`.
> 2. Kerjakan **SATU FASE** per sesi sesuai instruksi pengguna.
> 3. Patuhi seluruh batasan **Local-Only** di Bagian 0.1 — jangan menambahkan kompleksitas cloud/production yang tidak diperlukan.
> 4. Patuhi seluruh **Aturan Integritas Data** di Bagian 0.3 agar database tetap cepat, aman dari crash, dan memiliki jejak audit resmi.

---

## 0. Prinsip Local-Only, Arsitektur & Batasan Wajib

### 0.1 Yang Sengaja Dibuang (*Out of Scope*)
AI Coding Agent **DILARANG** menambahkan komponen berikut agar proyek tetap ringkas, cepat dibangun, dan bebas masalah konfigurasi saat hari pertandingan:
- **Tanpa Sistem Login / Auth / JWT / Role-Based Access Control:** Aplikasi hanya berjalan di perangkat lokal panitia/operator.
- **Tanpa Setup Cloud / Reverse Proxy / SSL / Redis:** Tidak perlu Nginx, HTTPS, Docker Swarm, atau rate limiter.
- **Tanpa Konfigurasi CORS Rumit:** Izinkan seluruh origin lokal (`cors()`).
- **Tanpa Wajib Docker:** Terhubung langsung ke MySQL lokal yang sudah berjalan di laptop (**Laragon**, **XAMPP**, atau **MySQL Community Server** di `127.0.0.1:3306`).

### 0.2 Topologi Eksekusi Lokal
```text
[1 Laptop Utama]
 ├── MySQL Lokal (127.0.0.1:3306 / database: uww_scoreboard)
 ├── Node.js + Express + Socket.IO (port 4000, menyajikan build UI React /dist)
 └── Browser Chrome/Edge:
      ├── Layar Laptop  -> http://localhost:4000/controller  (Operator Matras)
      ├── Layar Laptop  -> http://localhost:4000/tournament  (Sekretariat / Bagan)
      └── Layar TV HDMI -> http://localhost:4000/display     (Scoreboard Fullscreen)

[Opsional di GOR jika ada TV/Laptop ke-2 dalam 1 Wi-Fi / Hotspot Lokal]
 └── Buka http://<IP-LOKAL-LAPTOP>:4000/schedule atau /display?mat=MAT_A
```

### 0.3 Tech Stack Backend Lokal
- **Runtime & Framework:** Node.js + Express.js + TypeScript (`strict: true`)
- **Database:** MySQL 8.0+ (lokal, engine `InnoDB`, charset `utf8mb4`)
- **ORM:** Prisma ORM (`@prisma/client` + `mysql2`)
- **Validation:** `zod` (validasi payload API agar data korup tidak masuk ke MySQL)
- **Real-Time Sync:** `socket.io` (sinkronisasi live skor, jam, bagan, dan jadwal antar tab maupun antar perangkat di Wi-Fi lokal)

### 0.4 Aturan Integritas Data & Anti-Lag (Wajib Ditaati)
1. **DILARANG Menulis Timer ke MySQL Setiap Detik:** Jangan pernah mengeksekusi query `UPDATE` ke MySQL setiap 50ms atau 1 detik saat jam berjalan. Simpan state timer (`remainingMs`, `isRunning`, `lastSyncedAt`) ke tabel `match_sessions` **hanya pada transisi diskrit** (`START`, `PAUSE`, `MANUAL_ADJUST`, `START_ACTIVITY`, `CANCEL_ACTIVITY`, `TOGGLE_MEDICAL`, `PHASE_CHANGE`, `RESET`).
2. **Event Sourcing dengan Soft-Undo:** Setiap kejadian poin, caution, passivity, dan challenge wajib dicatat di tabel `match_events`. Saat operator menekan **Undo**, **jangan lakukan `DELETE`** — ubah kolom `is_undone = true` agar panitia dan juri tetap memiliki jejak audit resmi jika terjadi protes.
3. **Atomic Bracket Advancement:** Proses menyelesaikan partai (`completeBout`) sekaligus memajukan pemenang ke babak berikutnya dan mengisi slot Repechage **wajib dibungkus dalam satu `prisma.$transaction`** agar bagan tidak pernah korup sebagian jika laptop mati mendadak.
4. **Dukungan Partai Manual (Ekshibisi):** Kolom `tournament_id` dan `division_id` pada tabel `bouts` wajib `nullable` agar pertandingan ekshibisi di luar jadwal turnamen tetap berjalan dan tersimpan lengkap di MySQL.

### 0.5 Struktur Direktori Target
```text
project-root/
├── shared/                        # Pure logic & types yang dipakai bersama frontend & backend
│   ├── types/
│   │   ├── match.ts
│   │   └── tournament.ts
│   └── engine/
│       ├── uwwRules.ts
│       ├── uwwClassification.ts
│       ├── uwwDrawEngine.ts
│       └── uwwBracketEngine.ts
├── server/
│   ├── prisma/
│   │   ├── schema.prisma          # Skema 6 tabel MySQL lokal
│   │   └── seed.ts                # Data uji cepat 1 turnamen lokal
│   ├── src/
│   │   ├── index.ts               # Express + Socket.IO + Static Serving (../dist)
│   │   ├── config/
│   │   │   └── prisma.ts          # Singleton PrismaClient + startup connection test
│   │   ├── middlewares/
│   │   │   ├── errorHandler.ts    # Global JSON error handler
│   │   │   └── validate.ts        # Zod request validator
│   │   ├── routes/
│   │   │   ├── tournaments.routes.ts
│   │   │   ├── athletes.routes.ts
│   │   │   ├── brackets.routes.ts
│   │   │   ├── bouts.routes.ts
│   │   │   └── backup.routes.ts   # Export/Restore 1-klik file JSON lokal
│   │   ├── services/
│   │   │   ├── bracketService.ts
│   │   │   ├── matchSessionService.ts
│   │   │   └── scheduleService.ts
│   │   └── socket/
│   │       └── scoreboardSocket.ts
│   ├── .env.example               # DATABASE_URL="mysql://root:@127.0.0.1:3306/uww_scoreboard"
│   └── package.json
├── start-uww.bat                  # Launcher 1-klik untuk hari pertandingan (Windows)
└── package.json                   # Script root: dev:all, build:all, start:local
```

---

## Phase 12: Setup Backend Lokal, Skema MySQL & Shared Engine

### Tujuan
Menyiapkan server Express + TypeScript + Prisma ORM yang terhubung ke MySQL lokal, menyatukan *pure engine* UWW ke folder `shared/` agar tidak ada duplikasi logika antara frontend dan backend, serta membentuk seluruh 6 tabel relasional di database `uww_scoreboard`.

### Rancangan Skema Database MySQL (`server/prisma/schema.prisma`)
Pastikan seluruh tabel menggunakan `InnoDB` dan `utf8mb4` dengan struktur berikut:

| Tabel | Kolom Kunci & Relasi | Fungsi |
| :--- | :--- | :--- |
| **`tournaments`** | `id (UUID PK)`, `name`, `location (NULL)`, `event_date (NULL)`, `status (ACTIVE/ARCHIVED)`, `created_at` | Memisahkan arsip antar kejuaraan. |
| **`divisions`** | `id (UUID PK)`, `tournament_id (FK)`, `style (ENUM: FS/WW/GR)`, `age_category (ENUM)`, `weight_class`, `format (ENUM)`, `assigned_mat`, `is_draw_locked (BOOL)` | Kelas pertandingan unik (`@@unique([tournamentId, style, ageCategory, weightClass])`). |
| **`athletes`** | `id (UUID PK)`, `tournament_id (FK)`, `division_id (FK)`, `name`, `region`, `region_code`, `seed (INT NULL)`, `draw_number (INT NULL)` | Data atlet hasil bulk import Excel & input manual. |
| **`bouts`** | `id (UUID PK)`, `tournament_id (FK NULL)`, `division_id (FK NULL)`, `bout_number (INT NULL)`, `mat_name`, `round`, `round_order`, `bracket_position`, `bracket_side (NULL)`, `red_athlete_id (FK NULL)`, `blue_athlete_id (FK NULL)`, `red_manual_name (NULL)`, `red_manual_region (NULL)`, `blue_manual_name (NULL)`, `blue_manual_region (NULL)`, `red_source_label (NULL)`, `blue_source_label (NULL)`, `next_win_bout_id (FK self NULL)`, `next_win_slot (NULL)`, `next_lose_bout_id (FK self NULL)`, `next_lose_slot (NULL)`, `status (ENUM)`, `winner_corner (NULL)`, `winner_athlete_id (FK NULL)`, `red_score (INT DEFAULT 0)`, `blue_score (INT DEFAULT 0)`, `victory_type (ENUM NULL)`, `red_classification_pts (INT DEFAULT 0)`, `blue_classification_pts (INT DEFAULT 0)`, `completed_at (DATETIME NULL)` | Menyimpan seluruh partai bagan, urutan matras, partai manual, dan hasil akhir resmi. |
| **`match_sessions`** | `bout_id (UUID PK/FK)`, `mat_name (UNIQUE NULL)`, `version (INT DEFAULT 1)`, `phase (ENUM)`, `main_clock_json (JSON)`, `break_clock_json (JSON)`, `activity_clock_json (JSON)`, `red_state_json (JSON)`, `blue_state_json (JSON)`, `active_challenge_corner (ENUM NULL)`, `updated_at` | Snapshot live state partai aktif agar tahan refresh browser atau restart laptop mendadak. |
| **`match_events`** | `id (UUID PK)`, `bout_id (FK)`, `sequence_no (INT)`, `period (TINYINT)`, `match_clock_ms (INT)`, `corner (ENUM)`, `type (ENUM)`, `points (INT)`, `note (NULL)`, `is_undone (BOOL DEFAULT false)`, `created_at` | Log kronologis seluruh kejadian skor/caution/passivity untuk hitung ulang *Tie-Breaker* dan audit juri. |

**Index Wajib:**
- `bouts`: `@@index([tournamentId, matName, status])` dan `@@index([divisionId, roundOrder])`.
- `match_events`: `@@index([boutId, isUndone, sequenceNo])`.

### Tugas Implementasi
1. Pindahkan kontrak tipe (`match.ts`, `tournament.ts`) dan pure logic (`uwwRules.ts`, `uwwClassification.ts`, `uwwDrawEngine.ts`, `uwwBracketEngine.ts`) ke folder `shared/`, lalu perbarui path import di frontend (`tsconfig.json` & `vite.config.ts`) dan pastikan seluruh Vitest test lama tetap lulus.
2. Inisialisasi `server/` dengan `express`, `cors`, `socket.io`, `zod`, `@prisma/client`, `prisma`, `dotenv`, dan dev dependencies `typescript`, `tsx`, `@types/express`, `@types/cors`, `@types/node`.
3. Buat `server/.env.example` dengan default MySQL lokal:
   ```env
   PORT=4000
   DATABASE_URL="mysql://root:@127.0.0.1:3306/uww_scoreboard"
   ```
4. Tulis `server/prisma/schema.prisma` sesuai spesifikasi di atas.
5. Buat `server/src/config/prisma.ts` dan pengecekan startup di `server/src/index.ts`:
   - Uji koneksi MySQL (`SELECT 1`) saat server mulai.
   - Jika MySQL belum aktif (misal Laragon/XAMPP belum dinyalakan), cetak pesan ramah dalam Bahasa Indonesia yang menjelaskan penyebabnya lalu hentikan proses dengan jelas.
   - Deteksi IPv4 LAN lokal laptop menggunakan modul bawaan `os.networkInterfaces()` dan tampilkan di terminal serta endpoint `GET /api/health`.
6. Buat `server/prisma/seed.ts` berisi 1 turnamen contoh (2 kelas: `FS 74 KG` dengan 11 atlet dan `GR 77 KG` dengan 4 atlet) untuk verifikasi cepat.

### Acceptance Criteria (Phase 12)
- [ ] `npx prisma db push` (atau `migrate dev`) berhasil membuat seluruh 6 tabel di MySQL lokal `uww_scoreboard`.
- [ ] `GET http://localhost:4000/api/health` mengembalikan `{ status: "ok", database: "connected", localIp: "192.168.x.x" }`.
- [ ] `npx vitest run` tetap lulus 100% setelah pure engine dipindahkan ke `shared/`.

---

## Phase 13: Local REST API (Bulk Import Excel, Undian, Bagan & Jadwal)

### Tujuan
Menyediakan seluruh endpoint REST API lokal agar manajemen turnamen, import Excel atlet, undian, bagan resmi UWW, dan antrean partai tersimpan permanen di MySQL.

### Daftar Endpoint Wajib
1. **Turnamen & Kategori (`tournaments.routes.ts`):**
   - `GET /api/tournaments` — Daftar seluruh turnamen beserta jumlah divisi, atlet, dan progres partai.
   - `POST /api/tournaments` — Buat turnamen baru.
   - `DELETE /api/tournaments/:id` — Hapus turnamen (cascade) dengan validasi eksplisit.
   - `GET /api/tournaments/:id/divisions` — Daftar divisi terkelompok lengkap dengan jumlah atlet, format bagan, dan status `isDrawLocked`.
2. **Bulk Import Excel & CRUD Atlet (`athletes.routes.ts`):**
   - `POST /api/tournaments/:id/athletes/bulk`:
     - Menerima `{ mode: 'MERGE' | 'REPLACE', athletes: [...] }` tervalidasi Zod.
     - Dieksekusi dalam `prisma.$transaction`: jika `REPLACE`, hapus atlet/divisi lama turnamen tersebut (tolak dengan `409 Conflict` jika sudah ada partai yang berjalan/selesai); otomatis `upsert` ke tabel `divisions` berdasarkan `style + ageCategory + weightClass` + deteksi format UWW otomatis; lalu `createMany` ke tabel `athletes`.
   - `POST /api/athletes`, `PATCH /api/athletes/:id`, `DELETE /api/athletes/:id` — Koreksi atlet satuan saat *weigh-in* (otomatis memperbarui format divisi jika undian belum dikunci).
3. **Undian (Draw) & Bagan Resmi UWW (`brackets.routes.ts` & `bracketService.ts`):**
   - `POST /api/divisions/:id/draw` — Menjalankan `shared/engine/uwwDrawEngine.ts` (mendukung `{ separateSameRegion: boolean }`) dan menyimpan `draw_number` ke tabel `athletes` dalam transaksi.
   - `PATCH /api/divisions/:id/draw/manual` — Menukar/mengubah `draw_number` atlet secara manual sebelum undian dikunci.
   - `POST /api/divisions/:id/bracket/generate` — Mengunci `is_draw_locked = true`, menjalankan `shared/engine/uwwBracketEngine.ts`, dan menyimpan seluruh node `bouts` beserta foreign key `next_win_bout_id` / `next_lose_bout_id` dalam satu `prisma.$transaction`. Tolak dengan `409 Conflict` jika sudah ada partai berstatus `IN_PROGRESS` atau `COMPLETED`.
   - `POST /api/divisions/:id/bracket/unlock` — Membuka kunci & menghapus bagan divisi (hanya diizinkan jika belum ada partai yang selesai, atau dengan flag `force: true`).
   - `GET /api/divisions/:id/bracket` — Mengembalikan daftar `bouts` lengkap dengan data atlet serta hasil kalkulasi klasemen (`StandingRow[]`) untuk format `NORDIC` dan `GROUP_CROSS`.
4. **Master Bout Queue & Partai Manual (`bouts.routes.ts`):**
   - `GET /api/tournaments/:id/bouts` — Mendukung filter query `?mat=MAT%20A&status=SCHEDULED`.
   - `POST /api/tournaments/:id/schedule/generate` — Mengatur `bout_number` dan `mat_name` otomatis secara merata antar ronde (`roundOrder`).
   - `PATCH /api/tournaments/:id/bouts/reorder` — Memperbarui urutan `bout_number` dan pemindahan `mat_name` secara massal dalam 1 transaksi.
   - `POST /api/bouts/manual` — Membuat partai manual/ekshibisi cepat (`tournament_id = null`, `division_id = null`) dengan nama/kontingen manual agar tetap tercatat lengkap di MySQL.

### Acceptance Criteria (Phase 13)
- [ ] `POST /api/tournaments/:id/athletes/bulk` dengan 100 atlet lintas `FS`/`GR`/`WW` tersimpan atomik di MySQL dalam waktu < 500ms.
- [ ] `POST /api/divisions/:id/bracket/generate` berhasil menyimpan seluruh relasi bagan untuk kelas berisi 4 atlet (Nordic), 6 atlet (Group+Cross), dan 11 atlet (Eliminasi+Repechage).
- [ ] Payload tidak valid (misal `style: "MMA"`) ditolak rapi dengan HTTP `400 Bad Request` dan pesan error Zod yang terbaca jelas.

---

## Phase 14: Live Scoring MySQL Persistence & Local Socket.IO Sync

### Tujuan
Menghubungkan jalannya pertandingan live di matras dengan persistensi MySQL tanpa menimbulkan *lag*, mencatat audit trail `match_events` dengan soft-undo, serta menyiarkan seluruh pembaruan secara instan melalui Socket.IO lokal.

### Arsitektur `matchSessionService.ts` & `scoreboardSocket.ts`
- **In-Memory Live Cache + Write-Through MySQL:**
  - Server menyimpan `Map<matName, MatchState>` di RAM untuk respons instan (< 20ms).
  - Saat server pertama kali menyala, panggil `hydrateActiveSessionsFromDb()` untuk membaca tabel `match_sessions` dan `match_events` dari MySQL sehingga pertandingan yang sedang berlangsung otomatis pulih apabila laptop sempat restart.
- **Socket.IO Rooms:**
  - `mat:<MAT_NAME>` (misal `mat:MAT_A`): diikuti oleh `/controller` dan `/display` untuk matras tersebut.
  - `schedule`: diikuti oleh `/schedule` dan `/tournament`.
- **Event Socket.IO:**
  - Server → Client: `match:state_update`, `match:buzzer`, `schedule:update`, `bracket:update`, `server:time` (untuk sinkronisasi offset jam).
  - Client → Server: `mat:join`, `mat:request_state`, `schedule:join`, `schedule:request_snapshot`.

### Endpoint Aksi Pertandingan (`bouts.routes.ts`)
1. **`POST /api/bouts/:id/load`**
   - Memuat partai ke `match_sessions` pada `mat_name` terkait (menolak jika matras sedang menjalankan partai lain yang belum selesai, kecuali dengan flag `forceReplace`).
   - Mengubah status partai menjadi `IN_PROGRESS` dan menandai partai `SCHEDULED` pertama berikutnya pada matras yang sama menjadi `ON_DECK`.
   - Mem-broadcast `match:state_update` ke `mat:<MAT_NAME>` dan `schedule:update` ke `schedule`.
2. **`POST /api/bouts/:id/events`**
   - Menambahkan baris baru ke `match_events` dengan `sequence_no` meningkat atomik.
   - Menghitung ulang skor, caution, passivity, *Tie-Breaker Criteria*, dan otomatis membatalkan *Activity Clock* (bila poin dicetak) menggunakan `shared/engine/uwwRules.ts`.
   - Memperbarui `match_sessions` di MySQL dan mem-broadcast `match:state_update` & `schedule:update`.
3. **`POST /api/bouts/:id/events/undo`**
   - Mencari event terakhir (atau grup event terakhir pada `CAUTION + poin`) dengan `is_undone = false`, mengubahnya menjadi `is_undone = true`.
   - Menghitung ulang seluruh state secara deterministik dari `match_events` yang aktif (`is_undone = false`).
   - Memperbarui `match_sessions` dan mem-broadcast ke semua klien.
4. **`PATCH /api/bouts/:id/clock`**
   - Menangani transisi diskrit: `TOGGLE_MAIN`, `SET_MAIN`, `ADJUST_MAIN`, `CHANGE_PHASE`, `TOGGLE_BREAK`, `START_ACTIVITY`, `CANCEL_ACTIVITY`, `COMPLETE_ACTIVITY_TIMEOUT`, `TOGGLE_MEDICAL`, `OPEN_CHALLENGE`, `RESOLVE_CHALLENGE`.
   - Menggunakan timestamp server (`Date.now()`) pada `lastSyncedAt` agar seluruh layar TV sinkron presisi.
   - Memperbarui `match_sessions` di MySQL dan mem-broadcast `match:state_update` (serta `match:buzzer` jika transisi memicu akhir babak / activity time).
5. **`POST /api/bouts/:id/complete`**
   - Dalam satu `prisma.$transaction`:
     1. Simpan pemenang, skor akhir, `victory_type`, `red_classification_pts`, `blue_classification_pts`, dan `completed_at` ke tabel `bouts` (`status = 'COMPLETED'`).
     2. Jika bukan partai manual (`division_id !== null`), jalankan `shared/engine/uwwBracketEngine.ts` (`advanceBoutResult`) untuk memperbarui slot `red_athlete_id` / `blue_athlete_id` pada partai babak berikutnya, mengisi Cross Semifinal (jika grup selesai), atau mengisi seluruh jalur Repechage & Bronze (jika kedua Semifinal selesai) di MySQL.
     3. Lepaskan kunci `mat_name` pada `match_sessions`.
   - Broadcast `match:state_update`, `bracket:update`, dan `schedule:update`.
6. **`GET /api/schedule/snapshot`**
   - Mengembalikan `ScheduleSnapshot` terbaru (daftar matras yang sedang aktif + daftar antrean `ON_DECK`, `IN_THE_HOLE`, `UPCOMING`).

### Acceptance Criteria (Phase 14)
- [ ] Setiap klik poin/caution/passivity di `/controller` tercatat di `match_events` dan langsung muncul di `/display` tanpa jeda terasa.
- [ ] Menekan `Undo` mengubah `is_undone = true` di MySQL tanpa menghapus record, dan angka di TV langsung kembali akurat.
- [ ] Mematikan paksa proses Node.js (`Ctrl+C`) lalu menyalakannya kembali di tengah babak yang berjalan tetap memulihkan skor, caution, dan sisa waktu babak dari `match_sessions`.
- [ ] Menyelesaikan partai melalui `/api/bouts/:id/complete` langsung memajukan pemenang di MySQL dan memperbarui tampilan `/tournament` & `/schedule` secara real-time.

---

## Phase 15: Integrasi Frontend, 1-Click Local Runner & Backup Lokal

### Tujuan
Menghubungkan seluruh antarmuka React ke REST API dan Socket.IO lokal, menyatukan frontend & backend dalam satu server port `4000` untuk hari pertandingan, menyediakan launcher 1-klik (`start-uww.bat`), serta fitur backup/restore file `.json` lokal.

### Tugas Implementasi
1. **Refactor Frontend Store ke Local API + Socket.IO:**
   - Buat `src/api/client.ts` yang otomatis memakai `window.location.origin` pada mode build lokal, atau `http://localhost:4000` (via `VITE_API_URL`) pada mode development.
   - Buat `src/store/socketClient.ts` berbasis `socket.io-client` dengan *auto-reconnect* otomatis dan kalibrasi `serverTimeOffset` agar tampilan timer di perangkat kedua (jika memakai Wi-Fi lokal) tidak meleset meski jam OS berbeda beberapa detik.
   - Perbarui `useTournamentStore.ts` dan `useMatchStore.ts` agar memanggil REST API lokal dan mendengarkan event Socket.IO (`match:state_update`, `schedule:update`, `bracket:update`), sehingga MySQL menjadi satu-satunya *single source of truth*.
   - Tampilkan indikator status di Top Bar `/controller` & `/tournament`:
     - Hijau: `MySQL Local Connected`
     - Merah berkedip: `Server Disconnected (Reconnecting...)`
     - Tampilkan info URL lokal (misal `http://192.168.1.10:4000/schedule`) bila panitia ingin membuka jadwal di TV/tablet kedua melalui Wi-Fi/hotspot lokal.
2. **Single-Server Local Mode & Launcher 1-Klik:**
   - Konfigurasikan `server/src/index.ts` agar melayani hasil build produksi frontend (`../dist`) dan fallback SPA routing (`* -> index.html`) pada port `4000` (bind ke `0.0.0.0`).
   - Tambahkan script di root `package.json`:
     - `"dev:all"`: menjalankan Vite + Server Express secara bersamaan (`concurrently`) untuk tahap development.
     - `"build:all"`: menjalankan build Vite (`dist/`) + build TypeScript server (`server/dist/`).
     - `"start:local"`: menjalankan server produksi lokal tunggal di `http://localhost:4000`.
   - Buat file **`start-uww.bat`** di root repositori (khusus Windows):
     - Menampilkan banner singkat, menjalankan `npm run start:local` di jendela terminal, menunggu 2–3 detik hingga server siap, lalu otomatis membuka Chrome/Edge ke `http://localhost:4000/controller`.
3. **Backup & Restore Turnamen Lokal 1-Klik (`backup.routes.ts`):**
   - `GET /api/tournaments/:id/backup`: mengekspor 1 file `.json` lengkap berisi turnamen, seluruh divisi, atlet, bagan/partai, dan seluruh `match_events`.
   - `POST /api/tournaments/restore`: mengimpor kembali file `.json` hasil backup ke MySQL (berguna jika laptop utama bermasalah dan data perlu dipindah cepat ke laptop cadangan via flashdisk).
   - Tambahkan tombol **"Backup Turnamen (.json)"** dan **"Restore Backup"** pada header halaman `/tournament`.

### Acceptance Criteria (Phase 15)
- [ ] Menjalankan `npm run build:all` lulus tanpa error TypeScript maupun Vite.
- [ ] Double-click `start-uww.bat` langsung menjalankan server, terhubung ke MySQL lokal, dan membuka halaman `/controller` di browser.
- [ ] Uji penuh dalam kondisi **Airplane Mode (Wi-Fi mati total)** di 1 laptop + TV HDMI: Import Excel di `/tournament` → Undian & Buat Bagan → Load Partai di `/controller` → Skor & Timer live tampil di `/display` & `/schedule` → Declare Winner → Bagan & klasemen otomatis ter-update di MySQL.
- [ ] File backup `.json` dapat diunduh dari `/tournament` dan berhasil di-restore kembali ke database tanpa kehilangan data skor maupun log event.

---

## Panduan Prompt Eksekusi ke AI Coding Agent

Pastikan `PLAN.md` (Phase 1–6) dan `PLAN-TOURNAMENT.md` (Phase 8–11) sudah selesai terlebih dahulu, lalu kirim prompt berikut satu per satu:

### Prompt Phase 12
```text
Baca PLAN-BACKEND-MYSQL.md secara menyeluruh. Kerjakan HANYA Phase 12 (Setup Backend Lokal, Skema MySQL & Shared Engine). Pindahkan pure types & engine ke folder `shared/`, inisialisasi folder `server/` (Express + TypeScript + Prisma MySQL lokal tanpa auth/Docker), tulis 6 tabel di `server/prisma/schema.prisma`, tambahkan pengecekan koneksi MySQL ramah saat startup, buat `seed.ts`, dan verifikasi `GET /api/health` serta `npx vitest run`. Jangan kerjakan Phase 13 dulu.
```

### Prompt Phase 13
```text
Baca PLAN-BACKEND-MYSQL.md. Lanjutkan ke Phase 13 (Local REST API). Implementasikan seluruh endpoint di `server/src/routes/` (tournaments, athletes bulk import transaksional, draw, bracket generate dengan proteksi 409 Conflict, bout queue/reorder, dan manual bout) dengan validasi Zod. Verifikasi `npm run build` di server dan uji alur endpoint utamanya.
```

### Prompt Phase 14
```text
Baca PLAN-BACKEND-MYSQL.md. Lanjutkan ke Phase 14 (Live Scoring MySQL Persistence & Local Socket.IO Sync). Implementasikan `matchSessionService.ts` (RAM cache + write-through MySQL tanpa menulis timer setiap detik + recovery saat restart), `match_events` dengan soft-undo (`is_undone = true`), transaksi atomik `completeBout` + `advanceBoutResult`, serta Socket.IO room (`mat:<MAT_NAME>` dan `schedule`). Pastikan seluruh test dan build lulus.
```

### Prompt Phase 15
```text
Baca PLAN-BACKEND-MYSQL.md. Lanjutkan ke Phase 15 (Integrasi Frontend, 1-Click Local Runner & Backup Lokal). Hubungkan `useTournamentStore` dan `useMatchStore` ke REST API & Socket.IO lokal, tambahkan indikator status MySQL & URL LAN lokal, konfigurasikan Express agar menyajikan build `dist/` di port 4000, tambahkan endpoint & tombol Backup/Restore JSON, serta buat script `dev:all`, `build:all`, `start:local`, dan file `start-uww.bat`. Jalankan `npm run build:all` dan `npx vitest run`, lalu laporkan status seluruh Acceptance Criteria.
```