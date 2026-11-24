=================================================================
PANDUAN ASET BENDERA / LOGO DAERAH (UWW SCOREBOARD)
=================================================================

1. LOKASI FILE:
   Simpan seluruh file logo/bendera daerah langsung di dalam folder ini:
   public/flags/

2. ATURAN PENAMAAN FILE:
   - Gunakan nilai persis dari kolom "Kode_Daerah" pada file Excel atlet.
   - Wajib HURUF KAPITAL semua tanpa spasi dengan ekstensi ".png".
   - Contoh:
     - Kode_Daerah "LPG"   -> LPG.png
     - Kode_Daerah "JBR"   -> JBR.png
     - Kode_Daerah "DKI"   -> DKI.png
     - Kode_Daerah "JTM"   -> JTM.png
     - Kode_Daerah "SUMUT" -> SUMUT.png

3. SPESIFIKASI GAMBAR DISARANKAN:
   - Format  : PNG transparan (.png)
   - Ukuran  : 256x256 px s.d. 512x512 px (< 150 KB per file)
   - Catatan : Vite akan otomatis menyalin isi folder ini ke dist/flags/
               saat proses build ("npm run build" / "npm run build:all").
               Revisi file .png di dist/flags/ langsung aktif tanpa build ulang.
