'use strict';
const express = require('express');
const db = require('../db');
const { can, hasPerm } = require('../auth');
const { bad, notFound, str, num, int, round2, folio, dateRange, nowLocal } = require('../util');
const stock = require('../stock');
const { openSessionFor, sessionSummary } = require('./cash');

const router = express.Router();

const PAYMENT_METHODS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

/**
 * Calcula importes de una venta (líneas, descuentos e impuestos).
 * Exportado para poder probarlo y reutilizarlo.
 */
function computeSale(lines, globalDiscount, taxRate, taxIncluded) {
  let gross = 0;
  let lineDiscount = 0;
  const out = lines.map((l) => {
    const g = round2(l.unit_price * l.quantity);
    let d = 0;
    if (l.discount_pct) d = round2(g * Math.min(100, Math.max(0, num(l.discount_pct))) / 100);
    else if (l.discount_amount) d = Math.min(g, round2(Math.max(0, num(l.discount_amount))));
    gross += g;
    lineDiscount += d;
    return { ...l, gross: g, discount: d, total: round2(g - d) };
  });
  const afterLines = round2(gross - lineDiscount);
  let global = 0;
  if (globalDiscount && num(globalDiscount.value) > 0) {
    global = globalDiscount.type === 'pct'
      ? round2(afterLines * Math.min(100, num(globalDiscount.value)) / 100)
      : Math.min(afterLines, round2(num(globalDiscount.value)));
  }
  // Repartir el descuento global proporcionalmente entre las líneas.
  if (global > 0 && afterLines > 0) {
    let remaining = global;
    out.forEach((l, i) => {
      const share = i === out.length - 1 ? remaining : round2(global * l.total / afterLines);
      const applied = Math.min(share, l.total);
      l.discount = round2(l.discount + applied);
      l.total = round2(l.total - applied);
      remaining = round2(remaining - applied);
    });
  }
  const rate = Math.max(0, num(taxRate)) / 100;
  const linesTotal = round2(out.reduce((s, l) => s + l.total, 0));
  let subtotal;
  let tax;
  let total;
  if (taxIncluded) {
    total = linesTotal;
    subtotal = round2(total / (1 + rate));
    tax = round2(total - subtotal);
    for (const l of out) l.net_total = round2(l.total / (1 + rate));
  } else {
    subtotal = linesTotal;
    tax = round2(subtotal * rate);
    total = round2(subtotal + tax);
    for (const l of out) l.net_total = l.total;
  }
  return {
    lines: out,
    gross: round2(gross),
    line_discount: round2(lineDiscount),
    global_discount: global,
    subtotal,
    tax,
    total,
  };
}

function getSale(id) {
  const s = db.get(`
    SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.tax_id AS customer_tax_id,
      u.name AS user_name, cu.name AS cancelled_by_name
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN users cu ON cu.id = s.cancelled_by
    WHERE s.id = ?`, id);
  if (!s) return null;
  s.items = db.all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', s.id);
  s.payments = db.all('SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY id', s.id);
  s.returns = db.all(`
    SELECT r.*, u.name AS user_name FROM returns r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.sale_id = ? ORDER BY r.id`, s.id);
  for (const r of s.returns) {
    r.items = db.all(`
      SELECT ri.*, si.name, si.variant_label, si.sku FROM return_items ri
      JOIN sale_items si ON si.id = ri.sale_item_id WHERE ri.return_id = ?`, r.id);
  }
  const session = s.cash_session_id && db.get('SELECT status FROM cash_sessions WHERE id = ?', s.cash_session_id);
  s.can_cancel = s.status === 'completada' && s.returned_total === 0 && !!session && session.status === 'abierta';
  s.can_return = s.status === 'completada' && s.items.some((i) => i.quantity > i.returned_qty);
  return s;
}

// ---------- Registrar venta ----------

