'use strict';
const express = require('express');
const db = require('../db');
const { can, hasPerm } = require('../auth');
const { round2, int, dateRange, dateOnly } = require('../util');
const { sessionSummary, openSessionFor } = require('./cash');

const router = express.Router();

// Expresiones reutilizables sobre sale_items (si) considerando devoluciones.
const EFF_QTY = '(si.quantity - si.returned_qty)';
const EFF_AMOUNT = `(si.total * ${EFF_QTY} * 1.0 / si.quantity)`;
const EFF_NET = `(si.net_total * ${EFF_QTY} * 1.0 / si.quantity)`;
const EFF_COST = `(si.unit_cost * ${EFF_QTY})`;

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateOnly(d);
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

function salesSummary(fromTs, toTs, userId = null) {
  const userSql = userId ? ' AND s.user_id = ?' : '';
  const params = userId ? [fromTs, toTs, userId] : [fromTs, toTs];
  const s = db.get(`
    SELECT COUNT(*) AS count, IFNULL(SUM(s.total), 0) AS total, IFNULL(SUM(s.returned_total), 0) AS returns,
      IFNULL(SUM(s.gross), 0) AS gross, IFNULL(SUM(s.line_discount + s.global_discount), 0) AS discounts,
      IFNULL(SUM(s.tax), 0) AS tax
    FROM sales s WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ?${userSql}`, ...params);
  const items = db.get(`
    SELECT IFNULL(SUM(${EFF_QTY}), 0) AS units, IFNULL(SUM(${EFF_NET}), 0) AS net, IFNULL(SUM(${EFF_COST}), 0) AS cost
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ?${userSql}`, ...params);
  const cancelled = db.get(`
    SELECT COUNT(*) AS count, IFNULL(SUM(total), 0) AS total FROM sales s
    WHERE s.status = 'cancelada' AND s.created_at BETWEEN ? AND ?${userSql}`, ...params);
  const net = round2(s.total - s.returns);
  const profit = round2(items.net - items.cost);
  return {
    count: s.count,
    gross: round2(s.gross),
    discounts: round2(s.discounts),
    total: round2(s.total),
    returns: round2(s.returns),
    net,
    net_before_tax: round2(items.net),
    tax: round2(s.tax),
    units: items.units,
    cost: round2(items.cost),
    profit,
    margin: items.net > 0 ? round2((profit / items.net) * 100) : 0,
    avg_ticket: s.count ? round2(s.total / s.count) : 0,
    cancelled_count: cancelled.count,
    cancelled_total: round2(cancelled.total),
  };
}

function salesSeries(from, to, fromTs, toTs) {
  const days = daysBetween(from, to);
  const monthly = days > 62;
  const key = monthly ? "substr(s.created_at, 1, 7)" : "substr(s.created_at, 1, 10)";
  const rows = db.all(`
    SELECT ${key} AS k, COUNT(*) AS count, IFNULL(SUM(s.total - s.returned_total), 0) AS total
    FROM sales s WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ? GROUP BY k`, fromTs, toTs);
  const profitRows = db.all(`
    SELECT ${key} AS k, IFNULL(SUM(${EFF_NET} - ${EFF_COST}), 0) AS profit
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ? GROUP BY k`, fromTs, toTs);
  const map = new Map(rows.map((r) => [r.k, r]));
  const pmap = new Map(profitRows.map((r) => [r.k, r.profit]));
  const out = [];
  if (monthly) {
    let [y, m] = from.slice(0, 7).split('-').map(Number);
    const end = to.slice(0, 7);
    for (let guard = 0; guard < 240; guard++) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      const r = map.get(k);
      out.push({ date: k, count: r ? r.count : 0, total: round2(r ? r.total : 0), profit: round2(pmap.get(k) || 0) });
      if (k >= end) break;
      m++;
      if (m > 12) { m = 1; y++; }
    }
  } else {
    for (let i = 0; i <= days; i++) {
      const k = addDays(from, i);
      const r = map.get(k);
      out.push({ date: k, count: r ? r.count : 0, total: round2(r ? r.total : 0), profit: round2(pmap.get(k) || 0) });
    }
  }
  return { granularity: monthly ? 'month' : 'day', rows: out };
}

