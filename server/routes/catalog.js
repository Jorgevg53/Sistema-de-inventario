'use strict';
const express = require('express');
const db = require('../db');
const { can } = require('../auth');
const { bad, notFound, str, int, wordsFilter } = require('../util');

const router = express.Router();

// ---------- Categorías ----------

router.get('/categories', (req, res) => {
  res.json(db.all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
    FROM categories c ORDER BY c.sort_order, c.name`));
});

router.post('/categories', can('products.edit'), (req, res) => {
  const name = str(req.body.name);
  if (!name) throw bad('El nombre de la categoría es obligatorio.');
  if (db.get('SELECT id FROM categories WHERE name = ?', name)) throw bad('Ya existe una categoría con ese nombre.');
  const { m } = db.get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS m FROM categories');
  const r = db.run('INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)', name, str(req.body.color) || '#0ea5e9', m);
  res.status(201).json(db.get('SELECT * FROM categories WHERE id = ?', r.lastInsertRowid));
});

router.put('/categories/:id', can('products.edit'), (req, res) => {
  const cat = db.get('SELECT * FROM categories WHERE id = ?', req.params.id);
  if (!cat) throw notFound('Categoría no encontrada.');
  const name = str(req.body.name) || cat.name;
  const dup = db.get('SELECT id FROM categories WHERE name = ? AND id <> ?', name, cat.id);
  if (dup) throw bad('Ya existe una categoría con ese nombre.');
  db.run('UPDATE categories SET name = ?, color = ?, sort_order = ?, active = ? WHERE id = ?',
    name, str(req.body.color) || cat.color,
    req.body.sort_order === undefined ? cat.sort_order : int(req.body.sort_order),
    req.body.active === undefined ? cat.active : (req.body.active ? 1 : 0), cat.id);
  res.json(db.get('SELECT * FROM categories WHERE id = ?', cat.id));
});

router.delete('/categories/:id', can('products.edit'), (req, res) => {
  const cat = db.get('SELECT * FROM categories WHERE id = ?', req.params.id);
  if (!cat) throw notFound('Categoría no encontrada.');
  const { n } = db.get('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', cat.id);
  if (n > 0) throw bad(`No se puede eliminar: hay ${n} producto(s) en esta categoría. Muévelos a otra primero.`);
  db.run('DELETE FROM categories WHERE id = ?', cat.id);
  res.json({ ok: true });
});

// ---------- Marcas ----------

router.get('/brands', (req, res) => {
  res.json(db.all(`
    SELECT b.*,
      (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.active = 1) AS product_count
    FROM brands b ORDER BY b.name`));
});

router.post('/brands', can('products.edit'), (req, res) => {
  const name = str(req.body.name);
  if (!name) throw bad('El nombre de la marca es obligatorio.');
  const existing = db.get('SELECT * FROM brands WHERE name = ?', name);
  if (existing) return res.json(existing);
  const r = db.run('INSERT INTO brands (name) VALUES (?)', name);
  res.status(201).json(db.get('SELECT * FROM brands WHERE id = ?', r.lastInsertRowid));
});

router.put('/brands/:id', can('products.edit'), (req, res) => {
  const brand = db.get('SELECT * FROM brands WHERE id = ?', req.params.id);
  if (!brand) throw notFound('Marca no encontrada.');
  const name = str(req.body.name) || brand.name;
  if (db.get('SELECT id FROM brands WHERE name = ? AND id <> ?', name, brand.id)) throw bad('Ya existe una marca con ese nombre.');
  db.run('UPDATE brands SET name = ?, active = ? WHERE id = ?', name,
    req.body.active === undefined ? brand.active : (req.body.active ? 1 : 0), brand.id);
  res.json(db.get('SELECT * FROM brands WHERE id = ?', brand.id));
});

router.delete('/brands/:id', can('products.edit'), (req, res) => {
  const brand = db.get('SELECT * FROM brands WHERE id = ?', req.params.id);
  if (!brand) throw notFound('Marca no encontrada.');
  const { n } = db.get('SELECT COUNT(*) AS n FROM products WHERE brand_id = ?', brand.id);
  if (n > 0) throw bad(`No se puede eliminar: hay ${n} producto(s) de esta marca.`);
  db.run('DELETE FROM brands WHERE id = ?', brand.id);
  res.json({ ok: true });
});

// ---------- Proveedores ----------

router.get('/suppliers', can('suppliers', 'products.view', 'purchases'), (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.q) {
    const f = wordsFilter(req.query.q, ['s.name', 's.contact', 's.phone', 's.email']);
    where.push(f.sql);
    params.push(...f.params);
  }
  if (req.query.active !== 'all') where.push('s.active = 1');
  res.json(db.all(`
    SELECT s.*,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.active = 1) AS product_count,
      (SELECT COUNT(*) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'recibida') AS purchase_count,
      (SELECT COALESCE(SUM(total), 0) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'recibida') AS purchase_total,
      (SELECT MAX(created_at) FROM purchases pu WHERE pu.supplier_id = s.id AND pu.status = 'recibida') AS last_purchase
    FROM suppliers s WHERE ${where.join(' AND ')} ORDER BY s.active DESC, s.name`, ...params));
});

function supplierFields(body, current = {}) {
  const pick = (k) => (body[k] === undefined ? current[k] ?? null : str(body[k]));
  const name = pick('name');
  if (!name) throw bad('El nombre del proveedor es obligatorio.');
  return [name, pick('contact'), pick('phone'), pick('email'), pick('address'), pick('tax_id'), pick('notes')];
}

router.post('/suppliers', can('suppliers'), (req, res) => {
  const r = db.run('INSERT INTO suppliers (name, contact, phone, email, address, tax_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', ...supplierFields(req.body));
  res.status(201).json(db.get('SELECT * FROM suppliers WHERE id = ?', r.lastInsertRowid));
});

router.put('/suppliers/:id', can('suppliers'), (req, res) => {
  const s = db.get('SELECT * FROM suppliers WHERE id = ?', req.params.id);
  if (!s) throw notFound('Proveedor no encontrado.');
  const active = req.body.active === undefined ? s.active : (req.body.active ? 1 : 0);
  db.run('UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ?, address = ?, tax_id = ?, notes = ?, active = ? WHERE id = ?',
    ...supplierFields(req.body, s), active, s.id);
  res.json(db.get('SELECT * FROM suppliers WHERE id = ?', s.id));
});

router.delete('/suppliers/:id', can('suppliers'), (req, res) => {
  const s = db.get('SELECT * FROM suppliers WHERE id = ?', req.params.id);
  if (!s) throw notFound('Proveedor no encontrado.');
  const used = db.get('SELECT (SELECT COUNT(*) FROM purchases WHERE supplier_id = ?) + (SELECT COUNT(*) FROM products WHERE supplier_id = ?) AS n', s.id, s.id);
  if (used.n > 0) {
    db.run('UPDATE suppliers SET active = 0 WHERE id = ?', s.id);
    return res.json({ ok: true, deactivated: true });
  }
  db.run('DELETE FROM suppliers WHERE id = ?', s.id);
  res.json({ ok: true });
});

module.exports = router;
