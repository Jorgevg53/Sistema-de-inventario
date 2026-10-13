'use strict';
const express = require('express');
const db = require('../db');
const { can } = require('../auth');
const { bad, notFound, str, int, wordsFilter } = require('../util');

const router = express.Router();

const STATS = `
  (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completada') AS purchases,
  (SELECT IFNULL(SUM(s.total - s.returned_total), 0) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completada') AS total_spent,
  (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completada') AS last_purchase`;

router.get('/customers', can('customers', 'pos', 'sales.view'), (req, res) => {
  const where = [];
  const params = [];
  if (req.query.active !== 'all') where.push('c.active = 1');
  if (req.query.q) {
    const f = wordsFilter(req.query.q, ['c.name', "IFNULL(c.phone,'')", "IFNULL(c.email,'')", "IFNULL(c.tax_id,'')"]);
    where.push(f.sql);
    params.push(...f.params);
  }
  const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(500, Math.max(1, int(req.query.limit, 50)));
  const page = Math.max(1, int(req.query.page, 1));
  const order = req.query.sort === 'top' ? 'total_spent DESC' : req.query.sort === 'recent' ? 'last_purchase DESC' : 'c.name COLLATE NOCASE';
  const rows = db.all(`SELECT c.*, ${STATS} FROM customers c ${sqlWhere} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  const { total } = db.get(`SELECT COUNT(*) AS total FROM customers c ${sqlWhere}`, ...params);
  res.json({ rows, total, page, limit });
});

router.get('/customers/:id', can('customers', 'pos', 'sales.view'), (req, res) => {
  const c = db.get(`SELECT c.*, ${STATS} FROM customers c WHERE c.id = ?`, req.params.id);
  if (!c) throw notFound('Cliente no encontrado.');
  c.sales = db.all(`
    SELECT s.id, s.folio, s.created_at, s.total, s.returned_total, s.items_count, s.status, u.name AS user_name
    FROM sales s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 100`, c.id);
  c.top_products = db.all(`
    SELECT si.name, SUM(si.quantity - si.returned_qty) AS units, SUM(si.total) AS amount
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.customer_id = ? AND s.status = 'completada'
    GROUP BY si.product_id ORDER BY units DESC LIMIT 5`, c.id);
  res.json(c);
});

function fields(body, current = {}) {
  const pick = (k) => (body[k] === undefined ? current[k] ?? null : str(body[k]));
  const name = pick('name');
  if (!name) throw bad('El nombre del cliente es obligatorio.');
  const email = pick('email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('El correo electrónico no es válido.');
  return [name, pick('phone'), email, pick('tax_id'), pick('address'), pick('notes')];
}

router.post('/customers', can('customers', 'pos'), (req, res) => {
  const f = fields(req.body);
  if (f[1] && db.get('SELECT id FROM customers WHERE phone = ? AND active = 1', f[1])) {
    throw bad('Ya existe un cliente con ese teléfono.');
  }
  const r = db.run('INSERT INTO customers (name, phone, email, tax_id, address, notes) VALUES (?, ?, ?, ?, ?, ?)', ...f);
  res.status(201).json(db.get('SELECT * FROM customers WHERE id = ?', r.lastInsertRowid));
});

router.put('/customers/:id', can('customers'), (req, res) => {
  const c = db.get('SELECT * FROM customers WHERE id = ?', req.params.id);
  if (!c) throw notFound('Cliente no encontrado.');
  const active = req.body.active === undefined ? c.active : (req.body.active ? 1 : 0);
  db.run('UPDATE customers SET name = ?, phone = ?, email = ?, tax_id = ?, address = ?, notes = ?, active = ? WHERE id = ?',
    ...fields(req.body, c), active, c.id);
  res.json(db.get('SELECT * FROM customers WHERE id = ?', c.id));
});

router.delete('/customers/:id', can('customers'), (req, res) => {
  const c = db.get('SELECT * FROM customers WHERE id = ?', req.params.id);
  if (!c) throw notFound('Cliente no encontrado.');
  const { n } = db.get('SELECT COUNT(*) AS n FROM sales WHERE customer_id = ?', c.id);
  if (n > 0) {
    db.run('UPDATE customers SET active = 0 WHERE id = ?', c.id);
    return res.json({ ok: true, deactivated: true });
  }
  db.run('DELETE FROM customers WHERE id = ?', c.id);
  res.json({ ok: true });
});

module.exports = router;
