'use strict';
const express = require('express');
const db = require('../db');
const { can, hasPerm } = require('../auth');
const { bad, notFound, str, num, int, round2, dateRange, nowLocal } = require('../util');

const router = express.Router();

function openSessionFor(userId) {
  return db.get("SELECT * FROM cash_sessions WHERE user_id = ? AND status = 'abierta' ORDER BY id DESC LIMIT 1", userId);
}

/** Resumen de un turno de caja: ventas por método, devoluciones, entradas/salidas y efectivo esperado. */
function sessionSummary(id) {
  const s = db.get(`
    SELECT cs.*, u.name AS user_name FROM cash_sessions cs JOIN users u ON u.id = cs.user_id WHERE cs.id = ?`, id);
  if (!s) return null;
  const sales = db.get(`
    SELECT COUNT(*) AS count, IFNULL(SUM(total), 0) AS total, IFNULL(SUM(line_discount + global_discount), 0) AS discounts,
      IFNULL(SUM(items_count), 0) AS units
    FROM sales WHERE cash_session_id = ? AND status = 'completada'`, id);
  const cancelled = db.get(`
    SELECT COUNT(*) AS count, IFNULL(SUM(total), 0) AS total FROM sales WHERE cash_session_id = ? AND status = 'cancelada'`, id);
  const byMethod = db.all(`
    SELECT sp.method, IFNULL(SUM(sp.amount), 0) AS amount, COUNT(DISTINCT sp.sale_id) AS count
    FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
    WHERE s.cash_session_id = ? AND s.status = 'completada' GROUP BY sp.method ORDER BY amount DESC`, id);
  const refunds = db.all(`
    SELECT refund_method AS method, IFNULL(SUM(total), 0) AS amount, COUNT(*) AS count
    FROM returns WHERE cash_session_id = ? GROUP BY refund_method`, id);
  const movements = db.all(`
    SELECT m.*, u.name AS user_name FROM cash_movements m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.cash_session_id = ? ORDER BY m.id`, id);

  const cashSales = round2(byMethod.find((m) => m.method === 'efectivo')?.amount || 0);
  const cashRefunds = round2(refunds.find((m) => m.method === 'efectivo')?.amount || 0);
  const inflows = round2(movements.filter((m) => m.type === 'entrada').reduce((a, m) => a + m.amount, 0));
  const outflows = round2(movements.filter((m) => m.type === 'salida').reduce((a, m) => a + m.amount, 0));
  const expected = round2(s.opening_amount + cashSales - cashRefunds + inflows - outflows);

  return {
    ...s,
    sales,
    cancelled,
    by_method: byMethod,
    refunds,
    refunds_total: round2(refunds.reduce((a, r) => a + r.amount, 0)),
    movements,
    cash_sales: cashSales,
    cash_refunds: cashRefunds,
    inflows,
    outflows,
    expected_cash: s.status === 'cerrada' ? s.expected_amount : expected,
  };
}

router.get('/cash/current', can('cash', 'pos'), (req, res) => {
  const s = openSessionFor(req.user.id);
  res.json(s ? sessionSummary(s.id) : null);
});

router.post('/cash/open', can('cash', 'pos'), (req, res) => {
  if (openSessionFor(req.user.id)) throw bad('Ya tienes una caja abierta.');
  const amount = round2(num(req.body.opening_amount));
  if (amount < 0) throw bad('El fondo inicial no puede ser negativo.');
  const r = db.run('INSERT INTO cash_sessions (user_id, opening_amount, notes) VALUES (?, ?, ?)', req.user.id, amount, str(req.body.notes));
  res.status(201).json(sessionSummary(Number(r.lastInsertRowid)));
});

router.post('/cash/movements', can('cash', 'pos'), (req, res) => {
  const s = openSessionFor(req.user.id);
  if (!s) throw bad('No tienes una caja abierta.');
  const type = req.body.type === 'entrada' ? 'entrada' : 'salida';
  const amount = round2(num(req.body.amount));
  if (amount <= 0) throw bad('El monto debe ser mayor a cero.');
  const reason = str(req.body.reason);
  if (!reason) throw bad('Indica el motivo del movimiento.');
  if (type === 'salida') {
    const current = sessionSummary(s.id);
    if (amount > current.expected_cash + 0.001) throw bad(`No hay suficiente efectivo en caja (disponible: ${current.expected_cash.toFixed(2)}).`);
  }
  db.run('INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)', s.id, req.user.id, type, amount, reason);
  res.status(201).json(sessionSummary(s.id));
});

router.post('/cash/close', can('cash', 'pos'), (req, res) => {
  const s = openSessionFor(req.user.id);
  if (!s) throw bad('No tienes una caja abierta.');
  if (req.body.counted_amount === undefined || req.body.counted_amount === '' || req.body.counted_amount === null) {
    throw bad('Captura el efectivo contado en caja.');
  }
  const counted = round2(num(req.body.counted_amount));
  if (counted < 0) throw bad('El efectivo contado no puede ser negativo.');
  const summary = sessionSummary(s.id);
  const diff = round2(counted - summary.expected_cash);
  db.run(`UPDATE cash_sessions SET status = 'cerrada', closed_at = ?, expected_amount = ?, counted_amount = ?, difference = ?,
    notes = TRIM(IFNULL(notes, '') || ' ' || IFNULL(?, '')) WHERE id = ?`,
  nowLocal(), summary.expected_cash, counted, diff, str(req.body.notes), s.id);
  res.json(sessionSummary(s.id));
});

router.get('/cash/sessions', can('cash', 'cash.all'), (req, res) => {
  const where = [];
  const params = [];
  if (!hasPerm(req, 'cash.all')) { where.push('cs.user_id = ?'); params.push(req.user.id); }
  else if (req.query.user_id) { where.push('cs.user_id = ?'); params.push(int(req.query.user_id)); }
  if (req.query.from || req.query.to) {
    const r = dateRange(req.query);
    where.push('cs.opened_at BETWEEN ? AND ?');
    params.push(r.fromTs, r.toTs);
  }
  if (req.query.status) { where.push('cs.status = ?'); params.push(req.query.status); }
  const limit = Math.min(200, Math.max(1, int(req.query.limit, 50)));
  const page = Math.max(1, int(req.query.page, 1));
  const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.all(`
    SELECT cs.*, u.name AS user_name,
      (SELECT COUNT(*) FROM sales s WHERE s.cash_session_id = cs.id AND s.status = 'completada') AS sales_count,
      (SELECT IFNULL(SUM(total), 0) FROM sales s WHERE s.cash_session_id = cs.id AND s.status = 'completada') AS sales_total
    FROM cash_sessions cs JOIN users u ON u.id = cs.user_id
    ${sqlWhere} ORDER BY cs.id DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  const { total } = db.get(`SELECT COUNT(*) AS total FROM cash_sessions cs ${sqlWhere}`, ...params);
  res.json({ rows, total, page, limit });
});

router.get('/cash/sessions/:id', can('cash', 'cash.all'), (req, res) => {
  const s = sessionSummary(int(req.params.id));
  if (!s) throw notFound('Turno no encontrado.');
  if (!hasPerm(req, 'cash.all') && s.user_id !== req.user.id) throw notFound('Turno no encontrado.');
  res.json(s);
});

module.exports = router;
module.exports.openSessionFor = openSessionFor;
module.exports.sessionSummary = sessionSummary;