router.get('/reports/sales', can('reports'), (req, res) => {
  const { from, to, fromTs, toTs } = dateRange(req.query);
  const P = [fromTs, toTs];
  const base = `FROM sale_items si JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ?`;

  const summary = salesSummary(fromTs, toTs);
  // Periodo anterior de la misma duración para comparar.
  const len = daysBetween(from, to) + 1;
  const prevFrom = addDays(from, -len);
  const prevTo = addDays(from, -1);
  const previous = salesSummary(`${prevFrom} 00:00:00`, `${prevTo} 23:59:59`);

  const byCategory = db.all(`
    SELECT IFNULL(c.name, 'Sin categoría') AS name, IFNULL(c.color, '#94a3b8') AS color,
      SUM(${EFF_QTY}) AS units, ROUND(SUM(${EFF_AMOUNT}), 2) AS amount, ROUND(SUM(${EFF_NET} - ${EFF_COST}), 2) AS profit
    ${base.replace('LEFT JOIN products p ON p.id = si.product_id', 'LEFT JOIN products p ON p.id = si.product_id LEFT JOIN categories c ON c.id = p.category_id')}
    GROUP BY c.id ORDER BY amount DESC`, ...P);

  const byBrand = db.all(`
    SELECT IFNULL(b.name, 'Sin marca') AS name, SUM(${EFF_QTY}) AS units,
      ROUND(SUM(${EFF_AMOUNT}), 2) AS amount, ROUND(SUM(${EFF_NET} - ${EFF_COST}), 2) AS profit
    ${base.replace('LEFT JOIN products p ON p.id = si.product_id', 'LEFT JOIN products p ON p.id = si.product_id LEFT JOIN brands b ON b.id = p.brand_id')}
    GROUP BY b.id ORDER BY amount DESC LIMIT 20`, ...P);

  const topProducts = db.all(`
    SELECT si.product_id, si.name, SUM(${EFF_QTY}) AS units, ROUND(SUM(${EFF_AMOUNT}), 2) AS amount,
      ROUND(SUM(${EFF_NET} - ${EFF_COST}), 2) AS profit, COUNT(DISTINCT s.id) AS tickets
    ${base} GROUP BY si.product_id, si.name HAVING units > 0 ORDER BY amount DESC LIMIT ?`, ...P, Math.min(200, int(req.query.top, 25)));

  const topVariants = db.all(`
    SELECT si.variant_id, si.name, si.variant_label, si.sku, SUM(${EFF_QTY}) AS units, ROUND(SUM(${EFF_AMOUNT}), 2) AS amount
    ${base} GROUP BY si.variant_id HAVING units > 0 ORDER BY units DESC LIMIT 25`, ...P);

  const byMethod = db.all(`
    SELECT sp.method, ROUND(SUM(sp.amount), 2) AS amount, COUNT(DISTINCT sp.sale_id) AS count
    FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
    WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ? GROUP BY sp.method ORDER BY amount DESC`, ...P);

  const byUser = db.all(`
    SELECT IFNULL(u.name, '—') AS name, COUNT(*) AS count, ROUND(SUM(s.total - s.returned_total), 2) AS total,
      ROUND(AVG(s.total), 2) AS avg_ticket
    FROM sales s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ? GROUP BY s.user_id ORDER BY total DESC`, ...P);

  const byHour = db.all(`
    SELECT CAST(substr(s.created_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS count, ROUND(SUM(s.total), 2) AS total
    FROM sales s WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ? GROUP BY hour ORDER BY hour`, ...P);

  const byWeekday = db.all(`
    SELECT CAST(strftime('%w', s.created_at) AS INTEGER) AS weekday, COUNT(*) AS count, ROUND(SUM(s.total), 2) AS total
    FROM sales s WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ? GROUP BY weekday ORDER BY weekday`, ...P);

  const topCustomers = db.all(`
    SELECT c.id, c.name, COUNT(*) AS count, ROUND(SUM(s.total - s.returned_total), 2) AS total
    FROM sales s JOIN customers c ON c.id = s.customer_id
    WHERE s.status = 'completada' AND s.created_at BETWEEN ? AND ? GROUP BY c.id ORDER BY total DESC LIMIT 10`, ...P);

  const returns = db.all(`
    SELECT r.id, r.folio, r.created_at, r.total, r.refund_method, r.reason, s.folio AS sale_folio, u.name AS user_name
    FROM returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN users u ON u.id = r.user_id
    WHERE r.created_at BETWEEN ? AND ? ORDER BY r.id DESC LIMIT 100`, ...P);

  res.json({
    from, to, summary, previous: { from: prevFrom, to: prevTo, ...previous },
    series: salesSeries(from, to, fromTs, toTs),
    by_category: byCategory, by_brand: byBrand, top_products: topProducts, top_variants: topVariants,
    by_method: byMethod, by_user: byUser, by_hour: byHour, by_weekday: byWeekday, top_customers: topCustomers, returns,
  });
});