router.post('/sales', can('pos'), (req, res) => {
  const body = req.body || {};
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw bad('El carrito está vacío.');

  const session = openSessionFor(req.user.id);
  if (!session) throw bad('Debes abrir la caja antes de registrar ventas.');

  const settings = db.getSettings();
  const isAdmin = hasPerm(req, 'sales.cancel');
  const allowNegative = settings.allow_negative_stock === '1';

  const saleId = db.tx(() => {
    // Validar y preparar líneas
    const lines = rawItems.map((it) => {
      const qty = int(it.quantity);
      if (qty <= 0) throw bad('Las cantidades deben ser mayores a cero.');
      const v = db.get(`
        SELECT v.*, p.name, p.active AS product_active FROM product_variants v
        JOIN products p ON p.id = v.product_id WHERE v.id = ?`, int(it.variant_id));
      if (!v || !v.active || !v.product_active) throw bad('Uno de los productos ya no está disponible. Actualiza el catálogo.');
      let unitPrice = v.price;
      if (it.unit_price !== undefined && it.unit_price !== null && round2(num(it.unit_price)) !== v.price) {
        if (!isAdmin) throw bad('Solo un administrador puede cambiar el precio de venta.');
        unitPrice = round2(num(it.unit_price));
        if (unitPrice < 0) throw bad('El precio no puede ser negativo.');
      }
      return {
        variant: v,
        quantity: qty,
        unit_price: unitPrice,
        discount_pct: num(it.discount_pct),
        discount_amount: num(it.discount_amount),
      };
    });

    const calc = computeSale(lines, body.global_discount, settings.tax_rate, settings.tax_included === '1');

    if (!isAdmin && calc.gross > 0) {
      const maxPct = num(settings.max_cashier_discount, 100);
      const pct = ((calc.line_discount + calc.global_discount) / calc.gross) * 100;
      if (pct > maxPct + 0.01) throw bad(`El descuento máximo permitido para cajeros es ${maxPct}%.`);
    }

    // Pagos
    const payments = (Array.isArray(body.payments) ? body.payments : [])
      .map((p) => ({ method: PAYMENT_METHODS[p.method] ? p.method : 'otro', amount: round2(num(p.amount)), reference: str(p.reference) }))
      .filter((p) => p.amount > 0);
    const tendered = round2(payments.reduce((s, p) => s + p.amount, 0));
    const cashTendered = round2(payments.filter((p) => p.method === 'efectivo').reduce((s, p) => s + p.amount, 0));
    const nonCash = round2(tendered - cashTendered);
    if (nonCash > calc.total + 0.001) throw bad('Los pagos con tarjeta/transferencia no pueden exceder el total.');
    if (tendered + 0.001 < calc.total) throw bad(`Pago insuficiente. Faltan ${(calc.total - tendered).toFixed(2)}.`);
    const change = round2(tendered - calc.total);
    if (change > cashTendered + 0.001) throw bad('El cambio solo puede entregarse en efectivo.');

    const customerId = int(body.customer_id) || null;
    if (customerId && !db.get('SELECT id FROM customers WHERE id = ?', customerId)) throw bad('Cliente no encontrado.');

    const r = db.run(`
      INSERT INTO sales (customer_id, user_id, cash_session_id, items_count, gross, line_discount, global_discount,
        subtotal, tax, tax_rate, tax_included, total, paid, change_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      customerId, req.user.id, session.id, lines.reduce((s, l) => s + l.quantity, 0),
      calc.gross, calc.line_discount, calc.global_discount, calc.subtotal, calc.tax,
      num(settings.tax_rate), settings.tax_included === '1' ? 1 : 0, calc.total, tendered, change, str(body.notes));
    const id = Number(r.lastInsertRowid);
    const ref = folio('V', id);
    db.run('UPDATE sales SET folio = ? WHERE id = ?', ref, id);

    for (const l of calc.lines) {
      const v = l.variant;
      db.run(`
        INSERT INTO sale_items (sale_id, variant_id, product_id, name, variant_label, sku, quantity, unit_price, unit_cost, discount, total, net_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, v.id, v.product_id, v.name, stock.variantLabel(v) || null, v.sku, l.quantity, l.unit_price, v.cost, l.discount, l.total, l.net_total);
      stock.moveStock({ variantId: v.id, qty: -l.quantity, type: 'venta', reference: ref, userId: req.user.id, allowNegative });
    }

    // El cambio se descuenta del efectivo: se guarda el importe neto aplicado por método.
    let changeLeft = change;
    for (const p of payments) {
      let amount = p.amount;
      if (p.method === 'efectivo' && changeLeft > 0) {
        const d = Math.min(amount, changeLeft);
        amount = round2(amount - d);
        changeLeft = round2(changeLeft - d);
      }
      if (amount > 0) db.run('INSERT INTO sale_payments (sale_id, method, amount, reference) VALUES (?, ?, ?, ?)', id, p.method, amount, p.reference);
    }

    if (body.held_id) db.run('DELETE FROM held_sales WHERE id = ?', int(body.held_id));
    return id;
  });

  res.status(201).json(getSale(saleId));
});

