import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Menguji koneksi ke MySQL lokal saat aplikasi startup.
 * Jika MySQL belum dinyalakan (misal Laragon / XAMPP belum aktif),
 * tampilkan pesan ramah dalam Bahasa Indonesia lalu hentikan proses.
 */
export async function verifyDatabaseConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ [MySQL] Terhubung ke database lokal uww_scoreboard (127.0.0.1:3306)');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('\n====================================================================');
    console.error('❌ [GAGAL TERHUBUNG KE MYSQL LOKAL]');
    console.error('--------------------------------------------------------------------');
    console.error('Penyebab: Server tidak dapat menghubungi database MySQL di 127.0.0.1:3306.');
    console.error('Pastikan langkah berikut sudah dilakukan:');
    console.error('  1. Nyalakan MySQL melalui Laragon, XAMPP Control Panel, atau Windows Service.');
    console.error('  2. Pastikan database "uww_scoreboard" sudah dibuat dan skema sudah didorong');
    console.error('     dengan perintah: npx prisma db push');
    console.error('  3. Periksa konfigurasi DATABASE_URL pada file server/.env');
    console.error('--------------------------------------------------------------------');
    console.error(`Detail Teknis: ${errMsg}`);
    console.error('====================================================================\n');
    process.exit(1);
  }
}
