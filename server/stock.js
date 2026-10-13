'use strict';
const db = require('./db');
const { bad, notFound, nowLocal, round2 } = require('./util');

const MOVEMENT_TYPES = {
  inicial: 'Inventario inicial',
  compra: 'Compra / entrada',
  venta: 'Venta',
  devolucion: 'Devolución de cliente',
  cancelacion: 'Cancelación de venta',
  cancelacion_compra: 'Cancelación de compra',
  ajuste: 'Ajuste manual',
  conteo: 'Conteo físico',
};

function variantLabel(v) {
  return [v.size, v.color].filter(Boolean).join(' / ');
}

/**
 * Mueve el stock de una variante y registra el movimiento en el kardex.
 * qty positivo = entrada, negativo = salida.
 */
function moveStock({ variantId, qty, type, reference = null, note = null, userId = null, unitCost = null, allowNegative = false }) {
  qty = Math.trunc(Number(qty));
  if (!qty) return null;
  const v = db.get(
    `SELECT v.id, v.stock, v.cost, v.size, v.color, p.name
     FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`, variantId);
  if (!v) throw notFound('Producto no encontrado.');
  const after = v.stock + qty;
  if (after < 0 && !allowNegative) {
    const label = variantLabel(v);
    throw bad(`Stock insuficiente de "${v.name}${label ? ' (' + label + ')' : ''}". Disponible: ${v.stock}.`);
  }
  db.run('UPDATE product_variants SET stock = ?, updated_at = ? WHERE id = ?', after, nowLocal(), v.id);
  db.run(
    `INSERT INTO inventory_movements (variant_id, type, quantity, stock_before, stock_after, unit_cost, reference, note, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    v.id, type, qty, v.stock, after, unitCost ?? v.cost, reference, note, userId,
  );
  return after;
}

/** Recalcula el costo promedio ponderado al recibir mercancía. */
function averageCost(currentStock, currentCost, qty, unitCost) {
  const base = Math.max(0, currentStock);
  if (base + qty <= 0) return round2(unitCost);
  return round2((base * currentCost + qty * unitCost) / (base + qty));
}

function allowNegativeStock() {
  return db.setting('allow_negative_stock') === '1';
}

/** Genera un EAN-13 interno (prefijo 20 = uso interno de la tienda) a partir del id de variante. */
function internalBarcode(variantId) {
  const base = '20' + String(variantId).padStart(10, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

module.exports = { MOVEMENT_TYPES, variantLabel, moveStock, averageCost, allowNegativeStock, internalBarcode };
