'use strict';
const express = require('express');
const db = require('../db');
const { can, hasPerm } = require('../auth');
const { bad, notFound, str, num, int, round2, nowLocal } = require('../util');
const stock = require('../stock');

const router = express.Router();

const GENDERS = ['Hombre', 'Mujer', 'Niño', 'Niña', 'Unisex'];

/** Solo quien administra inventario, compras o reportes puede ver costos. */
function canSeeCost(req) {
  return ['products.edit', 'inventory', 'purchases', 'reports'].some((p) => hasPerm(req, p));
}

function hideCost(v) {
  delete v.cost;
  return v;
}

function ascii(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function code(s, len) {
  return ascii(s).replace(/[^A-Z0-9]/g, '').slice(0, len);
}

function uniqueSku(base, excludeId = 0) {
  let sku = base;
  let n = 2;
  while (db.get('SELECT id FROM product_variants WHERE sku = ? AND id <> ?', sku, excludeId)) sku = `${base}-${n++}`;
  return sku;
}

function makeSku(product, v) {
  const words = ascii(product.name).split(/\s+/).filter(Boolean);
  const prefix = (words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join('') : code(product.name, 3)) || 'PRD';
  const parts = [prefix.replace(/[^A-Z0-9]/g, '') || 'PRD', String(product.id).padStart(4, '0')];
  if (v.size) parts.push(code(v.size, 5));
  if (v.color) parts.push(code(v.color, 3));
  return uniqueSku(parts.filter(Boolean).join('-'));
}

function resolveBrand(body) {
  if (body.brand_id) return int(body.brand_id) || null;
  const name = str(body.brand_name);
  if (!name) return null;
  const existing = db.get('SELECT id FROM brands WHERE name = ?', name);
  if (existing) return existing.id;
  return Number(db.run('INSERT INTO brands (name) VALUES (?)', name).lastInsertRowid);
}

function productFields(body) {
  const name = str(body.name);
  if (!name) throw bad('El nombre del producto es obligatorio.');
  const gender = str(body.gender);
  return {
    name,
    description: str(body.description),
    category_id: int(body.category_id) || null,
    brand_id: resolveBrand(body),
    supplier_id: int(body.supplier_id) || null,
    gender: GENDERS.includes(gender) ? gender : null,
    active: body.active === undefined ? 1 : (body.active ? 1 : 0),
  };
}

function variantFields(v) {
  const price = round2(num(v.price));
  const cost = round2(num(v.cost));
  if (price < 0 || cost < 0) throw bad('Precio y costo no pueden ser negativos.');
  return {
    sku: str(v.sku),
    barcode: str(v.barcode),
    size: str(v.size),
    color: str(v.color),
    cost,
    price,
    min_stock: Math.max(0, int(v.min_stock, int(db.setting('default_min_stock'), 0))),
    location: str(v.location),
    active: v.active === undefined ? 1 : (v.active ? 1 : 0),
  };
}

function checkUnique(f, excludeId = 0) {
  if (f.sku && db.get('SELECT id FROM product_variants WHERE sku = ? AND id <> ?', f.sku, excludeId)) {
    throw bad(`El SKU "${f.sku}" ya está en uso por otro producto.`);
  }
  if (f.barcode && db.get('SELECT id FROM product_variants WHERE barcode = ? AND id <> ?', f.barcode, excludeId)) {
    throw bad(`El código de barras "${f.barcode}" ya está en uso por otro producto.`);
  }
}

function insertVariant(product, raw, userId, autoBarcode) {
  const f = variantFields(raw);
  checkUnique(f);
  const sku = f.sku || makeSku(product, f);
  const r = db.run(
    `INSERT INTO product_variants (product_id, sku, barcode, size, color, cost, price, stock, min_stock, location, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    product.id, sku, f.barcode, f.size, f.color, f.cost, f.price, f.min_stock, f.location, f.active,
  );
  const id = Number(r.lastInsertRowid);
  if (!f.barcode && autoBarcode) {
    db.run('UPDATE product_variants SET barcode = ? WHERE id = ?', stock.internalBarcode(id), id);
  }
  const initial = Math.max(0, int(raw.stock));
  if (initial > 0) {
    stock.moveStock({ variantId: id, qty: initial, type: 'inicial', note: 'Alta de producto', userId, unitCost: f.cost });
  }
  return id;
}

function getProduct(id) {
  const p = db.get(`
    SELECT p.id, p.name, p.description, p.category_id, p.brand_id, p.supplier_id, p.gender, p.active,
      p.created_at, p.updated_at, (p.image IS NOT NULL) AS has_image,
      c.name AS category_name, c.color AS category_color, b.name AS brand_name, s.name AS supplier_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ?`, id);
  if (!p) return null;
  p.variants = db.all('SELECT * FROM product_variants WHERE product_id = ? ORDER BY active DESC, id', id);
  return p;
}

// ---------- Listado ----------

function listFilters(q) {
  const where = [];
  const params = [];
  const active = q.active ?? '1';
  if (active === '1' || active === '0') { where.push('p.active = ?'); params.push(Number(active)); }
  if (q.category_id) { where.push('p.category_id = ?'); params.push(int(q.category_id)); }
  if (q.brand_id) { where.push('p.brand_id = ?'); params.push(int(q.brand_id)); }
  if (q.supplier_id) { where.push('p.supplier_id = ?'); params.push(int(q.supplier_id)); }
  if (q.gender) { where.push('p.gender = ?'); params.push(q.gender); }
  if (q.stock === 'low') where.push('EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = 1 AND v.stock <= v.min_stock)');
  if (q.stock === 'out') where.push('EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = 1 AND v.stock <= 0)');
  if (q.stock === 'ok') where.push('NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = 1 AND v.stock <= v.min_stock)');
  const words = String(q.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const w of words) {
    const like = `%${w}%`;
    where.push(`(p.name LIKE ? OR IFNULL(b.name,'') LIKE ? OR IFNULL(c.name,'') LIKE ? OR EXISTS (
      SELECT 1 FROM product_variants v WHERE v.product_id = p.id
      AND (v.sku LIKE ? OR IFNULL(v.barcode,'') LIKE ? OR IFNULL(v.size,'') LIKE ? OR IFNULL(v.color,'') LIKE ?)))`);
    params.push(like, like, like, like, like, like, like);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

const AGG = `
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS variant_count, SUM(stock) AS total_stock,
      MIN(price) AS min_price, MAX(price) AS max_price, MIN(cost) AS min_cost, MAX(cost) AS max_cost,
      SUM(MAX(stock, 0) * cost) AS cost_value, SUM(MAX(stock, 0) * price) AS price_value,
      SUM(stock <= min_stock) AS low_count, SUM(stock <= 0) AS out_count
    FROM product_variants WHERE active = 1 GROUP BY product_id
  ) agg ON agg.product_id = p.id`;

const SORTS = {
  name: 'p.name COLLATE NOCASE ASC',
  '-name': 'p.name COLLATE NOCASE DESC',
  stock: 'IFNULL(agg.total_stock,0) ASC, p.name',
  '-stock': 'IFNULL(agg.total_stock,0) DESC, p.name',
  price: 'IFNULL(agg.min_price,0) ASC, p.name',
  '-price': 'IFNULL(agg.min_price,0) DESC, p.name',
  '-updated': 'p.updated_at DESC',
  '-created': 'p.id DESC',
  category: 'c.sort_order, c.name, p.name',
};

router.get('/products', can('products.view', 'pos', 'inventory', 'purchases'), (req, res) => {
  const f = listFilters(req.query);
  const limit = Math.min(500, Math.max(1, int(req.query.limit, 50)));
  const page = Math.max(1, int(req.query.page, 1));
  const order = SORTS[req.query.sort] || SORTS.name;
  const from = `FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id ${AGG}`;

  const rows = db.all(`
    SELECT p.id, p.name, p.description, p.category_id, p.brand_id, p.supplier_id, p.gender, p.active, p.updated_at,
      (p.image IS NOT NULL) AS has_image, c.name AS category_name, c.color AS category_color,
      b.name AS brand_name, s.name AS supplier_name,
      IFNULL(agg.variant_count,0) AS variant_count, IFNULL(agg.total_stock,0) AS total_stock,
      agg.min_price, agg.max_price, agg.min_cost, agg.max_cost,
      IFNULL(agg.cost_value,0) AS cost_value, IFNULL(agg.price_value,0) AS price_value,
      IFNULL(agg.low_count,0) AS low_count, IFNULL(agg.out_count,0) AS out_count
    ${from} ${f.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...f.params, limit, (page - 1) * limit);

  const summary = db.get(`
    SELECT COUNT(*) AS products, IFNULL(SUM(agg.total_stock),0) AS units,
      IFNULL(SUM(agg.cost_value),0) AS cost_value, IFNULL(SUM(agg.price_value),0) AS price_value,
      SUM(IFNULL(agg.low_count,0) > 0) AS low_products, SUM(IFNULL(agg.out_count,0) > 0) AS out_products
    ${from} ${f.sql}`, ...f.params);

  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const variants = db.all(
      `SELECT * FROM product_variants WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY active DESC, id`, ...ids);
    const byProduct = new Map();
    for (const v of variants) {
      if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
      byProduct.get(v.product_id).push(v);
    }
    for (const r of rows) r.variants = byProduct.get(r.id) || [];
  }
  if (!canSeeCost(req)) {
    for (const r of rows) {
      delete r.min_cost; delete r.max_cost; delete r.cost_value;
      r.variants.forEach(hideCost);
    }
    delete summary.cost_value;
  }
  res.json({ rows, total: summary.products, page, limit, summary });
});

