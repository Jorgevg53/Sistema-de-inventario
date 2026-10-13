'use strict';
/* Pruebas de la API: node --test test/ */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-test-'));
process.env.DATA_DIR = tmp;
process.env.DB_FILE = path.join(tmp, 'test.db');

const db = require('../server/db');
const auth = require('../server/auth');
const { createApp } = require('../server/index');
const { computeSale } = require('../server/routes/sales');

let server;
let base;

function client() {
  let cookie = '';
  async function call(method, url, body) {
    const res = await fetch(base + '/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  }
  return {
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    put: (u, b = {}) => call('PUT', u, b),
    del: (u) => call('DELETE', u),
    login: async (username, password) => call('POST', '/auth/login', { username, password }),
  };
}

const admin = client();
const cashier = client();

before(async () => {
  db.open();
  auth.ensureAdmin();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await admin.login('admin', 'admin123');
  assert.equal(r.status, 200);
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

test('computeSale: IVA incluido y reparto del descuento general', () => {
  const r = computeSale(
    [
      { unit_price: 899, quantity: 1 },
      { unit_price: 399, quantity: 2, discount_pct: 10 },
    ],
    { type: 'amount', value: 50 }, 16, true,
  );
  assert.equal(r.gross, 1697);
  assert.equal(r.line_discount, 79.8);
  assert.equal(r.global_discount, 50);
  assert.equal(r.total, 1567.2);
  assert.equal(r.subtotal + r.tax, r.total);
  assert.equal(r.lines.reduce((s, l) => s + l.total, 0).toFixed(2), '1567.20');
});

test('computeSale: IVA no incluido', () => {
  const r = computeSale([{ unit_price: 100, quantity: 3 }], { type: 'pct', value: 10 }, 16, false);
  assert.equal(r.subtotal, 270);
  assert.equal(r.tax, 43.2);
  assert.equal(r.total, 313.2);
});

test('inicio de sesión rechaza contraseña incorrecta y exige sesión', async () => {
  const c = client();
  assert.equal((await c.login('admin', 'mala')).status, 401);
  assert.equal((await c.get('/products')).status, 401);
  const pub = await c.get('/public/settings');
  assert.equal(pub.status, 200);
  assert.ok(pub.data.store_name);
});

let product;
test('alta de producto con tallas: SKU y código de barras automáticos, stock inicial en kardex', async () => {
  const r = await admin.post('/products', {
    name: 'Traje Prueba', brand_name: 'MarcaX', gender: 'Mujer', auto_barcode: true,
    variants: [
      { size: '30', color: 'Negro', cost: 100, price: 250, stock: 5, min_stock: 2 },
      { size: '32', color: 'Negro', cost: 100, price: 250, stock: 1, min_stock: 2 },
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  product = r.data;
  assert.equal(product.variants.length, 2);
  for (const v of product.variants) {
    assert.ok(v.sku);
    assert.match(v.barcode, /^\d{13}$/);
  }
  const brands = await admin.get('/brands');
  assert.ok(brands.data.some((b) => b.name === 'MarcaX'));
  const mov = await admin.get('/inventory/movements?product_id=' + product.id);
  assert.equal(mov.data.total, 2);
  assert.ok(mov.data.rows.every((m) => m.type === 'inicial'));

  const dup = await admin.post('/products', { name: 'Otro', variants: [{ sku: product.variants[0].sku, price: 1 }] });
  assert.equal(dup.status, 400);
});

test('venta: exige caja abierta, descuenta stock, calcula cambio y valida existencias', async () => {
  const v = product.variants[0];
  let r = await admin.post('/sales', { items: [{ variant_id: v.id, quantity: 1 }], payments: [{ method: 'efectivo', amount: 300 }] });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /abrir la caja/);

  r = await admin.post('/cash/open', { opening_amount: 500 });
  assert.equal(r.status, 201);

  r = await admin.post('/sales', { items: [{ variant_id: v.id, quantity: 2 }], payments: [{ method: 'efectivo', amount: 600 }] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.total, 500);
  assert.equal(r.data.change_amount, 100);
  assert.equal(r.data.payments[0].amount, 500);
  assert.match(r.data.folio, /^V-\d{6}$/);

  const p = await admin.get('/products/' + product.id);
  assert.equal(p.data.variants.find((x) => x.id === v.id).stock, 3);

  r = await admin.post('/sales', { items: [{ variant_id: v.id, quantity: 10 }], payments: [{ method: 'efectivo', amount: 5000 }] });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Stock insuficiente/);

  r = await admin.post('/sales', { items: [{ variant_id: v.id, quantity: 1 }], payments: [{ method: 'tarjeta', amount: 300 }] });
  assert.equal(r.status, 400, 'la tarjeta no puede exceder el total');
});

test('cajero: no puede cambiar precios, tiene límite de descuento y no ve reportes', async () => {
  const u = await admin.post('/users', { name: 'Cajera', username: 'cajera', password: 'secreto1', role: 'cajero' });
  assert.equal(u.status, 201);
  assert.equal((await cashier.login('cajera', 'secreto1')).status, 200);
  assert.equal((await cashier.get('/reports/sales')).status, 403);
  assert.equal((await cashier.post('/products', { name: 'X' })).status, 403);
  await cashier.post('/cash/open', { opening_amount: 0 });
  const v = product.variants[0];
  let r = await cashier.post('/sales', { items: [{ variant_id: v.id, quantity: 1, unit_price: 1 }], payments: [{ method: 'efectivo', amount: 300 }] });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /administrador/);
  r = await cashier.post('/sales', { items: [{ variant_id: v.id, quantity: 1, discount_pct: 50 }], payments: [{ method: 'efectivo', amount: 300 }] });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /descuento máximo/);
  r = await cashier.post('/sales', { items: [{ variant_id: v.id, quantity: 1, discount_pct: 10 }], payments: [{ method: 'efectivo', amount: 225 }] });
  assert.equal(r.status, 201);
  assert.equal(r.data.total, 225);
  assert.equal((await cashier.post(`/sales/${r.data.id}/cancel`, { reason: 'x' })).status, 403);
});

test('devolución parcial: reembolso proporcional, regresa stock y afecta la caja', async () => {
  const v = product.variants[0];
  const before = (await admin.get('/cash/current')).data.expected_cash;
  const sale = (await admin.post('/sales', {
    items: [{ variant_id: v.id, quantity: 2 }], global_discount: { type: 'pct', value: 10 }, payments: [{ method: 'efectivo', amount: 450 }],
  })).data;
  assert.equal(sale.total, 450);
  const stockAfterSale = (await admin.get('/products/' + product.id)).data.variants.find((x) => x.id === v.id).stock;
  const r = await admin.post(`/sales/${sale.id}/return`, { items: [{ sale_item_id: sale.items[0].id, quantity: 1 }], refund_method: 'efectivo', reason: 'Talla' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.returned_total, 225);
  assert.equal(r.data.returns[0].folio.startsWith('D-'), true);
  const stock = (await admin.get('/products/' + product.id)).data.variants.find((x) => x.id === v.id).stock;
  assert.equal(stock, stockAfterSale + 1);
  const cash = (await admin.get('/cash/current')).data;
  assert.equal(cash.expected_cash, before + 450 - 225);
  const again = await admin.post(`/sales/${sale.id}/return`, { items: [{ sale_item_id: sale.items[0].id, quantity: 5 }], refund_method: 'efectivo', reason: 'x' });
  assert.equal(again.status, 400);
  const cancel = await admin.post(`/sales/${sale.id}/cancel`, { reason: 'x' });
  assert.equal(cancel.status, 400, 'no se cancela una venta con devoluciones');
});

test('cancelación: regresa stock y excluye la venta del corte', async () => {
  const v = product.variants[1];
  const sale = (await admin.post('/sales', { items: [{ variant_id: v.id, quantity: 1 }], payments: [{ method: 'efectivo', amount: 250 }] })).data;
  const before = (await admin.get('/cash/current')).data;
  const r = await admin.post(`/sales/${sale.id}/cancel`, { reason: 'Error de captura' });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'cancelada');
  const after = (await admin.get('/cash/current')).data;
  assert.equal(after.expected_cash, before.expected_cash - 250);
  assert.equal((await admin.get('/products/' + product.id)).data.variants.find((x) => x.id === v.id).stock, 1);
});

test('compra: suma existencias, costo promedio ponderado y cancelación', async () => {
  const v = product.variants[1];
  const r = await admin.post('/purchases', { invoice: 'F-1', items: [{ variant_id: v.id, quantity: 3, unit_cost: 140, new_price: 260 }] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.total, 420);
  let pv = (await admin.get('/products/' + product.id)).data.variants.find((x) => x.id === v.id);
  assert.equal(pv.stock, 4);
  assert.equal(pv.cost, 130); // (1*100 + 3*140) / 4
  assert.equal(pv.price, 260);
  assert.equal((await admin.post(`/purchases/${r.data.id}/cancel`, { reason: 'Devuelta' })).status, 200);
  pv = (await admin.get('/products/' + product.id)).data.variants.find((x) => x.id === v.id);
  assert.equal(pv.stock, 1);
});

test('ajuste de inventario (fijar y sumar) queda en el kardex', async () => {
  const v = product.variants[1];
  let r = await admin.post('/inventory/adjust', { reason: 'Conteo físico', items: [{ variant_id: v.id, mode: 'set', quantity: 7 }] });
  assert.equal(r.status, 200);
  r = await admin.post('/inventory/adjust', { reason: 'Merma', items: [{ variant_id: v.id, mode: 'add', quantity: -2 }] });
  assert.equal(r.status, 200);
  const mov = await admin.get(`/inventory/movements?variant_id=${v.id}&limit=2`);
  assert.equal(mov.data.rows[0].stock_after, 5);
  assert.equal(mov.data.rows[1].type, 'conteo');
  r = await admin.post('/inventory/adjust', { reason: 'Merma', items: [{ variant_id: v.id, mode: 'add', quantity: -50 }] });
  assert.equal(r.status, 400);
});

test('corte de caja: calcula diferencia y no permite vender con la caja cerrada', async () => {
  const cur = (await admin.get('/cash/current')).data;
  const r = await admin.post('/cash/close', { counted_amount: cur.expected_cash - 10 });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'cerrada');
  assert.equal(r.data.difference, -10);
  assert.equal((await admin.get('/cash/current')).data, null);
});

test('importación CSV agrupa tallas como variantes de un producto', async () => {
  const csv = [
    'nombre,categoria,marca,talla,color,costo,precio,stock',
    'Goggles CSV,Goggles,Speedo,,Negro,100,200,4',
    'Short CSV,Ropa deportiva,Nike,S,Negro,150,300,2',
    'Short CSV,Ropa deportiva,Nike,M,Negro,150,300,3',
    ',,,,,,,',
    'Sin precio,,,,,,,',
  ].join('\n');
  const r = await admin.post('/import/products', { csv, auto_barcode: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.created_products, 3);
  assert.equal(r.data.created_variants, 4);
  const list = await admin.get('/products?q=Short%20CSV');
  assert.equal(list.data.rows.length, 1);
  assert.equal(list.data.rows[0].variant_count, 2);
  assert.equal(list.data.rows[0].total_stock, 5);
  const exp = await admin.get('/export/products.csv');
  assert.match(exp.data, /Short CSV/);
});

test('reportes: ventas netas y utilidad coherentes', async () => {
  const r = await admin.get('/reports/sales');
  assert.equal(r.status, 200);
  const s = r.data.summary;
  assert.equal(Math.round((s.total - s.returns) * 100), Math.round(s.net * 100));
  assert.ok(s.profit > 0);
  const inv = await admin.get('/reports/inventory');
  assert.equal(inv.status, 200);
  assert.ok(inv.data.summary.units > 0);
  const dash = await admin.get('/dashboard');
  assert.equal(dash.status, 200);
  assert.ok(Array.isArray(dash.data.last_30));
});

test('respaldo descargable es una base SQLite válida', async () => {
  const res = await fetch(base + '/api/backup', { headers: { Cookie: (await (async () => {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
    return r.headers.get('set-cookie').split(';')[0];
  })()) } });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');
});
