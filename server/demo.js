'use strict';
/**
 * Datos de demostración para una tienda de natación y deportes.
 * Crea marcas, proveedores, productos con tallas/colores, clientes y (opcional) ventas históricas.
 */
const db = require('./db');
const auth = require('./auth');
const stock = require('./stock');
const { round2, folio, nowLocal } = require('./util');
const { computeSale } = require('./routes/sales');

const SUPPLIERS = [
  { name: 'Distribuidora Acuática del Centro', contact: 'Laura Méndez', phone: '55 1234 5678', email: 'ventas@acuatica.mx' },
  { name: 'Deportes Mayoreo SA de CV', contact: 'Ricardo Soto', phone: '33 9876 5432', email: 'pedidos@deportesmayoreo.mx' },
  { name: 'Importadora Swim Pro', contact: 'Ana Torres', phone: '81 5555 1212', email: 'contacto@swimpro.mx' },
];

// [nombre, categoría, marca, proveedor(idx), género, costo, precio, tallas, colores, stock base]
const PRODUCTS = [
  ['Traje de baño Endurance+ Medalist', 'Trajes de baño', 'Speedo', 0, 'Mujer', 520, 899, ['30', '32', '34', '36', '38'], ['Negro', 'Azul marino'], 3],
  ['Traje de baño Powerskin Jammer', 'Trajes de baño', 'Arena', 2, 'Hombre', 610, 1049, ['26', '28', '30', '32', '34'], ['Negro'], 3],
  ['Bañador Brief Hydrosity', 'Trajes de baño', 'Speedo', 0, 'Hombre', 260, 459, ['28', '30', '32', '34', '36'], ['Negro', 'Rojo', 'Azul rey'], 4],
  ['Traje de baño Durafast One', 'Trajes de baño', 'TYR', 2, 'Mujer', 470, 799, ['30', '32', '34', '36'], ['Morado', 'Negro'], 3],
  ['Traje de baño Infantil Aquaflex', 'Trajes de baño', 'Arena', 2, 'Niña', 230, 399, ['6', '8', '10', '12', '14'], ['Rosa', 'Turquesa'], 3],
  ['Jammer Infantil Team', 'Trajes de baño', 'Speedo', 0, 'Niño', 240, 419, ['6', '8', '10', '12', '14'], ['Negro', 'Azul'], 3],
  ['Goggles Vanquisher 2.0', 'Goggles', 'Speedo', 0, 'Unisex', 190, 349, [], ['Transparente', 'Espejo plata', 'Ahumado'], 8],
  ['Goggles Cobra Ultra Swipe', 'Goggles', 'Arena', 2, 'Unisex', 420, 749, [], ['Espejo azul', 'Espejo dorado'], 5],
  ['Goggles Special Ops 2.0', 'Goggles', 'TYR', 2, 'Unisex', 160, 299, [], ['Ahumado', 'Transparente'], 7],
  ['Goggles Junior Hydrospex', 'Goggles', 'Speedo', 0, 'Unisex', 110, 219, [], ['Azul', 'Rosa', 'Verde'], 6],
  ['Gorra de silicón Plain', 'Gorras', 'Speedo', 0, 'Unisex', 75, 159, [], ['Negro', 'Blanco', 'Azul', 'Rosa', 'Rojo'], 10],
  ['Gorra de silicón Long Hair', 'Gorras', 'Arena', 2, 'Mujer', 120, 239, [], ['Negro', 'Morado'], 6],
  ['Gorra de lycra Junior', 'Gorras', 'TYR', 2, 'Unisex', 45, 99, [], ['Azul', 'Rosa', 'Amarillo'], 8],
  ['Aletas cortas Zoomers Z2', 'Entrenamiento', 'Finis', 1, 'Unisex', 520, 899, ['XS', 'S', 'M', 'L', 'XL'], [], 3],
  ['Aletas largas Training Fin', 'Entrenamiento', 'Speedo', 0, 'Unisex', 380, 649, ['35-36', '37-38', '39-40', '41-42', '43-44'], [], 3],
  ['Tabla de natación Kickboard', 'Entrenamiento', 'Speedo', 0, 'Unisex', 140, 269, [], ['Azul', 'Amarillo'], 8],
  ['Pull Buoy', 'Entrenamiento', 'Arena', 2, 'Unisex', 110, 219, [], [], 10],
  ['Paletas de mano Agility', 'Entrenamiento', 'Finis', 1, 'Unisex', 260, 459, ['S', 'M', 'L'], [], 4],
  ['Snorkel frontal Swimmer', 'Entrenamiento', 'Finis', 1, 'Unisex', 330, 579, [], [], 5],
  ['Tapones para oídos de silicón', 'Accesorios', 'Speedo', 0, 'Unisex', 35, 79, [], [], 20],
  ['Pinza para nariz', 'Accesorios', 'TYR', 2, 'Unisex', 30, 69, [], [], 15],
  ['Antiempañante para goggles', 'Accesorios', 'Arena', 2, 'Unisex', 70, 139, [], [], 12],
  ['Toalla de microfibra', 'Accesorios', 'Speedo', 0, 'Unisex', 180, 329, ['M', 'L'], ['Azul', 'Gris'], 4],
  ['Mochila Team Backpack 35L', 'Accesorios', 'Arena', 2, 'Unisex', 520, 949, [], ['Negro', 'Azul marino'], 3],
  ['Bolsa de malla para equipo', 'Accesorios', 'Speedo', 0, 'Unisex', 120, 229, [], [], 6],
  ['Sandalias de alberca', 'Calzado', 'Adidas', 1, 'Unisex', 260, 499, ['24', '25', '26', '27', '28', '29'], ['Negro'], 3],
  ['Tenis para correr Revolution 7', 'Calzado', 'Nike', 1, 'Hombre', 820, 1499, ['25', '26', '27', '28', '29'], ['Negro', 'Gris'], 2],
  ['Tenis Runfalcon 3.0', 'Calzado', 'Adidas', 1, 'Mujer', 690, 1299, ['22', '23', '24', '25', '26'], ['Blanco', 'Rosa'], 2],
  ['Playera Dri-FIT Training', 'Ropa deportiva', 'Nike', 1, 'Hombre', 280, 549, ['S', 'M', 'L', 'XL'], ['Negro', 'Blanco', 'Azul'], 3],
  ['Leggings deportivos', 'Ropa deportiva', 'Under Armour', 1, 'Mujer', 390, 749, ['XS', 'S', 'M', 'L'], ['Negro', 'Vino'], 3],
  ['Short deportivo 7"', 'Ropa deportiva', 'Adidas', 1, 'Hombre', 250, 499, ['S', 'M', 'L', 'XL'], ['Negro', 'Gris'], 3],
  ['Rashguard UV manga larga', 'Ropa deportiva', 'Speedo', 0, 'Niño', 310, 589, ['6', '8', '10', '12'], ['Azul'], 3],
  ['Balón de fútbol No. 5', 'Balones y equipo', 'Adidas', 1, 'Unisex', 330, 649, [], ['Blanco/Negro'], 6],
  ['Balón de voleibol de playa', 'Balones y equipo', 'Mikasa', 1, 'Unisex', 450, 849, [], [], 4],
  ['Balón de waterpolo', 'Balones y equipo', 'Mikasa', 1, 'Unisex', 520, 949, ['Talla 4', 'Talla 5'], [], 3],
  ['Cuerda para saltar speed', 'Balones y equipo', 'Under Armour', 1, 'Unisex', 120, 249, [], [], 8],
];

