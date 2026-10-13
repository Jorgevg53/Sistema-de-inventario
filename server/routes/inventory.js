'use strict';
const express = require('express');
const db = require('../db');
const { can } = require('../auth');
const { bad, notFound, str, int, num, round2, folio, dateRange, nowLocal } = require('../util');
const stock = require('../stock');

const router = express.Router();

// ---------- Ajustes manuales ----------

const ADJUST_REASONS = ['Conteo físico', 'Mercancía dañada', 'Merma', 'Robo / extravío', 'Muestra / regalo', 'Uso interno', 'Corrección de captura', 'Otro'];

router.get('/inventory/reasons', (req, res) => res.json(ADJUST_REASONS));

/**
 * Ajuste de inventario. Cada item: { variant_id, mode: 'set' | 'add', quantity }.
 * mode 'set' fija el stock al valor indicado, 'add' suma (o resta si es negativo).
 */
router.post('/inventory/adjust', can('inventory'), (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw bad('Agrega al menos un producto al ajuste.');
  const reason = str(req.body.reason) || 'Ajuste manual';
  const note = str(req.body.note);
  const type = reason === 'Conteo físico' ? 'conteo' : 'ajuste';
  const results = db.tx(() => items.map((it) => {
    const v = db.get('SELECT id, stock FROM product_variants WHERE id = ?', int(it.variant_id));
    if (!v) throw notFound('Producto no encontrado.');
    const qty = it.mode === 'set' ? int(it.quantity) - v.stock : int(it.quantity);
    if (it.mode === 'set' && int(it.quantity) < 0) throw bad('El stock no puede ser negativo.');
    const after = stock.moveStock({
      variantId: v.id, qty, type, reference: reason, note, userId: req.user.id, allowNegative: it.mode === 'set',
    });
    return { variant_id: v.id, before: v.stock, after: after ?? v.stock, change: qty };
  }));
  res.json({ ok: true, results, changed: results.filter((r) => r.change !== 0).length });
});

// ---------- Kardex / movimientos ----------

