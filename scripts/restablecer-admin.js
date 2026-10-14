'use strict';
/**
 * Restablece la contraseña de un administrador cuando nadie puede entrar al sistema.
 *
 *   node scripts/restablecer-admin.js [usuario]        (por defecto: admin)
 *
 * Se ejecuta en la computadora o el servidor donde está instalado el sistema, de preferencia con el
 * sistema cerrado (también funciona abierto). Usa la misma base que el sistema: respeta DATA_DIR y DB_FILE.
 * Genera una contraseña temporal aleatoria y la muestra; el usuario queda activo, obligado a cambiarla
 * al entrar y con todas sus sesiones cerradas. Ver DESPLIEGUE.md, sección 8.6.
 */
const fs = require('node:fs');
const db = require('../server/db');
const auth = require('../server/auth');

function main(args) {
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Uso: node scripts/restablecer-admin.js [usuario]   (por defecto: admin)');
    return 0;
  }
  const username = String(args[0] || 'admin').trim();

  // Nunca crear una base nueva y vacía por error (carpeta equivocada o DATA_DIR sin indicar).
  if (!fs.existsSync(db.DB_FILE)) {
    console.error(`\n  No se encontró la base de datos en: ${db.DB_FILE}`);
    console.error('  Ejecuta este comando dentro de la carpeta del sistema, o indica la carpeta de datos con DATA_DIR');
    console.error('  (Docker: /app/data; servidor Linux, Opción D: /var/lib/punto-de-venta).\n');
    return 1;
  }
  // Como root se podrían dejar archivos que el servicio ya no puede escribir.
  if (process.getuid && process.getuid() === 0 && fs.statSync(db.DB_FILE).uid !== 0) {
    console.error('\n  La base de datos pertenece a otro usuario. Ejecuta el comando como ese usuario,');
    console.error('  por ejemplo: sudo -u pdv env DATA_DIR=/var/lib/punto-de-venta node scripts/restablecer-admin.js\n');
    return 1;
  }

  db.open();
  try {
    const admins = () => db.all("SELECT username FROM users WHERE role = 'admin' ORDER BY id").map((r) => r.username).join(', ');
    const user = db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user) {
      console.error(`\n  No existe el usuario "${username}". Administradores registrados: ${admins() || 'ninguno'}.\n`);
      return 1;
    }
    if (user.role !== 'admin') {
      console.error(`\n  "${user.username}" no es administrador. Un administrador puede cambiar su contraseña en`);
      console.error(`  Configuración → Usuarios. Administradores registrados: ${admins() || 'ninguno'}.\n`);
      return 1;
    }
    const password = auth.randomPassword();
    db.tx(() => {
      db.run('UPDATE users SET password_hash = ?, must_change_password = 1, active = 1 WHERE id = ?', auth.hashPassword(password), user.id);
      db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
    });
    console.log('');
    console.log(`  Listo. Contraseña temporal del usuario "${user.username}":`);
    console.log('');
    console.log(`      ${password}`);
    console.log('');
    console.log('  Entra al sistema con ella; te pedirá cambiarla por una tuya.');
    console.log('  Se cerraron las sesiones abiertas de ese usuario y quedó activo.');
    console.log('');
    return 0;
  } finally {
    db.close();
  }
}

process.exitCode = main(process.argv.slice(2));