// ---------- Consultas ----------

router.get('/sales', can('sales.view'), (req, res) => {
  const where = [];
  const params = [];
  const r = dateRange(req.query);
  if (req.query.from || req.query.to) { where.push('s.created_at BETWEEN ? AND ?'); params.push(r.fromTs, r.toTs); }
  if (req.query.user_id) { where.push('s.user_id = ?'); params.push(int(req.query.user_id)); }
  if (req.query.customer_id) { where.push('s.customer_id = ?'); params.push(int(req.query.customer_id)); }
  if (req.query.session_id) { where.push('s.cash_session_id = ?'); params.push(int(req.query.session_id)); }
  if (req.query.status) { where.push('s.status = ?'); params.push(req.query.status); }
  if (req.query.method) { where.push('EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND sp.method = ?)'); params.push(req.query.method); }
  if (req.query.q) {
    const q = `%${String(req.query.q).trim()}%`;
    where.push(`(s.folio LIKE ? OR IFNULL(c.name,'') LIKE ? OR EXISTS (
      SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND (si.name LIKE ? OR si.sku LIKE ?)))`);
    params.push(q, q, q, q);
  }
  const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(500, Math.max(1, int(req.query.limit, 50)));
  const page = Math.max(1, int(req.query.page, 1));
  const from = 'FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id';
  const rows = db.all(`
    SELECT s.id, s.folio, s.created_at, s.items_count, s.total, s.returned_total, s.status, s.global_discount, s.line_discount,
      c.name AS customer_name, u.name AS user_name,
      (SELECT GROUP_CONCAT(method) FROM (SELECT DISTINCT method FROM sale_payments WHERE sale_id = s.id)) AS methods
    ${from} ${sqlWhere} ORDER BY s.id DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  const summary = db.get(`
    SELECT COUNT(*) AS total,
      IFNULL(SUM(CASE WHEN s.status = 'completada' THEN s.total END), 0) AS amount,
      IFNULL(SUM(CASE WHEN s.status = 'completada' THEN s.returned_total END), 0) AS returned,
      SUM(s.status = 'completada') AS completed, SUM(s.status = 'cancelada') AS cancelled
    ${from} ${sqlWhere}`, ...params);
  res.json({ rows, total: summary.total, summary, page, limit });
});

router.get('/sales/:id', can('sales.view', 'pos'), (req, res) => {
  const s = getSale(req.params.id);
  if (!s) throw notFound('Venta no encontrada.');
  res.json(s);
});

// ---------- Cancelación ----------

router.post('/sales/:id/cancel', can('sales.cancel'), (req, res) => {
  const s = getSale(req.params.id);
  if (!s) throw notFound('Venta no encontrada.');
  if (s.status === 'cancelada') throw bad('La venta ya está cancelada.');
  if (s.returned_total > 0) throw bad('La venta tiene devoluciones; usa "Devolución" para los productos restantes.');
  if (!s.can_cancel) throw bad('El corte de caja de esta venta ya se cerró. Usa "Devolución" para regresar productos.');
  const reason = str(req.body.reason);
  if (!reason) throw bad('Indica el motivo de la cancelación.');
  db.tx(() => {
    for (const it of s.items) {
      if (it.variant_id) {
        stock.moveStock({ variantId: it.variant_id, qty: it.quantity, type: 'cancelacion', reference: s.folio, note: reason, userId: req.user.id, unitCost: it.unit_cost });
      }
    }
    db.run("UPDATE sales SET status = 'cancelada', cancel_reason = ?, cancelled_by = ?, cancelled_at = ? WHERE id = ?",
      reason, req.user.id, nowLocal(), s.id);
  });
  res.json(getSale(s.id));
});

// ---------- Devoluciones ----------

router.post('/sales/:id/return', can('sales.cancel'), (req, res) => {
  const s = getSale(req.params.id);
  if (!s) throw notFound('Venta no encontrada.');
  if (s.status !== 'completada') throw bad('Solo se pueden devolver productos de ventas completadas.');
  const items = (Array.isArray(req.body.items) ? req.body.items : []).filter((i) => int(i.quantity) > 0);
  if (!items.length) throw bad('Selecciona al menos un producto a devolver.');
  const method = PAYMENT_METHODS[req.body.refund_method] ? req.body.refund_method : 'efectivo';
  const restock = req.body.restock !== false;
  const session = openSessionFor(req.user.id);
  if (method === 'efectivo' && !session) throw bad('Abre tu caja para poder devolver dinero en efectivo.');
  const cashAvailable = method === 'efectivo' ? sessionSummary(session.id).expected_cash : Infinity;

  const linesTotal = s.items.reduce((sum, i) => sum + i.total, 0);
  const factor = linesTotal > 0 ? s.total / linesTotal : 1;

  db.tx(() => {
    const r = db.run('INSERT INTO returns (sale_id, user_id, cash_session_id, reason, refund_method, restock) VALUES (?, ?, ?, ?, ?, ?)',
      s.id, req.user.id, session ? session.id : null, str(req.body.reason), method, restock ? 1 : 0);
    const returnId = Number(r.lastInsertRowid);
    const ref = folio('D', returnId);
    let total = 0;
    for (const it of items) {
      const si = s.items.find((x) => x.id === int(it.sale_item_id));
      if (!si) throw bad('Producto no pertenece a esta venta.');
      const qty = int(it.quantity);
      const available = si.quantity - si.returned_qty;
      if (qty > available) throw bad(`Solo puedes devolver ${available} de "${si.name}".`);
      const amount = round2((si.total * qty / si.quantity) * factor);
      const net = round2(si.net_total * qty / si.quantity);
      db.run('INSERT INTO return_items (return_id, sale_item_id, variant_id, quantity, amount, net_amount, cost_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        returnId, si.id, si.variant_id, qty, amount, net, round2(si.unit_cost * qty));
      db.run('UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?', qty, si.id);
      si.returned_qty += qty;
      if (restock && si.variant_id) {
        stock.moveStock({ variantId: si.variant_id, qty, type: 'devolucion', reference: ref, note: str(req.body.reason), userId: req.user.id, unitCost: si.unit_cost });
      }
      total += amount;
    }
    // Evitar centavos sueltos: si se devolvió todo, el reembolso total es exactamente el total de la venta.
    const allReturned = s.items.every((i) => i.returned_qty >= i.quantity);
    if (allReturned) total = round2(s.total - s.returned_total);
    total = round2(total);
    if (total > cashAvailable + 0.001) {
      throw bad(`No hay suficiente efectivo en caja para reembolsar ${total.toFixed(2)} (disponible: ${cashAvailable.toFixed(2)}). Elige otra forma de reembolso o registra una entrada de efectivo.`);
    }
    db.run('UPDATE returns SET folio = ?, total = ? WHERE id = ?', ref, total, returnId);
    db.run('UPDATE sales SET returned_total = round(returned_total + ?, 2) WHERE id = ?', total, s.id);
  });
  res.json(getSale(s.id));
});

// ---------- Ventas en espera ----------

router.get('/held-sales', can('pos'), (req, res) => {
  res.json(db.all(`
    SELECT h.*, u.name AS user_name FROM held_sales h LEFT JOIN users u ON u.id = h.user_id
    ORDER BY h.id DESC`).map((h) => ({ ...h, data: JSON.parse(h.data) })));
});

router.post('/held-sales', can('pos'), (req, res) => {
  const data = req.body.data;
  if (!data || !Array.isArray(data.items) || !data.items.length) throw bad('No hay productos para poner en espera.');
  const r = db.run('INSERT INTO held_sales (user_id, label, data) VALUES (?, ?, ?)', req.user.id, str(req.body.label), JSON.stringify(data));
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.delete('/held-sales/:id', can('pos'), (req, res) => {
  db.run('DELETE FROM held_sales WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.computeSale = computeSale;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
