'use strict';
const fs = require('node:fs');
const path = require('node:path');

// node:sqlite está disponible sin opciones extra a partir de Node.js 22.13 / 23.4.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13) || (major === 23 && minor < 4)) {
  console.error(`\n  Este sistema necesita Node.js 22.13 o superior (tienes ${process.versions.node}).`);
  console.error('  Descarga la versión LTS más reciente en https://nodejs.org\n');
  process.exit(1);
}
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'tienda.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'cajero' CHECK (role IN ('admin','cajero','almacen')),
  active        INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT NOT NULL DEFAULT '#0ea5e9',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS brands (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  tax_id     TEXT,
  notes      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand_id    INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  gender      TEXT,
  image       BLOB,
  image_type  TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  barcode    TEXT UNIQUE,
  size       TEXT,
  color      TEXT,
  cost       REAL NOT NULL DEFAULT 0,
  price      REAL NOT NULL DEFAULT 0,
  stock      INTEGER NOT NULL DEFAULT 0,
  min_stock  INTEGER NOT NULL DEFAULT 0,
  location   TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id           INTEGER PRIMARY KEY,
  variant_id   INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  quantity     INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after  INTEGER NOT NULL,
  unit_cost    REAL,
  reference    TEXT,
  note         TEXT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_movements_variant ON inventory_movements(variant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_date ON inventory_movements(created_at);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  tax_id     TEXT,
  address    TEXT,
  notes      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  opened_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  opening_amount  REAL NOT NULL DEFAULT 0,
  closed_at       TEXT,
  expected_amount REAL,
  counted_amount  REAL,
  difference      REAL,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada'))
);
CREATE INDEX IF NOT EXISTS idx_cash_user ON cash_sessions(user_id, status);

CREATE TABLE IF NOT EXISTS cash_movements (
  id              INTEGER PRIMARY KEY,
  cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN ('entrada','salida')),
  amount          REAL NOT NULL,
  reason          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sales (
  id              INTEGER PRIMARY KEY,
  folio           TEXT UNIQUE,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  user_id         INTEGER REFERENCES users(id),
  cash_session_id INTEGER REFERENCES cash_sessions(id),
  items_count     INTEGER NOT NULL DEFAULT 0,
  gross           REAL NOT NULL DEFAULT 0,
  line_discount   REAL NOT NULL DEFAULT 0,
  global_discount REAL NOT NULL DEFAULT 0,
  subtotal        REAL NOT NULL DEFAULT 0,
  tax             REAL NOT NULL DEFAULT 0,
  tax_rate        REAL NOT NULL DEFAULT 0,
  tax_included    INTEGER NOT NULL DEFAULT 1,
  total           REAL NOT NULL DEFAULT 0,
  paid            REAL NOT NULL DEFAULT 0,
  change_amount   REAL NOT NULL DEFAULT 0,
  returned_total  REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'completada' CHECK (status IN ('completada','cancelada')),
  notes           TEXT,
  cancel_reason   TEXT,
  cancelled_by    INTEGER REFERENCES users(id),
  cancelled_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_session ON sales(cash_session_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id            INTEGER PRIMARY KEY,
  sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id    INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  variant_label TEXT,
  sku           TEXT,
  quantity      INTEGER NOT NULL,
  unit_price    REAL NOT NULL,
  unit_cost     REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL,
  net_total     REAL NOT NULL,
  returned_qty  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id);

CREATE TABLE IF NOT EXISTS sale_payments (
  id        INTEGER PRIMARY KEY,
  sale_id   INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method    TEXT NOT NULL,
  amount    REAL NOT NULL,
  reference TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON sale_payments(sale_id);

CREATE TABLE IF NOT EXISTS returns (
  id              INTEGER PRIMARY KEY,
  folio           TEXT UNIQUE,
  sale_id         INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id),
  cash_session_id INTEGER REFERENCES cash_sessions(id),
  reason          TEXT,
  refund_method   TEXT NOT NULL DEFAULT 'efectivo',
  restock         INTEGER NOT NULL DEFAULT 1,
  total           REAL NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(created_at);

CREATE TABLE IF NOT EXISTS return_items (
  id           INTEGER PRIMARY KEY,
  return_id    INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  variant_id   INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity     INTEGER NOT NULL,
  amount       REAL NOT NULL,
  net_amount   REAL NOT NULL DEFAULT 0,
  cost_amount  REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS held_sales (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id           INTEGER PRIMARY KEY,
  folio        TEXT UNIQUE,
  supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice      TEXT,
  user_id      INTEGER REFERENCES users(id),
  items_count  INTEGER NOT NULL DEFAULT 0,
  total        REAL NOT NULL DEFAULT 0,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'recibida' CHECK (status IN ('recibida','cancelada')),
  cancelled_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id          INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  name        TEXT,
  quantity    INTEGER NOT NULL,
  unit_cost   REAL NOT NULL,
  total       REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
`;

const DEFAULT_SETTINGS = {
  store_name: 'Mi Tienda de Natación',
  store_slogan: 'Natación y Deportes',
  store_address: '',
  store_phone: '',
  store_email: '',
  store_tax_id: '',
  currency_symbol: '$',
  locale: 'es-MX',
  tax_rate: '16',
  tax_included: '1',
  allow_negative_stock: '0',
  default_min_stock: '3',
  ticket_footer: '¡Gracias por su compra!\nCambios con ticket dentro de los 15 días siguientes.',
  ticket_width: '80',
  ticket_print_auto: '1',
  max_cashier_discount: '15',
};

const DEFAULT_CATEGORIES = [
  ['Trajes de baño', '#0284c7'],
  ['Goggles', '#7c3aed'],
  ['Gorras', '#db2777'],
  ['Entrenamiento', '#ea580c'],
  ['Accesorios', '#0d9488'],
  ['Ropa deportiva', '#2563eb'],
  ['Calzado', '#4f46e5'],
  ['Balones y equipo', '#16a34a'],
];

let db = null;
const stmtCache = new Map();

function clean(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function stmt(sql) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

function run(sql, ...params) {
  return stmt(sql).run(...params.map(clean));
}
function get(sql, ...params) {
  const row = stmt(sql).get(...params.map(clean));
  return row ? { ...row } : undefined;
}
function all(sql, ...params) {
  return stmt(sql).all(...params.map(clean)).map((r) => ({ ...r }));
}

let txDepth = 0;
/** Ejecuta fn dentro de una transacción; hace rollback si lanza un error. */
function tx(fn) {
  if (txDepth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    txDepth--;
  }
}

function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrate() {
  db.exec(SCHEMA);
  addColumn('purchases', 'cost_updated', 'INTEGER NOT NULL DEFAULT 1');
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

  const { n } = get('SELECT COUNT(*) AS n FROM categories');
  if (n === 0) {
    DEFAULT_CATEGORIES.forEach(([name, color], i) =>
      run('INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)', name, color, i));
  }
}

function open(file = DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  stmtCache.clear();
  migrate();
  return db;
}

function close() {
  if (db) {
    stmtCache.clear();
    db.close();
    db = null;
  }
}

function raw() {
  return db;
}

function getSettings() {
  const out = {};
  for (const row of all('SELECT key, value FROM settings')) out[row.key] = row.value;
  return out;
}

function setting(key) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  DEFAULT_SETTINGS,
  open,
  close,
  raw,
  run,
  get,
  all,
  tx,
  getSettings,
  setting,
};