router.get('/products/:id', can('products.view', 'pos', 'inventory', 'purchases'), (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) throw notFound('Producto no encontrado.');
  p.stats = db.get(`
    SELECT IFNULL(SUM(si.quantity - si.returned_qty),0) AS units_sold,
      IFNULL(SUM(si.total * (si.quantity - si.returned_qty) * 1.0 / si.quantity),0) AS revenue,
      MAX(s.created_at) AS last_sale
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE si.product_id = ? AND s.status = 'completada'`, p.id);
  if (!canSeeCost(req)) p.variants.forEach(hideCost);
  res.json(p);
});

// ---------- Alta / edición ----------

router.post('/products', can('products.edit'), (req, res) => {
  const variants = Array.isArray(req.body.variants) && req.body.variants.length ? req.body.variants : [{}];
  const id = db.tx(() => {
    const f = productFields(req.body);
    const r = db.run(
      `INSERT INTO products (name, description, category_id, brand_id, supplier_id, gender, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      f.name, f.description, f.category_id, f.brand_id, f.supplier_id, f.gender, f.active);
    const product = { id: Number(r.lastInsertRowid), name: f.name };
    const seen = new Set();
    for (const v of variants) {
      const key = `${str(v.size) || ''}|${str(v.color) || ''}`.toLowerCase();
      if (seen.has(key)) throw bad(`La variante "${[v.size, v.color].filter(Boolean).join(' / ') || 'única'}" está repetida.`);
      seen.add(key);
      insertVariant(product, v, req.user.id, !!req.body.auto_barcode);
    }
    return product.id;
  });
  res.status(201).json(getProduct(id));
});

router.put('/products/:id', can('products.edit'), (req, res) => {
  const current = db.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!current) throw notFound('Producto no encontrado.');
  db.tx(() => {
    const merged = { ...current, ...req.body };
    if (req.body.brand_id === undefined && req.body.brand_name !== undefined) merged.brand_id = null;
    const f = productFields(merged);
    db.run(
      `UPDATE products SET name = ?, description = ?, category_id = ?, brand_id = ?, supplier_id = ?, gender = ?, active = ?, updated_at = ?
       WHERE id = ?`,
      f.name, f.description, f.category_id, f.brand_id, f.supplier_id, f.gender, f.active, nowLocal(), current.id);

    if (Array.isArray(req.body.variants)) {
      const existing = db.all('SELECT * FROM product_variants WHERE product_id = ?', current.id);
      const keep = new Set();
      const product = { id: current.id, name: f.name };
      const seen = new Set();
      for (const v of req.body.variants) {
        const key = `${str(v.size) || ''}|${str(v.color) || ''}`.toLowerCase();
        const isActive = v.active === undefined || !!Number(v.active);
        if (isActive && seen.has(key)) throw bad(`La variante "${[v.size, v.color].filter(Boolean).join(' / ') || 'única'}" está repetida.`);
        if (isActive) seen.add(key);
        const old = v.id && existing.find((e) => e.id === int(v.id));
        if (old) {
          const vf = variantFields({ ...old, ...v });
          checkUnique(vf, old.id);
          db.run(
            `UPDATE product_variants SET sku = ?, barcode = ?, size = ?, color = ?, cost = ?, price = ?, min_stock = ?,
             location = ?, active = ?, updated_at = ? WHERE id = ?`,
            vf.sku || old.sku, vf.barcode, vf.size, vf.color, vf.cost, vf.price, vf.min_stock, vf.location, vf.active, nowLocal(), old.id);
          if (!vf.barcode && req.body.auto_barcode) {
            db.run('UPDATE product_variants SET barcode = ? WHERE id = ?', stock.internalBarcode(old.id), old.id);
          }
          keep.add(old.id);
        } else {
          keep.add(insertVariant(product, v, req.user.id, !!req.body.auto_barcode));
        }
      }
      for (const e of existing) {
        if (keep.has(e.id)) continue;
        const used = db.get(
          'SELECT (SELECT COUNT(*) FROM sale_items WHERE variant_id = ?) + (SELECT COUNT(*) FROM purchase_items WHERE variant_id = ?) AS n',
          e.id, e.id);
        if (used.n > 0 || e.stock !== 0) {
          db.run('UPDATE product_variants SET active = 0, updated_at = ? WHERE id = ?', nowLocal(), e.id);
        } else {
          db.run('DELETE FROM product_variants WHERE id = ?', e.id);
        }
      }
      if (keep.size === 0) throw bad('El producto debe tener al menos una variante.');
    }
  });
  res.json(getProduct(current.id));
});

router.delete('/products/:id', can('products.edit'), (req, res) => {
  const p = db.get('SELECT id FROM products WHERE id = ?', req.params.id);
  if (!p) throw notFound('Producto no encontrado.');
  const used = db.get(
    `SELECT (SELECT COUNT(*) FROM sale_items WHERE product_id = ?)
          + (SELECT COUNT(*) FROM purchase_items pi JOIN product_variants v ON v.id = pi.variant_id WHERE v.product_id = ?) AS n`,
    p.id, p.id);
  if (used.n > 0) {
    db.run('UPDATE products SET active = 0, updated_at = ? WHERE id = ?', nowLocal(), p.id);
    return res.json({ ok: true, deactivated: true });
  }
  db.run('DELETE FROM products WHERE id = ?', p.id);
  res.json({ ok: true });
});

// ---------- Imagen ----------

router.get('/products/:id/image', (req, res) => {
  const row = db.get('SELECT image, image_type, updated_at FROM products WHERE id = ?', req.params.id);
  if (!row || !row.image) return res.status(404).end();
  res.setHeader('Content-Type', row.image_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(Buffer.from(row.image));
});

router.put('/products/:id/image', can('products.edit'), (req, res) => {
  const p = db.get('SELECT id FROM products WHERE id = ?', req.params.id);
  if (!p) throw notFound('Producto no encontrado.');
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(req.body.data || ''));
  if (!m) throw bad('Imagen no válida. Usa JPG, PNG o WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1.5 * 1024 * 1024) throw bad('La imagen es demasiado grande (máx. 1.5 MB).');
  db.run('UPDATE products SET image = ?, image_type = ?, updated_at = ? WHERE id = ?', buf, m[1], nowLocal(), p.id);
  res.json(getProduct(p.id));
});

router.delete('/products/:id/image', can('products.edit'), (req, res) => {
  db.run('UPDATE products SET image = NULL, image_type = NULL, updated_at = ? WHERE id = ?', nowLocal(), req.params.id);
  res.json({ ok: true });
});

// ---------- Variantes (búsqueda para POS, compras y ajustes) ----------

router.get('/variants/search', can('pos', 'products.view', 'inventory', 'purchases'), (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const exact = db.all(`
    SELECT v.*, p.name, p.category_id, b.name AS brand_name, c.name AS category_name, (p.image IS NOT NULL) AS has_image
    FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE (v.barcode = ? OR v.sku = ?) AND v.active = 1 AND p.active = 1`, q, q);
  const strip = (list) => (canSeeCost(req) ? list : list.map(hideCost));
  if (exact.length) return res.json(strip(exact.map((r) => ({ ...r, exact: true }))));
  const where = [];
  const params = [];
  for (const w of q.split(/\s+/).slice(0, 8)) {
    const like = `%${w}%`;
    where.push(`(p.name LIKE ? OR v.sku LIKE ? OR IFNULL(v.barcode,'') LIKE ? OR IFNULL(v.size,'') LIKE ? OR IFNULL(v.color,'') LIKE ? OR IFNULL(b.name,'') LIKE ?)`);
    params.push(like, like, like, like, like, like);
  }
  const includeInactive = req.query.all === '1';
  res.json(strip(db.all(`
    SELECT v.*, p.name, p.category_id, b.name AS brand_name, c.name AS category_name, (p.image IS NOT NULL) AS has_image
    FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where.join(' AND ')} ${includeInactive ? '' : 'AND v.active = 1 AND p.active = 1'}
    ORDER BY p.name, v.id LIMIT ?`, ...params, Math.min(100, int(req.query.limit, 30)))));
});

/** Catálogo compacto para el punto de venta (búsqueda instantánea en el navegador). */
router.get('/pos/catalog', can('pos'), (req, res) => {
  const products = db.all(`
    SELECT p.id, p.name, p.category_id, p.gender, b.name AS brand_name, (p.image IS NOT NULL) AS has_image, p.updated_at
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1 ORDER BY p.name COLLATE NOCASE`);
  const variants = db.all(`
    SELECT v.id, v.product_id, v.sku, v.barcode, v.size, v.color, v.price, v.stock
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.active = 1 AND p.active = 1 ORDER BY v.id`);
  const byProduct = new Map(products.map((p) => [p.id, Object.assign(p, { variants: [] })]));
  for (const v of variants) byProduct.get(v.product_id)?.variants.push(v);
  res.json(products.filter((p) => p.variants.length));
});

module.exports = router;
