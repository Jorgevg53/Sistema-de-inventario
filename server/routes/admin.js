'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const db = require('../db');
const { can } = require('../auth');
const { bad, str, num, int, round2, nowLocal } = require('../util');
const { csvToObjects, toCsv } = require('../csv');
const stock = require('../stock');
const demo = require('../demo');

const router = express.Router();

function stamp() {
  return nowLocal().replace(/[: ]/g, '-');
}

// ---------- Respaldo ----------

router.get('/backup', can('settings'), (req, res) => {
  const dir = path.join(db.DATA_DIR, 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `respaldo-${stamp()}.db`);
  db.raw().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  res.download(file, `respaldo-tienda-${stamp()}.db`, () => fs.rm(file, { force: true }, () => {}));
});

router.post('/backup/restore', can('settings'), express.raw({ type: 'application/octet-stream', limit: '500mb' }), (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 100 || buf.subarray(0, 15).toString() !== 'SQLite format 3') {
    throw bad('El archivo no es un respaldo válido.');
  }
  const dir = path.join(db.DATA_DIR, 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `restaurar-${stamp()}.db`);
  fs.writeFileSync(tmp, buf);
  try {
    const test = new DatabaseSync(tmp);
    const tables = test.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    test.close();
    for (const t of ['products', 'product_variants', 'sales', 'users']) {
      if (!tables.includes(t)) throw bad('El archivo no corresponde a un respaldo de este sistema.');
    }
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err.status ? err : bad('No se pudo leer el respaldo.');
  }
  // Copia de seguridad automática de la base actual antes de reemplazarla.
  const backups = path.join(db.DATA_DIR, 'respaldos');
  fs.mkdirSync(backups, { recursive: true });
  db.raw().exec(`VACUUM INTO '${path.join(backups, `antes-de-restaurar-${stamp()}.db`).replace(/'/g, "''")}'`);
  db.close();
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(db.DB_FILE + ext, { force: true });
  fs.renameSync(tmp, db.DB_FILE);
  db.open();
  res.json({ ok: true });
});

// ---------- Exportar / importar productos (CSV) ----------

const CSV_HEADERS = ['nombre', 'categoria', 'marca', 'proveedor', 'genero', 'descripcion', 'sku', 'codigo_barras', 'talla', 'color', 'costo', 'precio', 'stock', 'stock_minimo', 'ubicacion', 'activo'];

