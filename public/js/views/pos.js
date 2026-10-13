/* Punto de venta: catálogo con búsqueda instantánea, carrito, cobro y ticket. */
(function () {
  'use strict';
  const { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } = Vue;
  const store = App.store;
  const fmt = App.fmt;
  const r2 = App.round2;
  const CART_KEY = 'pos-cart-v1';

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // ---------------------------------------------------------------------------
  // Selector de talla / color
  // ---------------------------------------------------------------------------
  const VariantPicker = {
    props: { product: Object, allowNegative: Boolean, inCart: Object },
    emits: ['pick', 'close'],
    setup(props, { emit }) {
      const sizes = computed(() => [...new Set(props.product.variants.map((v) => v.size).filter(Boolean))]);
      const colors = computed(() => [...new Set(props.product.variants.map((v) => v.color).filter(Boolean))]);
      const matrix = computed(() => sizes.value.length > 1 && colors.value.length > 1);
      const find = (size, color) => props.product.variants.find((v) => (v.size || null) === size && (v.color || null) === color);
      const available = (v) => v.stock - (props.inCart[v.id] || 0);
      const disabled = (v) => !v || (!props.allowNegative && available(v) <= 0);
      return { sizes, colors, matrix, find, available, disabled, emit, fmt };
    },
    template: `
      <modal :title="product.name" icon="shirt" size="lg" @close="emit('close')">
        <p class="muted small mb-12">{{ product.brand_name || '' }} · Elige {{ matrix ? 'color y talla' : 'una opción' }}</p>
        <div v-if="matrix" class="table-wrap">
          <table class="size-matrix">
            <thead><tr><th></th><th v-for="s in sizes" :key="s">{{ s }}</th></tr></thead>
            <tbody>
              <tr v-for="c in colors" :key="c">
                <th class="row-h">{{ c }}</th>
                <td v-for="s in sizes" :key="s">
                  <button v-if="find(s, c)" :disabled="disabled(find(s, c))" @click="emit('pick', find(s, c))" :title="fmt.money(find(s, c).price)">
                    <b>{{ s }}</b><span>{{ available(find(s, c)) }} disp.</span>
                  </button>
                  <button v-else disabled><span>—</span></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="variant-grid">
          <button v-for="v in product.variants" :key="v.id" class="variant-btn" :disabled="disabled(v)" @click="emit('pick', v)">
            <span class="vb-label">{{ fmt.variant(v) || 'Única' }}</span>
            <span class="vb-price">{{ fmt.money(v.price) }}</span>
            <span class="vb-stock" :class="available(v) <= 0 ? 'text-danger' : ''">{{ available(v) }} disponibles</span>
          </button>
        </div>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  // Edición de una línea del carrito
  // ---------------------------------------------------------------------------
  const LineEditor = {
    props: { line: Object, canPrice: Boolean, maxDiscount: Number },
    emits: ['save', 'remove', 'close'],
    setup(props, { emit }) {
      const f = reactive({
        quantity: props.line.quantity,
        unit_price: props.line.unit_price,
        discount_type: props.line.discount_type || 'pct',
        discount_value: props.line.discount_value || 0,
      });
      const gross = computed(() => r2((Number(f.unit_price) || 0) * (Number(f.quantity) || 0)));
      const discount = computed(() => {
        const v = Number(f.discount_value) || 0;
        if (v <= 0) return 0;
        return f.discount_type === 'pct' ? r2(gross.value * Math.min(100, v) / 100) : Math.min(gross.value, r2(v));
      });
      const qtyInput = ref(null);
      onMounted(() => nextTick(() => qtyInput.value && qtyInput.value.select()));
      function save() {
        const q = Math.trunc(Number(f.quantity));
        if (!q || q < 1) return App.toast('La cantidad debe ser al menos 1', 'error');
        emit('save', { quantity: q, unit_price: r2(Number(f.unit_price) || 0), discount_type: f.discount_type, discount_value: Number(f.discount_value) || 0 });
      }
      return { f, gross, discount, qtyInput, save, emit, fmt };
    },
    template: `
      <modal :title="line.name" icon="square-pen" size="sm" @close="emit('close')">
        <div class="muted small mb-12" v-if="line.variant_label">{{ line.variant_label }} · {{ line.sku }}</div>
        <div class="grid grid-2">
          <div class="form-group"><label>Cantidad</label>
            <input ref="qtyInput" class="input input-lg num" type="number" min="1" step="1" v-model="f.quantity" @keydown.enter="save" />
          </div>
          <div class="form-group"><label>Precio unitario</label>
            <money-input v-model="f.unit_price" size="input-lg" :class="{ disabled: !canPrice }" @enter="save" :style="canPrice ? '' : 'pointer-events:none;opacity:.6'" />
            <span class="hint" v-if="!canPrice">Solo un administrador puede cambiar el precio.</span>
          </div>
          <div class="form-group span-all">
            <label>Descuento en este producto</label>
            <div class="flex">
              <div class="btn-group">
                <button class="btn" :class="{ active: f.discount_type === 'pct' }" @click="f.discount_type = 'pct'"><icon name="percent" :size="15" /></button>
                <button class="btn" :class="{ active: f.discount_type === 'amount' }" @click="f.discount_type = 'amount'">{{ App.store.settings.currency_symbol || '$' }}</button>
              </div>
              <input class="input num flex-1" type="number" min="0" step="0.01" v-model="f.discount_value" @focus="$event.target.select()" @keydown.enter="save" />
            </div>
            <div class="flex flex-wrap mt-4">
              <button v-for="p in [5, 10, 15, 20]" :key="p" class="btn btn-xs" @click="f.discount_type = 'pct'; f.discount_value = p" :disabled="maxDiscount < p">{{ p }}%</button>
              <button class="btn btn-xs" @click="f.discount_value = 0">Sin descuento</button>
            </div>
          </div>
        </div>
        <div class="cart-totals mt-16" style="border-radius:10px;border:1px solid var(--border)">
          <div class="row"><span>Importe</span><span>{{ fmt.money(gross) }}</span></div>
          <div class="row discount" v-if="discount > 0"><span>Descuento</span><span>-{{ fmt.money(discount) }}</span></div>
          <div class="row bold"><span>Total línea</span><span>{{ fmt.money(gross - discount) }}</span></div>
        </div>
        <template #footer>
          <button class="btn btn-outline-danger" @click="emit('remove')"><icon name="trash-2" /> Quitar</button>
          <button class="btn ml-auto" @click="emit('close')">Cancelar</button>
          <button class="btn btn-primary" @click="save"><icon name="check" /> Aplicar</button>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  // Cobro
  // ---------------------------------------------------------------------------
  const Checkout = {
    props: { total: Number, itemsCount: Number, customer: Object },
    emits: ['confirm', 'close'],
    setup(props, { emit }) {
      const method = ref('efectivo');
      const received = ref(props.total);
      const reference = ref('');
      const mixed = ref([]);
      const printTicket = ref(store.settings.ticket_print_auto === '1');
      const saving = ref(false);
      const cashInput = ref(null);

      const suggestions = computed(() => {
        const t = props.total;
        const set = new Set([t]);
        for (const step of [20, 50, 100, 200, 500, 1000]) {
          const v = Math.ceil(t / step) * step;
          if (v > t) set.add(v);
        }
        return [...set].sort((a, b) => a - b).slice(0, 4);
      });

      const mixedPaid = computed(() => r2(mixed.value.reduce((s, p) => s + (Number(p.amount) || 0), 0)));
      const paid = computed(() => (method.value === 'mixto' ? mixedPaid.value : method.value === 'efectivo' ? r2(Number(received.value) || 0) : props.total));
      const change = computed(() => r2(paid.value - props.total));
      const mixedCash = computed(() => r2(mixed.value.filter((p) => p.method === 'efectivo').reduce((s, p) => s + (Number(p.amount) || 0), 0)));
      const valid = computed(() => {
        if (props.total <= 0) return true;
        if (change.value < -0.001) return false;
        if (method.value === 'mixto') return change.value <= mixedCash.value + 0.001;
        return true;
      });

      function setMethod(m) {
        method.value = m;
        if (m === 'mixto' && !mixed.value.length) {
          mixed.value = [{ method: 'tarjeta', amount: props.total, reference: '' }, { method: 'efectivo', amount: 0, reference: '' }];
        }
        if (m === 'efectivo') nextTick(() => cashInput.value && cashInput.value.select());
      }
      function addMixed() {
        const remaining = Math.max(0, r2(props.total - mixedPaid.value));
        mixed.value.push({ method: 'efectivo', amount: remaining, reference: '' });
      }

      function confirm() {
        if (!valid.value || saving.value) return;
        let payments;
        if (props.total <= 0) payments = [];
        else if (method.value === 'mixto') payments = mixed.value.filter((p) => Number(p.amount) > 0).map((p) => ({ ...p, amount: Number(p.amount) }));
        else if (method.value === 'efectivo') payments = [{ method: 'efectivo', amount: paid.value }];
        else payments = [{ method: method.value, amount: props.total, reference: reference.value }];
        saving.value = true;
        emit('confirm', { payments, print: printTicket.value, done: () => { saving.value = false; } });
      }

      function onKey(e) {
        if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); confirm(); }
        else if (e.key === 'F1') { e.preventDefault(); setMethod('efectivo'); }
        else if (e.key === 'F2') { e.preventDefault(); setMethod('tarjeta'); }
        else if (e.key === 'F3') { e.preventDefault(); setMethod('transferencia'); }
      }
      onMounted(() => {
        document.addEventListener('keydown', onKey);
        nextTick(() => cashInput.value && cashInput.value.select());
      });
      onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

      return { method, received, reference, mixed, printTicket, saving, cashInput, suggestions, paid, change, valid, mixedPaid, setMethod, addMixed, confirm, emit, fmt };
    },
    template: `
      <modal title="Cobrar venta" icon="circle-dollar-sign" size="lg" @close="emit('close')">
        <div class="grid" style="grid-template-columns: minmax(0,1fr) minmax(0,1.25fr); gap: 20px">
          <div class="flex-col gap-12">
            <div class="pay-total">
              <div class="label">Total a pagar</div>
              <div class="value">{{ fmt.money(total) }}</div>
              <div class="small" style="color:#bae6fd">{{ itemsCount }} artículo(s){{ customer ? ' · ' + customer.name : '' }}</div>
            </div>
            <div class="change-box" :class="change >= 0 ? 'ok' : 'missing'">
              <span>{{ change >= 0 ? 'Cambio' : 'Falta' }}</span>
              <span class="value">{{ fmt.money(Math.abs(change)) }}</span>
            </div>
            <label class="check"><input type="checkbox" v-model="printTicket" /> Imprimir ticket al terminar</label>
          </div>
          <div class="flex-col gap-12">
            <div class="pay-methods">
              <button class="pay-method" :class="{ active: method === 'efectivo' }" @click="setMethod('efectivo')"><icon name="banknote" :size="24" />Efectivo<span class="kbd">F1</span></button>
              <button class="pay-method" :class="{ active: method === 'tarjeta' }" @click="setMethod('tarjeta')"><icon name="credit-card" :size="24" />Tarjeta<span class="kbd">F2</span></button>
              <button class="pay-method" :class="{ active: method === 'transferencia' }" @click="setMethod('transferencia')"><icon name="landmark" :size="24" />Transfer.<span class="kbd">F3</span></button>
              <button class="pay-method" :class="{ active: method === 'mixto' }" @click="setMethod('mixto')"><icon name="layers" :size="24" />Mixto</button>
            </div>

            <template v-if="method === 'efectivo'">
              <div class="form-group">
                <label>Efectivo recibido</label>
                <money-input ref="cashInput" v-model="received" size="input-lg" @enter="confirm" />
              </div>
              <div class="quick-cash">
                <button v-for="s in suggestions" :key="s" class="btn" @click="received = s">{{ s === total ? 'Exacto' : fmt.money(s).replace(/\\.00$/, '') }}</button>
              </div>
            </template>

            <template v-else-if="method === 'mixto'">
              <div v-for="(p, i) in mixed" :key="i" class="payment-line">
                <select class="select input-sm" style="width: 140px" v-model="p.method">
                  <option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option><option value="otro">Otro</option>
                </select>
                <money-input v-model="p.amount" size="input-sm" class="flex-1" />
                <button class="btn btn-ghost btn-icon btn-sm" @click="mixed.splice(i, 1)" :disabled="mixed.length <= 1"><icon name="x" /></button>
              </div>
              <div class="flex between">
                <button class="btn btn-sm btn-light" @click="addMixed"><icon name="plus" /> Agregar pago</button>
                <span class="small muted">Pagado: <b>{{ fmt.money(mixedPaid) }}</b></span>
              </div>
            </template>

            <template v-else>
              <div class="alert alert-info"><icon name="info" />Cobra {{ fmt.money(total) }} en la terminal o verifica la transferencia antes de confirmar.</div>
              <div class="form-group">
                <label>Referencia (opcional)</label>
                <input class="input" v-model="reference" :placeholder="method === 'tarjeta' ? 'Últimos 4 dígitos o folio de autorización' : 'Folio o clave de rastreo'" />
              </div>
            </template>
          </div>
        </div>
        <template #footer>
          <button class="btn" @click="emit('close')">Regresar <span class="kbd">Esc</span></button>
          <button class="btn btn-success btn-lg" :disabled="!valid || saving" @click="confirm">
            <div v-if="saving" class="spinner" style="width:18px;height:18px"></div><icon v-else name="check" />
            Confirmar venta <span class="kbd">Enter</span>
          </button>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  // Vista principal del punto de venta
  // ---------------------------------------------------------------------------
  App.views.Pos = {
    components: { VariantPicker, LineEditor, Checkout },
    setup() {
      const catalog = ref([]);
      const loadingCatalog = ref(true);
      const query = ref('');
      const category = ref(null);
      const cart = ref([]);
      const selected = ref(-1);
      const customer = ref(null);
      const globalDiscount = reactive({ type: 'pct', value: 0 });
      const notes = ref('');
      const heldId = ref(null);
      const searchInput = ref(null);

      const picker = ref(null);
      const editing = ref(null);
      const showCheckout = ref(false);
      const showCustomer = ref(false);
      const showHeld = ref(false);
      const heldList = ref([]);
      const showOpenCash = ref(false);
      const openingAmount = ref('');
      const lastSale = ref(null);

      const settings = computed(() => store.settings);
      const allowNegative = computed(() => settings.value.allow_negative_stock === '1');
      const canPrice = computed(() => App.can('sales.cancel'));
      const maxDiscount = computed(() => (App.can('sales.cancel') ? 100 : Number(settings.value.max_cashier_discount || 100)));
      const cashOpen = computed(() => !!store.cash);

      // ---- Catálogo ----
      const index = computed(() => {
        const codes = new Map();
        const items = [];
        for (const p of catalog.value) {
          const text = norm([p.name, p.brand_name, ...p.variants.flatMap((v) => [v.sku, v.barcode, v.size, v.color])].filter(Boolean).join(' '));
          items.push({ p, text });
          for (const v of p.variants) {
            if (v.barcode) codes.set(String(v.barcode).toLowerCase(), { p, v });
            if (v.sku) codes.set(String(v.sku).toLowerCase(), { p, v });
          }
        }
        return { codes, items };
      });

      const categories = computed(() => {
        const counts = new Map();
        for (const p of catalog.value) counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
        return store.categories.filter((c) => counts.has(c.id)).map((c) => ({ ...c, count: counts.get(c.id) }));
      });

      const filtered = computed(() => {
        const words = norm(query.value.replace(/^\d+\s*\*\s*/, '')).split(/\s+/).filter(Boolean);
        return index.value.items
          .filter(({ p, text }) => (category.value === null || p.category_id === category.value) && words.every((w) => text.includes(w)))
          .map((x) => x.p);
      });
      const shown = computed(() => filtered.value.slice(0, 160));

      async function loadCatalog(quiet) {
        if (!quiet) loadingCatalog.value = true;
        try {
          catalog.value = await App.api.get('/pos/catalog');
        } catch (e) { App.error(e); } finally { loadingCatalog.value = false; }
      }

      const qtyInCart = computed(() => {
        const m = {};
        for (const l of cart.value) m[l.variant_id] = (m[l.variant_id] || 0) + l.quantity;
        return m;
      });

      function productStock(p) {
        return p.variants.reduce((s, v) => s + v.stock, 0) - p.variants.reduce((s, v) => s + (qtyInCart.value[v.id] || 0), 0);
      }
      function priceLabel(p) {
        const prices = p.variants.map((v) => v.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        return min === max ? fmt.money(min) : `${fmt.money(min)}+`;
      }

      // ---- Carrito ----
      function addVariant(p, v, qty = 1) {
        const existing = cart.value.findIndex((l) => l.variant_id === v.id);
        const already = existing >= 0 ? cart.value[existing].quantity : 0;
        if (!allowNegative.value && already + qty > v.stock) {
          App.toast(v.stock <= 0 ? `"${p.name}${fmt.variant(v) ? ' ' + fmt.variant(v) : ''}" está agotado.` : `Solo hay ${v.stock} disponible(s) de "${p.name}".`, 'error');
          return false;
        }
        if (existing >= 0) {
          cart.value[existing].quantity += qty;
          selected.value = existing;
        } else {
          cart.value.push({
            variant_id: v.id, product_id: p.id, category_id: p.category_id, name: p.name, variant_label: fmt.variant(v), sku: v.sku,
            price: v.price, unit_price: v.price, quantity: qty, stock: v.stock, discount_type: 'pct', discount_value: 0,
          });
          selected.value = cart.value.length - 1;
        }
        nextTick(() => {
          const el = document.querySelector('.cart-item.selected');
          if (el) el.scrollIntoView({ block: 'nearest' });
        });
        return true;
      }

      function clickProduct(p) {
        if (p.variants.length === 1) {
          if (addVariant(p, p.variants[0])) query.value = '';
          focusSearch();
        } else picker.value = p;
      }

      function pickVariant(v) {
        const p = picker.value;
        if (addVariant(p, v)) {
          picker.value = null;
          query.value = '';
          App.toast(`${p.name} ${fmt.variant(v)} agregado`, 'success', 1500);
          focusSearch();
        }
      }

      function onSearchEnter() {
        let term = query.value.trim();
        if (!term) {
          if (cart.value.length) openCheckout();
          return;
        }
        let qty = 1;
        const m = /^(\d+)\s*\*\s*(.+)$/.exec(term);
        if (m) { qty = Math.max(1, Number(m[1])); term = m[2].trim(); }
        const hit = index.value.codes.get(term.toLowerCase());
        if (hit) {
          if (addVariant(hit.p, hit.v, qty)) query.value = '';
          return;
        }
        if (filtered.value.length === 1) {
          const p = filtered.value[0];
          if (p.variants.length === 1) { if (addVariant(p, p.variants[0], qty)) query.value = ''; }
          else { picker.value = p; query.value = ''; }
          return;
        }
        if (!filtered.value.length) App.toast(`No se encontró "${term}"`, 'warning');
      }

      const lineCalc = (l) => {
        const g = r2(l.unit_price * l.quantity);
        let d = 0;
        const v = Number(l.discount_value) || 0;
        if (v > 0) d = l.discount_type === 'pct' ? r2(g * Math.min(100, v) / 100) : Math.min(g, r2(v));
        return { gross: g, discount: d, total: r2(g - d) };
      };

      const totals = computed(() => {
        let gross = 0;
        let lineDiscount = 0;
        let units = 0;
        for (const l of cart.value) {
          const c = lineCalc(l);
          gross += c.gross;
          lineDiscount += c.discount;
          units += l.quantity;
        }
        gross = r2(gross);
        lineDiscount = r2(lineDiscount);
        const after = r2(gross - lineDiscount);
        const gv = Number(globalDiscount.value) || 0;
        const global = gv > 0 ? (globalDiscount.type === 'pct' ? r2(after * Math.min(100, gv) / 100) : Math.min(after, r2(gv))) : 0;
        const rate = (Number(settings.value.tax_rate) || 0) / 100;
        const base = r2(after - global);
        let subtotal; let tax; let total;
        if (settings.value.tax_included === '1') { total = base; subtotal = r2(total / (1 + rate)); tax = r2(total - subtotal); }
        else { subtotal = base; tax = r2(base * rate); total = r2(base + tax); }
        return { gross, lineDiscount, global, discount: r2(lineDiscount + global), subtotal, tax, total, units };
      });

      function changeQty(i, delta) {
        const l = cart.value[i];
        if (!l) return;
        const q = l.quantity + delta;
        if (q <= 0) return removeLine(i);
        if (delta > 0 && !allowNegative.value && q > l.stock) return App.toast(`Solo hay ${l.stock} disponible(s).`, 'error');
        l.quantity = q;
      }
      function setQty(i, value) {
        const l = cart.value[i];
        const q = Math.trunc(Number(value));
        if (!q || q < 1) { l.quantity = 1; return; }
        if (!allowNegative.value && q > l.stock) { App.toast(`Solo hay ${l.stock} disponible(s).`, 'error'); l.quantity = Math.max(1, l.stock); return; }
        l.quantity = q;
      }
      function removeLine(i) {
        cart.value.splice(i, 1);
        if (selected.value >= cart.value.length) selected.value = cart.value.length - 1;
      }
      function saveLine(data) {
        const i = cart.value.indexOf(editing.value);
        if (i < 0) return;
        if (!allowNegative.value && data.quantity > editing.value.stock) return App.toast(`Solo hay ${editing.value.stock} disponible(s).`, 'error');
        if (data.discount_value > 0) {
          const c = lineCalc({ ...editing.value, ...data });
          if (c.gross > 0 && (c.discount / c.gross) * 100 > maxDiscount.value + 0.01) return App.toast(`El descuento máximo permitido es ${maxDiscount.value}%.`, 'error');
        }
        Object.assign(cart.value[i], data);
        editing.value = null;
        focusSearch();
      }

      async function clearCart(ask = true) {
        if (ask && cart.value.length && !(await App.confirm({ title: 'Vaciar carrito', message: '¿Quitar todos los productos de la venta actual?', confirmText: 'Vaciar', danger: true }))) return;
        cart.value = [];
        customer.value = null;
        globalDiscount.value = 0;
        globalDiscount.type = 'pct';
        notes.value = '';
        heldId.value = null;
        selected.value = -1;
        focusSearch();
      }

      async function askGlobalDiscount() {
        if (!cart.value.length) return;
        const v = await App.prompt({
          title: 'Descuento a toda la venta',
          message: `Escribe el porcentaje (ej. 10) o un monto fijo con $ (ej. $100).${maxDiscount.value < 100 ? `\nMáximo permitido: ${maxDiscount.value}%.` : ''}`,
          label: 'Descuento',
          value: globalDiscount.value ? (globalDiscount.type === 'pct' ? String(globalDiscount.value) : '$' + globalDiscount.value) : '',
          placeholder: '10  ó  $100',
          required: false,
          confirmText: 'Aplicar',
        });
        if (v === null) return focusSearch();
        const s = String(v).trim();
        if (!s) { globalDiscount.value = 0; return focusSearch(); }
        const isAmount = s.startsWith('$');
        const n = Number(s.replace(/[$%\s,]/g, ''));
        if (!Number.isFinite(n) || n < 0) return App.toast('Descuento no válido', 'error');
        const after = r2(totals.value.gross - totals.value.lineDiscount);
        const pct = isAmount ? (after ? (n / after) * 100 : 0) : n;
        const totalPct = totals.value.gross ? ((totals.value.lineDiscount + (after * pct) / 100) / totals.value.gross) * 100 : 0;
        if (totalPct > maxDiscount.value + 0.01) return App.toast(`El descuento máximo permitido es ${maxDiscount.value}%.`, 'error');
        globalDiscount.type = isAmount ? 'amount' : 'pct';
        globalDiscount.value = n;
        focusSearch();
      }

      async function askNotes() {
        const v = await App.prompt({ title: 'Nota de la venta', label: 'Aparece en el ticket', type: 'textarea', value: notes.value, required: false, confirmText: 'Guardar' });
        if (v !== null) notes.value = v.trim();
        focusSearch();
      }

      /** Actualiza existencia y precio de una línea guardada con los datos actuales del catálogo. */
      function refreshLine(l, v) {
        return { ...l, stock: v.stock, price: v.price, unit_price: l.unit_price === l.price ? v.price : l.unit_price };
      }

      // ---- Ventas en espera ----
      async function holdSale() {
        if (!cart.value.length) return App.toast('No hay productos en la venta', 'warning');
        const label = await App.prompt({
          title: 'Poner venta en espera', label: 'Nombre o referencia (opcional)', value: customer.value ? customer.value.name : '',
          placeholder: 'Ej. Señora de gorra azul', required: false, confirmText: 'Guardar en espera',
        });
        if (label === null) return focusSearch();
        try {
          await App.api.post('/held-sales', {
            label: label || null,
            data: { items: cart.value, customer: customer.value, globalDiscount: { ...globalDiscount }, notes: notes.value, total: totals.value.total },
          });
          if (heldId.value) await App.api.del('/held-sales/' + heldId.value).catch(() => {});
          App.toast('Venta guardada en espera');
          clearCart(false);
        } catch (e) { App.error(e); }
      }
      async function openHeld() {
        try {
          heldList.value = await App.api.get('/held-sales');
          if (!heldList.value.length) return App.toast('No hay ventas en espera', 'warning');
          showHeld.value = true;
        } catch (e) { App.error(e); }
      }
      async function resumeHeld(h) {
        if (cart.value.length && !(await App.confirm({ title: 'Recuperar venta', message: 'La venta actual se reemplazará. ¿Continuar?', confirmText: 'Recuperar' }))) return;
        const byId = new Map();
        for (const p of catalog.value) for (const v of p.variants) byId.set(v.id, v);
        cart.value = h.data.items.filter((l) => byId.has(l.variant_id)).map((l) => refreshLine(l, byId.get(l.variant_id)));
        if (cart.value.length < h.data.items.length) App.toast('Algunos productos ya no están disponibles y se omitieron.', 'warning');
        customer.value = h.data.customer || null;
        Object.assign(globalDiscount, h.data.globalDiscount || { type: 'pct', value: 0 });
        notes.value = h.data.notes || '';
        heldId.value = h.id;
        showHeld.value = false;
        selected.value = cart.value.length - 1;
      }
      async function deleteHeld(h) {
        if (!(await App.confirm({ title: 'Eliminar venta en espera', message: `¿Eliminar "${h.label || 'Venta #' + h.id}"?`, confirmText: 'Eliminar', danger: true }))) return;
        await App.api.del('/held-sales/' + h.id);
        heldList.value = heldList.value.filter((x) => x.id !== h.id);
        if (!heldList.value.length) showHeld.value = false;
      }

      // ---- Caja ----
      async function openCash() {
        try {
          store.cash = await App.api.post('/cash/open', { opening_amount: Number(openingAmount.value) || 0 });
          showOpenCash.value = false;
          App.toast('Caja abierta. ¡Buenas ventas!');
          focusSearch();
        } catch (e) { App.error(e); }
      }

      // ---- Cobro ----
      function openCheckout() {
        if (!cart.value.length) return App.toast('Agrega productos para cobrar', 'warning');
        if (!cashOpen.value) { showOpenCash.value = true; return; }
        showCheckout.value = true;
      }

      async function confirmSale({ payments, print, done }) {
        const items = cart.value.map((l) => {
          const it = { variant_id: l.variant_id, quantity: l.quantity };
          if (l.unit_price !== l.price) it.unit_price = l.unit_price;
          if (Number(l.discount_value) > 0) {
            if (l.discount_type === 'pct') it.discount_pct = Number(l.discount_value);
            else it.discount_amount = Number(l.discount_value);
          }
          return it;
        });
        try {
          const sale = await App.api.post('/sales', {
            items,
            customer_id: customer.value ? customer.value.id : null,
            global_discount: Number(globalDiscount.value) > 0 ? { ...globalDiscount } : null,
            payments,
            notes: notes.value || null,
            held_id: heldId.value,
          });
          showCheckout.value = false;
          lastSale.value = sale;
          // Descontar stock localmente y refrescar el catálogo en segundo plano.
          for (const it of sale.items) {
            for (const p of catalog.value) {
              const v = p.variants.find((x) => x.id === it.variant_id);
              if (v) v.stock -= it.quantity;
            }
          }
          clearCart(false);
          nextTick(() => { const b = document.querySelector('[data-autofocus]'); if (b) b.focus(); });
          if (print) App.printTicket(sale);
          loadCatalog(true);
          App.refreshCash();
        } catch (e) {
          App.error(e);
        } finally {
          done();
        }
      }

      function newSale() {
        lastSale.value = null;
        focusSearch();
      }

      // ---- Teclado ----
      function focusSearch() {
        nextTick(() => searchInput.value && searchInput.value.focus());
      }
      const anyModal = () => picker.value || editing.value || showCheckout.value || showCustomer.value || showHeld.value || showOpenCash.value || lastSale.value || store.dialog;

      function onKey(e) {
        if (lastSale.value && !store.dialog && (e.key === 'Enter' || e.key === 'Escape')) {
          e.preventDefault();
          newSale();
          return;
        }
        if (anyModal()) return;
        const inSearch = document.activeElement === searchInput.value;
        const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName) && !inSearch;
        const keys = {
          F2: () => focusSearch(), F4: () => { showCustomer.value = true; }, F7: openHeld, F8: holdSale, F9: askGlobalDiscount, F10: openCheckout, F12: openCheckout,
        };
        if (keys[e.key]) { e.preventDefault(); keys[e.key](); return; }
        if (typing) return;
        const emptySearch = !query.value;
        if ((inSearch && emptySearch) || !inSearch) {
          if (e.key === 'ArrowDown' && cart.value.length) { e.preventDefault(); selected.value = Math.min(cart.value.length - 1, selected.value + 1); }
          else if (e.key === 'ArrowUp' && cart.value.length) { e.preventDefault(); selected.value = Math.max(0, selected.value - 1); }
          else if ((e.key === '+' || e.key === 'Add') && selected.value >= 0) { e.preventDefault(); changeQty(selected.value, 1); }
          else if ((e.key === '-' || e.key === 'Subtract') && selected.value >= 0) { e.preventDefault(); changeQty(selected.value, -1); }
          else if (e.key === 'Delete' && selected.value >= 0) { e.preventDefault(); removeLine(selected.value); }
          else if (e.key === '*' && selected.value >= 0) { e.preventDefault(); editing.value = cart.value[selected.value]; }
        }
        if (e.key === 'Escape' && inSearch) query.value = '';
        else if (!inSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !['+', '-', '*'].includes(e.key)) {
          // Cualquier tecla (p. ej. el lector de código de barras) escribe en el buscador.
          focusSearch();
        }
      }

      // ---- Persistencia del carrito ante recargas accidentales ----
      watch([cart, customer, () => ({ ...globalDiscount }), notes, heldId], () => {
        try {
          if (cart.value.length) localStorage.setItem(CART_KEY, JSON.stringify({ cart: cart.value, customer: customer.value, globalDiscount: { ...globalDiscount }, notes: notes.value, heldId: heldId.value }));
          else localStorage.removeItem(CART_KEY);
        } catch (e) { /* sin almacenamiento */ }
      }, { deep: true });

      function restoreCart() {
        try {
          const saved = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
          if (!saved || !saved.cart || !saved.cart.length) return;
          const byId = new Map();
          for (const p of catalog.value) for (const v of p.variants) byId.set(v.id, v);
          cart.value = saved.cart.filter((l) => byId.has(l.variant_id)).map((l) => refreshLine(l, byId.get(l.variant_id)));
          customer.value = saved.customer || null;
          Object.assign(globalDiscount, saved.globalDiscount || {});
          notes.value = saved.notes || '';
          heldId.value = saved.heldId || null;
          if (cart.value.length) App.toast('Se recuperó la venta que estaba en curso', 'success');
        } catch (e) { /* ignorar */ }
      }

      onMounted(async () => {
        document.addEventListener('keydown', onKey);
        await loadCatalog();
        restoreCart();
        if (!store.cashLoaded) await App.refreshCash();
        if (!store.cash) showOpenCash.value = true;
        focusSearch();
      });
      onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

      return {
        store, fmt, catalog, loadingCatalog, query, category, categories, filtered, shown, cart, selected, customer, globalDiscount, notes,
        heldId, searchInput, picker, editing, showCheckout, showCustomer, showHeld, heldList, showOpenCash, openingAmount, lastSale,
        allowNegative, canPrice, maxDiscount, cashOpen, totals, qtyInCart,
        productStock, priceLabel, clickProduct, pickVariant, onSearchEnter, lineCalc, changeQty, setQty, removeLine, saveLine, clearCart,
        askGlobalDiscount, askNotes, holdSale, openHeld, resumeHeld, deleteHeld, openCash, openCheckout, confirmSale, newSale, focusSearch,
        loadCatalog, image: App.productImage, colorFor: App.colorFor,
      };
    },
    template: `
      <div class="pos">
        <section class="pos-catalog">
          <div class="pos-search">
            <div class="input-group lg">
              <icon name="scan-barcode" :size="22" />
              <input ref="searchInput" class="input input-lg" v-model="query" @keydown.enter.prevent="onSearchEnter"
                placeholder="Escanea o escribe nombre, SKU, talla o color…  (ej. 3*CODIGO agrega 3)" autocomplete="off" />
              <div class="addon flex gap-4">
                <button v-if="query" class="btn btn-ghost btn-icon btn-sm" @click="query = ''; focusSearch()" title="Limpiar"><icon name="x" /></button>
                <span class="kbd desktop-only">F2</span>
              </div>
            </div>
          </div>
          <div class="pos-cats">
            <button class="chip" :class="{ active: category === null }" @click="category = null">Todos <span class="muted" v-if="category !== null">{{ catalog.length }}</span></button>
            <button v-for="c in categories" :key="c.id" class="chip" :class="{ active: category === c.id }" @click="category = category === c.id ? null : c.id">
              <span class="dot" :style="{ background: category === c.id ? '#fff' : c.color }"></span>{{ c.name }}
            </button>
          </div>
          <loading v-if="loadingCatalog" text="Cargando productos…" />
          <empty v-else-if="!catalog.length" icon="package" title="Aún no hay productos" text="Registra productos en el módulo de Productos para empezar a vender.">
            <a v-if="App.can('products.edit')" href="#/productos/nuevo" class="btn btn-primary"><icon name="plus" /> Agregar producto</a>
          </empty>
          <empty v-else-if="!filtered.length" icon="search" title="Sin resultados" :text="'No hay productos que coincidan con “' + query + '”.'" />
          <div v-else class="pos-grid">
            <button v-for="p in shown" :key="p.id" class="pos-card" :class="{ out: productStock(p) <= 0 }" @click="clickProduct(p)">
              <div class="pc-img" :style="image(p) ? 'background:#f1f5f9' : 'background:linear-gradient(135deg,' + colorFor(p.category_id) + ',' + colorFor(p.category_id) + 'cc)'">
                <img v-if="image(p)" :src="image(p)" loading="lazy" alt="" />
                <template v-else>{{ fmt.initials(p.name) }}</template>
                <span class="pc-variants" v-if="p.variants.length > 1">{{ p.variants.length }} opciones</span>
              </div>
              <div class="pc-body">
                <div class="pc-brand">{{ p.brand_name || '\u00a0' }}</div>
                <div class="pc-name">{{ p.name }}</div>
                <div class="pc-foot">
                  <span class="pc-price">{{ priceLabel(p) }}</span>
                  <span class="pc-stock" :class="productStock(p) <= 0 ? 'out' : productStock(p) <= 3 ? 'low' : ''">{{ productStock(p) <= 0 ? 'Agotado' : productStock(p) + ' pzas' }}</span>
                </div>
              </div>
            </button>
            <div v-if="filtered.length > shown.length" class="muted small center" style="grid-column: 1/-1">
              Mostrando {{ shown.length }} de {{ filtered.length }}. Escribe para filtrar más.
            </div>
          </div>
        </section>

        <aside class="pos-cart">
          <div class="pos-cart-head">
            <div class="customer-pick" :class="{ set: customer }" @click="showCustomer = true" title="Cliente (F4)">
              <icon :name="customer ? 'user' : 'user-plus'" :size="17" />
              <span class="flex-1 ellipsis" :class="{ bold: customer }">{{ customer ? customer.name : 'Público en general' }}</span>
              <button v-if="customer" class="btn btn-ghost btn-icon btn-xs" @click.stop="customer = null" title="Quitar cliente"><icon name="x" :size="14" /></button>
              <span v-else class="kbd">F4</span>
            </div>
            <button class="btn btn-icon" title="Ventas en espera (F7)" @click="openHeld"><icon name="history" /></button>
          </div>
          <div v-if="!cashOpen && store.cashLoaded" class="alert alert-warning" style="margin: 10px 14px 0">
            <icon name="wallet" /><div class="flex-1">La caja está cerrada.</div>
            <button class="btn btn-sm" @click="showOpenCash = true">Abrir caja</button>
          </div>
          <div v-if="heldId" class="alert alert-info" style="margin: 10px 14px 0; padding: 8px 12px"><icon name="history" :size="16" />Venta recuperada de espera</div>

          <div class="cart-items">
            <div v-if="!cart.length" class="cart-empty">
              <icon name="shopping-bag" :size="56" :stroke="1.3" />
              <h3 style="color: var(--text-2)">Venta nueva</h3>
              <p class="small">Escanea un código de barras o toca un producto para agregarlo.</p>
              <div class="small mt-12 desktop-only" style="line-height: 2">
                <span class="kbd">F2</span> Buscar &nbsp; <span class="kbd">F4</span> Cliente &nbsp; <span class="kbd">F9</span> Descuento<br>
                <span class="kbd">F8</span> En espera &nbsp; <span class="kbd">F7</span> Recuperar &nbsp; <span class="kbd">F12</span> Cobrar<br>
                <span class="kbd">+</span> <span class="kbd">−</span> Cantidad &nbsp; <span class="kbd">Supr</span> Quitar &nbsp; <span class="kbd">*</span> Editar
              </div>
            </div>
            <div v-for="(l, i) in cart" :key="l.variant_id" class="cart-item" :class="{ selected: i === selected }" @click="selected = i">
              <div style="min-width:0">
                <div class="ci-name">{{ l.name }}</div>
                <div class="ci-variant">{{ l.variant_label || l.sku }}</div>
              </div>
              <div>
                <div class="ci-total">{{ fmt.money(lineCalc(l).total) }}</div>
                <div class="ci-unit" v-if="lineCalc(l).discount > 0"><s>{{ fmt.money(lineCalc(l).gross) }}</s></div>
              </div>
              <div class="ci-controls">
                <div class="qty" @click.stop>
                  <button @click="changeQty(i, -1)" title="Menos"><icon name="minus" :size="15" /></button>
                  <input type="number" min="1" :value="l.quantity" @change="setQty(i, $event.target.value)" @focus="$event.target.select()" />
                  <button @click="changeQty(i, 1)" title="Más"><icon name="plus" :size="15" /></button>
                </div>
                <span class="small muted">× {{ fmt.money(l.unit_price) }}</span>
                <span v-if="l.unit_price !== l.price" class="badge badge-purple" title="Precio modificado">Precio esp.</span>
                <span v-if="Number(l.discount_value) > 0" class="badge badge-success">-{{ l.discount_type === 'pct' ? l.discount_value + '%' : fmt.money(l.discount_value) }}</span>
                <div class="ml-auto flex gap-4">
                  <button class="btn btn-ghost btn-icon btn-xs" title="Editar (precio, descuento)" @click.stop="editing = l"><icon name="pencil" :size="14" /></button>
                  <button class="btn btn-ghost btn-icon btn-xs" title="Quitar" @click.stop="removeLine(i)"><icon name="trash-2" :size="14" /></button>
                </div>
              </div>
            </div>
          </div>

          <div class="cart-totals">
            <div class="row"><span>{{ totals.units }} artículo(s)</span><span>{{ fmt.money(totals.gross) }}</span></div>
            <div class="row discount" v-if="totals.lineDiscount > 0"><span>Descuentos por producto</span><span>-{{ fmt.money(totals.lineDiscount) }}</span></div>
            <div class="row discount" v-if="totals.global > 0">
              <span>Descuento general {{ globalDiscount.type === 'pct' ? '(' + globalDiscount.value + '%)' : '' }}
                <a href="#" @click.prevent="globalDiscount.value = 0" title="Quitar descuento">quitar</a></span>
              <span>-{{ fmt.money(totals.global) }}</span>
            </div>
            <div class="row small muted"><span>Subtotal {{ store.settings.tax_included === '1' ? 'sin IVA' : '' }}</span><span>{{ fmt.money(totals.subtotal) }}</span></div>
            <div class="row small muted"><span>IVA {{ store.settings.tax_rate }}%</span><span>{{ fmt.money(totals.tax) }}</span></div>
            <div class="row total"><span>Total</span><span>{{ fmt.money(totals.total) }}</span></div>
            <div v-if="notes" class="small muted mt-4 ellipsis" :title="notes"><icon name="file-text" :size="13" /> {{ notes }}</div>
          </div>
          <div class="cart-actions">
            <button class="btn" @click="askGlobalDiscount" :disabled="!cart.length" title="Descuento a toda la venta (F9)"><icon name="badge-percent" :size="17" />Descuento</button>
            <button class="btn" @click="askNotes" :disabled="!cart.length" title="Agregar nota"><icon name="file-text" :size="17" />Nota</button>
            <button class="btn" @click="holdSale" :disabled="!cart.length" title="Poner en espera (F8)"><icon name="circle-pause" :size="17" />En espera</button>
            <button class="btn" @click="clearCart()" :disabled="!cart.length" title="Vaciar carrito"><icon name="trash-2" :size="17" />Vaciar</button>
          </div>
          <div class="cart-pay">
            <button class="btn btn-success btn-xl" :disabled="!cart.length" @click="openCheckout">
              <span class="flex"><icon name="circle-dollar-sign" :size="24" /> Cobrar</span>
              <span class="flex">{{ fmt.money(totals.total) }} <span class="kbd">F12</span></span>
            </button>
          </div>
        </aside>

        <variant-picker v-if="picker" :product="picker" :allow-negative="allowNegative" :in-cart="qtyInCart" @pick="pickVariant" @close="picker = null; focusSearch()" />
        <line-editor v-if="editing" :line="editing" :can-price="canPrice" :max-discount="maxDiscount" @save="saveLine" @remove="removeLine(cart.indexOf(editing)); editing = null; focusSearch()" @close="editing = null; focusSearch()" />
        <checkout v-if="showCheckout" :total="totals.total" :items-count="totals.units" :customer="customer" @confirm="confirmSale" @close="showCheckout = false; focusSearch()" />
        <customer-picker v-if="showCustomer" @select="customer = $event; showCustomer = false; focusSearch()" @close="showCustomer = false; focusSearch()" />

        <modal v-if="showHeld" title="Ventas en espera" icon="history" @close="showHeld = false; focusSearch()">
          <div class="card">
            <div v-for="h in heldList" :key="h.id" class="list-item" @click="resumeHeld(h)">
              <div class="avatar" style="background:#f59e0b"><icon name="circle-pause" :size="16" /></div>
              <div class="flex-1">
                <div class="bold">{{ h.label || ('Venta en espera #' + h.id) }}</div>
                <div class="tiny muted">{{ h.data.items.length }} producto(s) · {{ h.user_name }} · {{ fmt.relative(h.created_at) }}</div>
              </div>
              <div class="bold">{{ fmt.money(h.data.total) }}</div>
              <button class="btn btn-ghost btn-icon btn-sm" @click.stop="deleteHeld(h)" title="Eliminar"><icon name="trash-2" /></button>
            </div>
          </div>
        </modal>

        <modal v-if="showOpenCash" title="Abrir caja" icon="wallet" size="sm" @close="showOpenCash = false; focusSearch()">
          <p>Para comenzar a vender, captura el efectivo inicial (fondo) con el que abres la caja.</p>
          <div class="form-group mt-12">
            <label>Fondo inicial</label>
            <money-input v-model="openingAmount" size="input-lg" @enter="openCash" />
          </div>
          <template #footer>
            <button class="btn" @click="showOpenCash = false">Ahora no</button>
            <button class="btn btn-primary" @click="openCash"><icon name="wallet" /> Abrir caja</button>
          </template>
        </modal>

        <modal v-if="lastSale" title="Venta registrada" icon="circle-check" size="sm" @close="newSale">
          <div class="sale-done">
            <div class="check-circle"><icon name="check" :size="40" :stroke="2.5" /></div>
            <div class="muted">Ticket {{ lastSale.folio }} · Total {{ fmt.money(lastSale.total) }}</div>
            <template v-if="lastSale.change_amount > 0">
              <div class="mt-12 bold">Cambio a entregar</div>
              <div class="change">{{ fmt.money(lastSale.change_amount) }}</div>
            </template>
            <div v-else class="mt-12 bold text-success" style="font-size: 18px">¡Pago completo!</div>
          </div>
          <template #footer>
            <button class="btn" @click="App.printTicket(lastSale)"><icon name="printer" /> Imprimir ticket</button>
            <button class="btn btn-primary" data-autofocus @click="newSale"><icon name="shopping-cart" /> Nueva venta <span class="kbd">Enter</span></button>
          </template>
        </modal>
      </div>`,
  };
})();
