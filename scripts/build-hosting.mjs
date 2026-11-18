import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const hostingDir = path.join(rootDir, 'dist-hosting');
const distDir = path.join(rootDir, 'dist');
const hostingDistDir = path.join(hostingDir, 'dist');

console.log('1. Membangun frontend produksi (dist/)...');
execSync('npx vite build', { stdio: 'inherit', cwd: rootDir });

if (fs.existsSync(hostingDir)) {
  fs.rmSync(hostingDir, { recursive: true, force: true });
}
fs.mkdirSync(hostingDir, { recursive: true });

console.log('2. Membundel server Node.js siap hosting (dist-hosting/server.mjs)...');
execSync(
  'npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-hosting/server.mjs',
  { stdio: 'inherit', cwd: rootDir }
);

console.log('3. Menyalin aset frontend ke dist-hosting/dist...');
fs.cpSync(distDir, hostingDistDir, { recursive: true });

const rootPkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
);
const serverDeps = {
  dotenv: rootPkg.dependencies?.dotenv || '^17.2.3',
  'drizzle-orm': rootPkg.dependencies?.['drizzle-orm'] || '^0.45.4',
  express: rootPkg.dependencies?.express || '^4.21.2',
  'firebase-admin': rootPkg.dependencies?.['firebase-admin'] || '^14.5.1',
  pg: rootPkg.dependencies?.pg || '^8.23.1',
  ws: rootPkg.dependencies?.ws || '^8.23.0',
};

fs.writeFileSync(
  path.join(hostingDir, 'package.json'),
  JSON.stringify(
    {
      name: 'mazcodeid-smart-cbt-hosting',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        start: 'node server.mjs',
      },
      dependencies: serverDeps,
    },
    null,
    2
  )
);

const guide = `PANDUAN UPLOAD KE HOSTING PRIBADI (TANPA SUPABASE)
===================================================

Website MazCodeID SMART CBT mendukung 2 cara upload ke hosting pribadi
tanpa perlu mengatur database di Supabase:

OPSI 1: HOSTING BIASA / SHARED HOSTING (cPanel, Hostinger, Niagahoster, Rumahweb)
- Upload seluruh ISI folder "dist/" ke dalam folder "public_html/" di hosting Anda
  (pastikan file ".htaccess" ikut terupload).
- Tidak memerlukan Node.js dan tidak memerlukan pengaturan Supabase.
- Seluruh data awal (87 mahasiswa, 100 soal, 3 mata kuliah, 6 kelas, dan profil
  MAZCODEID CBT) sudah tersimpan otomatis dan langsung bisa dipakai.

OPSI 2: HOSTING NODE.JS / VPS / cPanel "Setup Node.js App" (Multi-Device Tanpa Supabase)
- Upload seluruh ISI folder "dist-hosting/" ke direktori aplikasi Node.js Anda.
- Jalankan "npm install" lalu jalankan "npm start" (Startup file: server.mjs).
- Tanpa mengatur DATABASE_URL/Supabase, server otomatis membuat dan menyimpan
  database bersama ke file "data/mazcodeid-cbt-db.json" di server hosting Anda.
- Semua perangkat (Admin, Dosen, Mahasiswa) akan berbagi data dari file database
  tersebut secara otomatis.
`;

fs.writeFileSync(path.join(hostingDir, 'PANDUAN_UPLOAD_HOSTING.txt'), guide, 'utf-8');
console.log('Selesai! Paket hosting pribadi siap di folder dist/ dan dist-hosting/.');