router.get('/reports/inventory', can('reports', 'inventory'), (req, res) => {
  const summary = db.get(`
    SELECT COUNT(DISTINCT p.id) AS products, COUNT(*) AS variants, IFNULL(SUM(MAX(v.stock, 0)), 0) AS units,
      ROUND(IFNULL(SUM(MAX(v.stock, 0) * v.cost), 0), 2) AS cost_value,
      ROUND(IFNULL(SUM(MAX(v.stock, 0) * v.price), 0), 2) AS price_value,
      SUM(v.stock <= v.min_stock AND v.stock > 0) AS low_count, SUM(v.stock <= 0) AS out_count
    FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active = 1 AND p.active = 1`);
  summary.potential_profit = round2(summary.price_value - summary.cost_value);

  const byCategory = db.all(`
    SELECT IFNULL(c.name, 'Sin categoría') AS name, IFNULL(c.color, '#94a3b8') AS color, COUNT(DISTINCT p.id) AS products,
      IFNULL(SUM(MAX(v.stock, 0)), 0) AS units, ROUND(IFNULL(SUM(MAX(v.stock, 0) * v.cost), 0), 2) AS cost_value,
      ROUND(IFNULL(SUM(MAX(v.stock, 0) * v.price), 0), 2) AS price_value
    FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE v.active = 1 AND p.active = 1 GROUP BY c.id ORDER BY cost_value DESC`);

  const byBrand = db.all(`
    SELECT IFNULL(b.name, 'Sin marca') AS name, COUNT(DISTINCT p.id) AS products, IFNULL(SUM(MAX(v.stock, 0)), 0) AS units,
      ROUND(IFNULL(SUM(MAX(v.stock, 0) * v.cost), 0), 2) AS cost_value, ROUND(IFNULL(SUM(MAX(v.stock, 0) * v.price), 0), 2) AS price_value
    FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN brands b ON b.id = p.brand_id
    WHERE v.active = 1 AND p.active = 1 GROUP BY b.id ORDER BY cost_value DESC`);

  const lowStock = db.all(`
    SELECT v.id AS variant_id, v.product_id, p.name, v.sku, v.size, v.color, v.stock, v.min_stock, v.cost, v.price,
      c.name AS category_name, b.name AS brand_name, s.name AS supplier_name,
      (SELECT IFNULL(SUM(si.quantity - si.returned_qty), 0) FROM sale_items si JOIN sales sa ON sa.id = si.sale_id
        WHERE si.variant_id = v.id AND sa.status = 'completada' AND sa.created_at >= datetime('now', 'localtime', '-30 days')) AS sold_30d
    FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE v.active = 1 AND p.active = 1 AND v.stock <= v.min_stock
    ORDER BY v.stock - v.min_stock, p.name LIMIT 500`);

  const days = Math.max(15, Math.min(365, int(req.query.days, 60)));
  const slow = db.all(`
    SELECT p.id, p.name, c.name AS category_name, SUM(v.stock) AS units, ROUND(SUM(MAX(v.stock,0) * v.cost), 2) AS cost_value,
      (SELECT MAX(sa.created_at) FROM sale_items si JOIN sales sa ON sa.id = si.sale_id WHERE si.product_id = p.id AND sa.status = 'completada') AS last_sale
    FROM products p JOIN product_variants v ON v.product_id = p.id AND v.active = 1
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1
    GROUP BY p.id
    HAVING units > 0 AND (last_sale IS NULL OR last_sale < datetime('now', 'localtime', ?))
    ORDER BY cost_value DESC LIMIT 100`, `-${days} days`);

  res.json({ summary, by_category: byCategory, by_brand: byBrand, low_stock: lowStock, slow_movers: slow, slow_days: days });
});