const CUSTOMERS = [
  ['Club de Natación Delfines', '55 2345 6789', 'contacto@delfines.mx'],
  ['María Fernanda López', '55 3456 7890', 'mafer.lopez@correo.com'],
  ['Carlos Ramírez', '55 4567 8901', null],
  ['Escuela Acuática Burbujas', '55 5678 9012', 'admin@burbujas.mx'],
  ['Sofía Hernández', '55 6789 0123', 'sofi.hdz@correo.com'],
  ['Jorge Martínez', '55 7890 1234', null],
  ['Equipo Triatlón Tiburones', '55 8901 2345', 'tiburones.tri@correo.com'],
  ['Valentina Cruz', '55 9012 3456', null],
];

function rand(n) { return Math.floor(Math.random() * n); }

function seedCatalog(userId) {
  const supplierIds = SUPPLIERS.map((s) => Number(db.run(
    'INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?)', s.name, s.contact, s.phone, s.email).lastInsertRowid));
  const categoryId = (name) => {
    const c = db.get('SELECT id FROM categories WHERE name = ?', name);
    return c ? c.id : Number(db.run('INSERT INTO categories (name) VALUES (?)', name).lastInsertRowid);
  };
  const brandId = (name) => {
    const b = db.get('SELECT id FROM brands WHERE name = ?', name);
    return b ? b.id : Number(db.run('INSERT INTO brands (name) VALUES (?)', name).lastInsertRowid);
  };
  for (const [name, cat, brand, sup, gender, cost, price, sizes, colors, base] of PRODUCTS) {
    const pid = Number(db.run(
      'INSERT INTO products (name, category_id, brand_id, supplier_id, gender) VALUES (?, ?, ?, ?, ?)',
      name, categoryId(cat), brandId(brand), supplierIds[sup], gender).lastInsertRowid);
    const combos = [];
    for (const s of sizes.length ? sizes : [null]) for (const c of colors.length ? colors : [null]) combos.push([s, c]);
    combos.forEach(([size, color], i) => {
      const sku = `${brand.slice(0, 3).toUpperCase()}-${String(pid).padStart(4, '0')}-${String(i + 1).padStart(2, '0')}`;
      const vid = Number(db.run(
        'INSERT INTO product_variants (product_id, sku, size, color, cost, price, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
        pid, sku, size, color, cost, price, Math.max(1, Math.round(base / 2))).lastInsertRowid);
      db.run('UPDATE product_variants SET barcode = ? WHERE id = ?', stock.internalBarcode(vid), vid);
      const qty = Math.max(0, base + rand(base + 3) - 1);
      if (qty > 0) stock.moveStock({ variantId: vid, qty, type: 'inicial', note: 'Datos de demostración', userId, unitCost: cost });
    });
  }
  for (const [name, phone, email] of CUSTOMERS) {
    db.run('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)', name, phone, email);
  }
}

