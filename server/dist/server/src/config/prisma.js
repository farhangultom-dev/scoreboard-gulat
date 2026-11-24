"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.verifyDatabaseConnection = verifyDatabaseConnection;
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: ['error', 'warn'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
/**
 * Menguji koneksi ke MySQL lokal saat aplikasi startup.
 * Jika MySQL belum dinyalakan (misal Laragon / XAMPP belum aktif),
 * tampilkan pesan ramah dalam Bahasa Indonesia lalu hentikan proses.
 */
async function verifyDatabaseConnection() {
    try {
        await exports.prisma.$queryRaw `SELECT 1`;
        console.log('✅ [MySQL] Terhubung ke database lokal uww_scoreboard (127.0.0.1:3306)');
    }
    catch (error) {
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
