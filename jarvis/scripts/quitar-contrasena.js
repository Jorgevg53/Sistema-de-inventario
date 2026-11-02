'use strict';
/**
 * Quita la contraseña de JARVIS (por si se olvidó) y cierra todas las sesiones.
 * Se ejecuta en el equipo donde corre JARVIS, dentro de la carpeta jarvis:  node scripts/quitar-contrasena.js
 * Después JARVIS solo se puede usar desde ese equipo hasta que se defina una contraseña nueva en Ajustes.
 */
const db = require('../server/db');

db.open();
db.transaction(() => {
  db.setSetting('password_hash', '');
  db.run('DELETE FROM sessions');
});
db.close();
console.log('\n  Listo: se quitó la contraseña de JARVIS.');
console.log('  Ábrelo en este equipo (http://localhost:3100) y define una nueva en Ajustes → Seguridad y acceso.');
if (process.env.JARVIS_CLAVE) console.log('  Ojo: la variable JARVIS_CLAVE sigue definida y tiene prioridad.');
console.log('');