router.get('/export/products.csv', can('products.view'), (req, res) => {
  const rows = db.all(`
    SELECT p.name, c.name AS category, b.name AS brand, s.name AS supplier, p.gender, p.description,
      v.sku, v.barcode, v.size, v.color, v.cost, v.price, v.stock, v.min_stock, v.location, (p.active AND v.active) AS active
    FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.name COLLATE NOCASE, v.id`);
  const csv = toCsv(CSV_HEADERS, rows.map((r) => [r.name, r.category, r.brand, r.supplier, r.gender, r.description, r.sku, r.barcode,
    r.size, r.color, r.cost, r.price, r.stock, r.min_stock, r.location, r.active ? 'si' : 'no']));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="productos-${stamp()}.csv"`);
  res.send(csv);
});

router.get('/import/template.csv', (req, res) => {
  const csv = toCsv(CSV_HEADERS, [
    ['Goggles Vanquisher', 'Goggles', 'Speedo', '', 'Unisex', '', '', '', '', 'Negro', '190', '349', '10', '3', 'Vitrina 1', 'si'],
    ['Traje de baño Endurance', 'Trajes de baño', 'Speedo', '', 'Mujer', '', '', '', '32', 'Azul', '520', '899', '4', '2', '', 'si'],
    ['Traje de baño Endurance', 'Trajes de baño', 'Speedo', '', 'Mujer', '', '', '', '34', 'Azul', '520', '899', '5', '2', '', 'si'],
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.csv"');
  res.send(csv);
});

const pickCol = (row, ...names) => {
  for (const n of names) if (row[n] !== undefined && row[n] !== '') return row[n];
  return '';
};

/**
 * Importa productos desde CSV. Las filas con el mismo nombre y marca se agrupan como variantes
 * (tallas/colores) de un mismo producto. Si el SKU ya existe se actualiza.
 */
router.post('/import/products', can('products.edit'), (req, res) => {
  const rows = csvToObjects(req.body.csv);
  if (!rows.length) throw bad('El archivo está vacío o no tiene encabezados.');
  const updateStock = !!req.body.update_stock;
  const result = { created_products: 0, created_variants: 0, updated_variants: 0, errors: [] };
  const cache = { cat: new Map(), brand: new Map(), sup: new Map() };
  const lookup = (kind, table, name) => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (cache[kind].has(key)) return cache[kind].get(key);
    const found = db.get(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`, name);
    const id = found ? found.id : Number(db.run(`INSERT INTO ${table} (name) VALUES (?)`, name).lastInsertRowid);
    cache[kind].set(key, id);
    return id;
  };
  const productIds = new Map();
  const defaultMin = int(db.setting('default_min_stock'), 0);

  db.tx(() => {
    for (const r of rows) {
      db.raw().exec('SAVEPOINT fila');
      try {
        const name = str(pickCol(r, 'nombre', 'producto', 'name'));
        if (!name) throw new Error('falta el nombre');
        const brandName = str(pickCol(r, 'marca', 'brand'));
        const sku = str(pickCol(r, 'sku', 'clave', 'codigo'));
        const barcode = str(pickCol(r, 'codigo_barras', 'codigo_de_barras', 'barcode', 'ean'));
        const size = str(pickCol(r, 'talla', 'size'));
        const color = str(pickCol(r, 'color'));
        const cost = round2(num(pickCol(r, 'costo', 'cost')));
        const price = round2(num(pickCol(r, 'precio', 'precio_venta', 'price')));
        const qty = int(pickCol(r, 'stock', 'existencia', 'existencias', 'cantidad'));
        const minRaw = pickCol(r, 'stock_minimo', 'minimo', 'min_stock');
        const minStock = minRaw === '' ? defaultMin : Math.max(0, int(minRaw));
        const location = str(pickCol(r, 'ubicacion', 'location'));
        const activeRaw = String(pickCol(r, 'activo', 'active')).toLowerCase();
        const active = activeRaw === 'no' || activeRaw === '0' || activeRaw === 'false' ? 0 : 1;

        const existing = (sku && db.get('SELECT * FROM product_variants WHERE sku = ?', sku))
          || (barcode && db.get('SELECT * FROM product_variants WHERE barcode = ?', barcode));
        if (existing) {
          if (barcode && db.get('SELECT id FROM product_variants WHERE barcode = ? AND id <> ?', barcode, existing.id)) {
            throw new Error(`el código de barras ${barcode} ya pertenece a otro producto`);
          }
          db.run(`UPDATE product_variants SET barcode = COALESCE(?, barcode), size = COALESCE(?, size), color = COALESCE(?, color),
            cost = ?, price = ?, min_stock = ?, location = COALESCE(?, location), active = ?, updated_at = ? WHERE id = ?`,
          barcode, size, color, cost || existing.cost, price || existing.price, minStock, location, active, nowLocal(), existing.id);
          if (updateStock && qty !== existing.stock) {
            stock.moveStock({ variantId: existing.id, qty: qty - existing.stock, type: 'ajuste', reference: 'Importación CSV', userId: req.user.id, allowNegative: true });
          }
          result.updated_variants++;
          db.raw().exec('RELEASE fila');
          continue;
        }

        const key = `${name.toLowerCase()}|${(brandName || '').toLowerCase()}`;
        let productId = productIds.get(key);
        if (!productId) {
          const brandId = lookup('brand', 'brands', brandName);
          const found = db.get('SELECT id FROM products WHERE name = ? COLLATE NOCASE AND IFNULL(brand_id, 0) = ?', name, brandId || 0);
          if (found) productId = found.id;
          else {
            const g = str(pickCol(r, 'genero', 'gender'));
            productId = Number(db.run(
              'INSERT INTO products (name, description, category_id, brand_id, supplier_id, gender) VALUES (?, ?, ?, ?, ?, ?)',
              name, str(pickCol(r, 'descripcion', 'description')), lookup('cat', 'categories', str(pickCol(r, 'categoria', 'category'))),
              brandId, lookup('sup', 'suppliers', str(pickCol(r, 'proveedor', 'supplier'))),
              ['Hombre', 'Mujer', 'Niño', 'Niña', 'Unisex'].includes(g) ? g : null).lastInsertRowid);
            result.created_products++;
          }
          productIds.set(key, productId);
        }
        if (barcode && db.get('SELECT id FROM product_variants WHERE barcode = ?', barcode)) throw new Error(`código de barras ${barcode} repetido`);
        const tmpSku = sku || `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const vid = Number(db.run(
          `INSERT INTO product_variants (product_id, sku, barcode, size, color, cost, price, min_stock, location, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          productId, tmpSku, barcode, size, color, cost, price, minStock, location, active).lastInsertRowid);
        if (!sku) db.run('UPDATE product_variants SET sku = ? WHERE id = ?', `P${String(productId).padStart(4, '0')}-${vid}`, vid);
        if (!barcode && req.body.auto_barcode) db.run('UPDATE product_variants SET barcode = ? WHERE id = ?', stock.internalBarcode(vid), vid);
        if (qty > 0) stock.moveStock({ variantId: vid, qty, type: 'inicial', reference: 'Importación CSV', userId: req.user.id, unitCost: cost });
        result.created_variants++;
        db.raw().exec('RELEASE fila');
      } catch (err) {
        db.raw().exec('ROLLBACK TO fila; RELEASE fila');
        for (const c of Object.values(cache)) c.clear();
        productIds.clear();
        result.errors.push({ line: r._line, message: err.message });
      }
    }
  });
  res.json(result);
});

// ---------- Datos de demostración ----------

router.post('/demo', can('settings'), (req, res) => {
  if (demo.hasProducts()) throw bad('Los datos de demostración solo se pueden cargar cuando no hay productos registrados.');
  demo.seedDemo({ withSales: req.body.with_sales !== false, userId: req.user.id });
  res.json({ ok: true });
});

module.exports = router;