/** Genera ventas aleatorias de los últimos `days` días (sin afectar el stock actual de forma negativa). */
function seedSales(userId, days = 45) {
  const settings = db.getSettings();
  const variants = db.all(`SELECT v.*, p.name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active = 1`);
  const customers = db.all('SELECT id FROM customers');
  const methods = ['efectivo', 'efectivo', 'efectivo', 'tarjeta', 'tarjeta', 'transferencia'];
  const now = new Date();
  for (let d = days; d >= 1; d--) {
    const day = new Date(now);
    day.setDate(now.getDate() - d);
    const open = new Date(day); open.setHours(10, 0, 0, 0);
    const close = new Date(day); close.setHours(20, 0, 0, 0);
    const sessionId = Number(db.run(
      "INSERT INTO cash_sessions (user_id, opened_at, opening_amount, status) VALUES (?, ?, 1000, 'abierta')",
      userId, nowLocal(open)).lastInsertRowid);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const n = 3 + rand(weekend ? 9 : 6);
    for (let k = 0; k < n; k++) {
      const at = new Date(day);
      at.setHours(10 + rand(10), rand(60), rand(60));
      const lines = [];
      const count = 1 + rand(3);
      for (let j = 0; j < count; j++) {
        const v = variants[rand(variants.length)];
        if (lines.some((l) => l.variant.id === v.id)) continue;
        lines.push({ variant: v, quantity: 1 + (rand(5) === 0 ? 1 : 0), unit_price: v.price, discount_pct: rand(8) === 0 ? 10 : 0 });
      }
      const calc = computeSale(lines, null, settings.tax_rate, settings.tax_included === '1');
      const method = methods[rand(methods.length)];
      const paid = method === 'efectivo' ? Math.ceil(calc.total / 100) * 100 : calc.total;
      const customerId = rand(3) === 0 && customers.length ? customers[rand(customers.length)].id : null;
      const id = Number(db.run(`
        INSERT INTO sales (customer_id, user_id, cash_session_id, items_count, gross, line_discount, global_discount, subtotal, tax,
          tax_rate, tax_included, total, paid, change_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      customerId, userId, sessionId, lines.reduce((s, l) => s + l.quantity, 0), calc.gross, calc.line_discount, calc.global_discount,
      calc.subtotal, calc.tax, Number(settings.tax_rate), settings.tax_included === '1' ? 1 : 0, calc.total, paid,
      round2(paid - calc.total), nowLocal(at)).lastInsertRowid);
      const ref = folio('V', id);
      db.run('UPDATE sales SET folio = ? WHERE id = ?', ref, id);
      for (const l of calc.lines) {
        db.run(`INSERT INTO sale_items (sale_id, variant_id, product_id, name, variant_label, sku, quantity, unit_price, unit_cost, discount, total, net_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, l.variant.id, l.variant.product_id, l.variant.name, stock.variantLabel(l.variant) || null, l.variant.sku,
        l.quantity, l.unit_price, l.variant.cost, l.discount, l.total, l.net_total);
        // Registrar el movimiento histórico sin dejar el stock en negativo (se repone primero si hace falta).
        const cur = db.get('SELECT stock FROM product_variants WHERE id = ?', l.variant.id).stock;
        if (cur < l.quantity) {
          stock.moveStock({ variantId: l.variant.id, qty: l.quantity - cur + 2, type: 'compra', reference: 'Reposición', userId, unitCost: l.variant.cost });
          stampLastMovement(nowLocal(new Date(at.getTime() - 60000)));
        }
        stock.moveStock({ variantId: l.variant.id, qty: -l.quantity, type: 'venta', reference: ref, userId });
        stampLastMovement(nowLocal(at));
      }
      db.run('INSERT INTO sale_payments (sale_id, method, amount) VALUES (?, ?, ?)', id, method, calc.total);
    }
    db.run("UPDATE cash_sessions SET status = 'cerrada', closed_at = ?, expected_amount = 0, counted_amount = 0, difference = 0 WHERE id = ?", nowLocal(close), sessionId);
    // Calcular el efectivo esperado de cada turno histórico.
    const { cash } = db.get(`SELECT IFNULL(SUM(sp.amount), 0) AS cash FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
      WHERE s.cash_session_id = ? AND sp.method = 'efectivo'`, sessionId);
    const expected = round2(1000 + cash);
    db.run('UPDATE cash_sessions SET expected_amount = ?, counted_amount = ? WHERE id = ?', expected, expected, sessionId);
  }
}

function stampLastMovement(ts) {
  db.run('UPDATE inventory_movements SET created_at = ? WHERE id = (SELECT MAX(id) FROM inventory_movements)', ts);
}

/** Registra una compra de reposición para los productos que quedaron por debajo del mínimo. */
function seedRestock(userId) {
  const low = db.all(`SELECT v.*, p.name, p.supplier_id FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.stock <= v.min_stock ORDER BY p.supplier_id, v.id`);
  const bySupplier = new Map();
  for (const v of low) {
    if (rand(3) === 0) continue; // deja algunos en stock bajo para ver las alertas
    if (!bySupplier.has(v.supplier_id)) bySupplier.set(v.supplier_id, []);
    bySupplier.get(v.supplier_id).push(v);
  }
  const at = new Date();
  at.setDate(at.getDate() - 2);
  at.setHours(11, 30, 0, 0);
  for (const [supplierId, list] of bySupplier) {
    const id = Number(db.run('INSERT INTO purchases (supplier_id, invoice, user_id, notes, created_at) VALUES (?, ?, ?, ?, ?)',
      supplierId, `F-${1000 + rand(9000)}`, userId, 'Reposición semanal', nowLocal(at)).lastInsertRowid);
    const ref = folio('C', id);
    let total = 0;
    let units = 0;
    for (const v of list) {
      const qty = v.min_stock * 2 - v.stock + 1;
      const label = stock.variantLabel(v);
      db.run('INSERT INTO purchase_items (purchase_id, variant_id, name, quantity, unit_cost, total) VALUES (?, ?, ?, ?, ?, ?)',
        id, v.id, v.name + (label ? ` (${label})` : ''), qty, v.cost, round2(qty * v.cost));
      stock.moveStock({ variantId: v.id, qty, type: 'compra', reference: ref, userId, unitCost: v.cost });
      stampLastMovement(nowLocal(at));
      total += qty * v.cost;
      units += qty;
    }
    db.run('UPDATE purchases SET folio = ?, total = ?, items_count = ? WHERE id = ?', ref, round2(total), units, id);
  }
}

function hasProducts() {
  return db.get('SELECT COUNT(*) AS n FROM products').n > 0;
}

function seedDemo({ withSales = true, userId = null } = {}) {
  if (hasProducts()) throw new Error('Ya existen productos; los datos de demostración solo se cargan en una tienda vacía.');
  db.tx(() => {
    auth.ensureAdmin();
    const uid = userId || db.get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").id;
    seedCatalog(uid);
    if (withSales) {
      const start = new Date();
      start.setDate(start.getDate() - 46);
      start.setHours(9, 0, 0, 0);
      db.run("UPDATE inventory_movements SET created_at = ? WHERE type = 'inicial'", nowLocal(start));
      seedSales(uid);
      seedRestock(uid);
    }
  });
}

module.exports = { seedDemo, hasProducts };