router.get('/inventory/movements', can('inventory', 'products.view'), (req, res) => {
  const where = [];
  const params = [];
  if (req.query.variant_id) { where.push('m.variant_id = ?'); params.push(int(req.query.variant_id)); }
  if (req.query.product_id) { where.push('v.product_id = ?'); params.push(int(req.query.product_id)); }
  if (req.query.type) { where.push('m.type = ?'); params.push(req.query.type); }
  if (req.query.from || req.query.to) {
    const r = dateRange(req.query);
    where.push('m.created_at BETWEEN ? AND ?');
    params.push(r.fromTs, r.toTs);
  }
  if (req.query.q) {
    for (const w of String(req.query.q).trim().split(/\s+/).slice(0, 6)) {
      where.push("(p.name LIKE ? OR v.sku LIKE ? OR IFNULL(m.reference,'') LIKE ?)");
      params.push(`%${w}%`, `%${w}%`, `%${w}%`);
    }
  }
  const limit = Math.min(1000, Math.max(1, int(req.query.limit, 100)));
  const page = Math.max(1, int(req.query.page, 1));
  const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const from = `FROM inventory_movements m
    JOIN product_variants v ON v.id = m.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN users u ON u.id = m.user_id`;
  const rows = db.all(`
    SELECT m.*, v.sku, v.size, v.color, p.id AS product_id, p.name, u.name AS user_name
    ${from} ${sqlWhere} ORDER BY m.id DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  const { total } = db.get(`SELECT COUNT(*) AS total ${from} ${sqlWhere}`, ...params);
  res.json({ rows, total, page, limit, types: stock.MOVEMENT_TYPES });
});

// ---------- Conteo físico (lista de variantes para contar) ----------

router.get('/inventory/count-sheet', can('inventory'), (req, res) => {
  const where = ['v.active = 1', 'p.active = 1'];
  const params = [];
  if (req.query.category_id) { where.push('p.category_id = ?'); params.push(int(req.query.category_id)); }
  if (req.query.brand_id) { where.push('p.brand_id = ?'); params.push(int(req.query.brand_id)); }
  if (req.query.location) { where.push('v.location LIKE ?'); params.push(`%${req.query.location}%`); }
  res.json(db.all(`
    SELECT v.id AS variant_id, v.sku, v.barcode, v.size, v.color, v.stock, v.location, v.cost,
      p.name, c.name AS category_name, b.name AS brand_name
    FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
    WHERE ${where.join(' AND ')}
    ORDER BY c.sort_order, p.name COLLATE NOCASE, v.id`, ...params));
});

// ---------- Compras / entradas de mercancía ----------

router.get('/purchases', can('purchases'), (req, res) => {
  const where = [];
  const params = [];
  if (req.query.from || req.query.to) {
    const r = dateRange(req.query);
    where.push('pu.created_at BETWEEN ? AND ?');
    params.push(r.fromTs, r.toTs);
  }
  if (req.query.supplier_id) { where.push('pu.supplier_id = ?'); params.push(int(req.query.supplier_id)); }
  if (req.query.status) { where.push('pu.status = ?'); params.push(req.query.status); }
  if (req.query.q) {
    where.push("(pu.folio LIKE ? OR IFNULL(pu.invoice,'') LIKE ? OR IFNULL(s.name,'') LIKE ?)");
    params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(500, Math.max(1, int(req.query.limit, 50)));
  const page = Math.max(1, int(req.query.page, 1));
  const rows = db.all(`
    SELECT pu.*, s.name AS supplier_name, u.name AS user_name
    FROM purchases pu LEFT JOIN suppliers s ON s.id = pu.supplier_id LEFT JOIN users u ON u.id = pu.user_id
    ${sqlWhere} ORDER BY pu.id DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  const sum = db.get(`
    SELECT COUNT(*) AS total, IFNULL(SUM(CASE WHEN pu.status = 'recibida' THEN pu.total END), 0) AS amount
    FROM purchases pu LEFT JOIN suppliers s ON s.id = pu.supplier_id ${sqlWhere}`, ...params);
  res.json({ rows, total: sum.total, amount: sum.amount, page, limit });
});

router.get('/purchases/:id', can('purchases'), (req, res) => {
  const p = db.get(`
    SELECT pu.*, s.name AS supplier_name, u.name AS user_name
    FROM purchases pu LEFT JOIN suppliers s ON s.id = pu.supplier_id LEFT JOIN users u ON u.id = pu.user_id
    WHERE pu.id = ?`, req.params.id);
  if (!p) throw notFound('Compra no encontrada.');
  p.items = db.all(`
    SELECT pi.*, v.sku, v.size, v.color, v.barcode, v.price, v.stock
    FROM purchase_items pi LEFT JOIN product_variants v ON v.id = pi.variant_id
    WHERE pi.purchase_id = ? ORDER BY pi.id`, p.id);
  res.json(p);
});

/**
 * Registrar entrada de mercancía.
 * body: { supplier_id, invoice, notes, update_cost, items: [{ variant_id, quantity, unit_cost, new_price? }] }
 */
router.post('/purchases', can('purchases'), (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw bad('Agrega al menos un producto a la compra.');
  const updateCost = req.body.update_cost !== false;
  const id = db.tx(() => {
    const r = db.run('INSERT INTO purchases (supplier_id, invoice, user_id, notes) VALUES (?, ?, ?, ?)',
      int(req.body.supplier_id) || null, str(req.body.invoice), req.user.id, str(req.body.notes));
    const purchaseId = Number(r.lastInsertRowid);
    const ref = folio('C', purchaseId);
    let total = 0;
    let count = 0;
    for (const it of items) {
      const qty = int(it.quantity);
      const unitCost = round2(num(it.unit_cost));
      if (qty <= 0) throw bad('Las cantidades deben ser mayores a cero.');
      if (unitCost < 0) throw bad('El costo no puede ser negativo.');
      const v = db.get(`SELECT v.*, p.name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`, int(it.variant_id));
      if (!v) throw notFound('Producto no encontrado.');
      const lineTotal = round2(qty * unitCost);
      const label = stock.variantLabel(v);
      db.run('INSERT INTO purchase_items (purchase_id, variant_id, name, quantity, unit_cost, total) VALUES (?, ?, ?, ?, ?, ?)',
        purchaseId, v.id, v.name + (label ? ` (${label})` : ''), qty, unitCost, lineTotal);
      if (updateCost) {
        db.run('UPDATE product_variants SET cost = ? WHERE id = ?', stock.averageCost(v.stock, v.cost, qty, unitCost), v.id);
      }
      if (it.new_price !== undefined && it.new_price !== null && it.new_price !== '' && num(it.new_price) > 0) {
        db.run('UPDATE product_variants SET price = ? WHERE id = ?', round2(num(it.new_price)), v.id);
      }
      stock.moveStock({ variantId: v.id, qty, type: 'compra', reference: ref, userId: req.user.id, unitCost });
      total += lineTotal;
      count += qty;
    }
    db.run('UPDATE purchases SET folio = ?, total = ?, items_count = ? WHERE id = ?', ref, round2(total), count, purchaseId);
    return purchaseId;
  });
  res.status(201).json(db.get('SELECT * FROM purchases WHERE id = ?', id));
});

router.post('/purchases/:id/cancel', can('purchases'), (req, res) => {
  const p = db.get('SELECT * FROM purchases WHERE id = ?', req.params.id);
  if (!p) throw notFound('Compra no encontrada.');
  if (p.status === 'cancelada') throw bad('La compra ya está cancelada.');
  db.tx(() => {
    for (const it of db.all('SELECT * FROM purchase_items WHERE purchase_id = ?', p.id)) {
      if (!it.variant_id) continue;
      stock.moveStock({
        variantId: it.variant_id, qty: -it.quantity, type: 'cancelacion_compra', reference: p.folio,
        note: str(req.body.reason), userId: req.user.id, unitCost: it.unit_cost, allowNegative: true,
      });
    }
    db.run("UPDATE purchases SET status = 'cancelada', cancelled_at = ? WHERE id = ?", nowLocal(), p.id);
  });
  res.json({ ok: true });
});

module.exports = router;
