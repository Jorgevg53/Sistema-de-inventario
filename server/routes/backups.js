'use strict';
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { can } = require('../auth');
const { bad, notFound } = require('../util');
const backups = require('../backups');

const router = express.Router();

// Respaldos guardados en el servidor (automáticos y copias previas a una restauración).
router.get('/backups', can('settings'), (req, res) => {
  res.json({ dir: backups.backupDir(), keep: backups.keepCount(), files: backups.list() });
});

router.get('/backups/:name', can('settings'), (req, res) => {
  const name = req.params.name;
  if (!backups.isValidName(name)) throw bad('Nombre de respaldo no válido.');
  const file = path.join(backups.backupDir(), name);
  let st = null;
  try { st = fs.statSync(file); } catch { /* no existe */ }
  if (!st || !st.isFile()) throw notFound('Respaldo no encontrado.');
  res.download(file, name);
});

module.exports = router;