router.get('/dashboard', (req, res) => {
  const today = dateOnly();
  const yesterday = addDays(today, -1);
  const monthStart = today.slice(0, 8) + '01';
  const showMoney = hasPerm(req, 'reports');
  const canSales = hasPerm(req, 'sales.view') || hasPerm(req, 'reports');

  const out = { today, show_profit: showMoney };
  if (canSales) {
    out.today_sales = salesSummary(`${today} 00:00:00`, `${today} 23:59:59`);
    out.yesterday_sales = salesSummary(`${yesterday} 00:00:00`, `${yesterday} 23:59:59`);
    out.month_sales = salesSummary(`${monthStart} 00:00:00`, `${today} 23:59:59`);
    out.my_today = salesSummary(`${today} 00:00:00`, `${today} 23:59:59`, req.user.id);
    const from30 = addDays(today, -29);
    out.last_30 = salesSeries(from30, today, `${from30} 00:00:00`, `${today} 23:59:59`).rows;
    out.top_products = db.all(`
      SELECT si.product_id, si.name, SUM(${EFF_QTY}) AS units, ROUND(SUM(${EFF_AMOUNT}), 2) AS amount
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'completada' AND s.created_at >= ? GROUP BY si.product_id HAVING units > 0 ORDER BY units DESC LIMIT 6`,
    `${monthStart} 00:00:00`);
    out.recent_sales = db.all(`
      SELECT s.id, s.folio, s.created_at, s.total, s.status, s.items_count, c.name AS customer_name, u.name AS user_name
      FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.id DESC LIMIT 8`);
    if (!showMoney) {
      for (const k of ['today_sales', 'yesterday_sales', 'month_sales', 'my_today']) {
        delete out[k].cost; delete out[k].profit; delete out[k].margin;
      }
      for (const r of out.last_30) delete r.profit;
    }
  }

  out.stock = db.get(`
    SELECT SUM(v.stock <= v.min_stock AND v.stock > 0) AS low, SUM(v.stock <= 0) AS out, COUNT(*) AS variants,
      COUNT(DISTINCT v.product_id) AS products, IFNULL(SUM(MAX(v.stock,0)), 0) AS units
    FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active = 1 AND p.active = 1`);
  if (showMoney || hasPerm(req, 'inventory')) {
    const val = db.get(`
      SELECT ROUND(IFNULL(SUM(MAX(v.stock,0) * v.cost), 0), 2) AS cost_value, ROUND(IFNULL(SUM(MAX(v.stock,0) * v.price), 0), 2) AS price_value
      FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active = 1 AND p.active = 1`);
    Object.assign(out.stock, val);
  }
  out.low_stock = db.all(`
    SELECT v.id AS variant_id, v.product_id, p.name, v.size, v.color, v.stock, v.min_stock
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.active = 1 AND p.active = 1 AND v.stock <= v.min_stock
    ORDER BY v.stock, p.name LIMIT 8`);

  if (hasPerm(req, 'pos') || hasPerm(req, 'cash')) {
    const s = openSessionFor(req.user.id);
    out.cash = s ? sessionSummary(s.id) : null;
  }
  res.json(out);
});

module.exports = router;
