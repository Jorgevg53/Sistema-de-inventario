/* Compras / entradas de mercancía: historial y captura de nuevas entradas. */
(function () {
  'use strict';
  const { ref, reactive, computed, watch, onMounted } = Vue;
  const fmt = App.fmt;
  const store = App.store;

  App.views.Purchases = {
    setup() {
      const ranges = App.ranges();
      const month = ranges.find((r) => r.key === 'month');
      const f = reactive({ from: month.from, to: month.to, supplier_id: '', status: '', q: '', page: 1 });
      const data = ref(null);
      const suppliers = ref([]);
      const loading = ref(false);
      const detail = ref(null);
      async function load() {
        loading.value = true;
        try { data.value = await App.api.get('/purchases', { ...f, limit: 50 }); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      const reload = () => { if (f.page !== 1) f.page = 1; else load(); };
      watch(() => f.q, App.debounce(reload, 300));
      watch(() => f.page, load);
      onMounted(async () => {
        load();
        try { suppliers.value = await App.api.get('/suppliers', { active: 'all' }); } catch (e) { /* ignorar */ }
      });
      async function open(p) {
        try { detail.value = await App.api.get('/purchases/' + p.id); } catch (e) { App.error(e); }
      }
      async function cancel() {
        const reason = await App.prompt({
          title: 'Cancelar compra ' + detail.value.folio,
          message: 'Las piezas recibidas se descontarán del inventario.',
          label: 'Motivo', confirmText: 'Cancelar compra', danger: true,
        });
        if (!reason) return;
        try {
          await App.api.post(`/purchases/${detail.value.id}/cancel`, { reason });
          App.toast('Compra cancelada');
          detail.value = null;
          load();
        } catch (e) { App.error(e); }
      }
      return { f, data, suppliers, loading, detail, load, reload, open, cancel, fmt };
    },
    template: `
      <div>
        <div class="stats mb-16" v-if="data">
          <stat-card icon="truck" label="Entradas en el periodo" :value="fmt.num(data.total)" />
          <stat-card icon="coins" color="purple" label="Total comprado" :value="fmt.money(data.amount)" />
        </div>
        <div class="card">
          <div class="toolbar">
            <div class="input-group search"><icon name="search" /><input class="input" v-model="f.q" placeholder="Folio, factura o proveedor…" /></div>
            <date-range v-model:from="f.from" v-model:to="f.to" allow-empty @change="reload" />
            <select class="select" style="width:190px" v-model="f.supplier_id" @change="reload"><option value="">Todos los proveedores</option><option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option></select>
            <select class="select" style="width:140px" v-model="f.status" @change="reload"><option value="">Todo estado</option><option value="recibida">Recibidas</option><option value="cancelada">Canceladas</option></select>
            <a href="#/compras/nueva" class="btn btn-primary ml-auto"><icon name="package-plus" /> Nueva entrada</a>
          </div>
          <loading v-if="loading && !data" />
          <div v-else-if="data" class="table-wrap">
            <table class="table">
              <thead><tr><th>Folio</th><th>Fecha</th><th>Proveedor</th><th>Factura / remisión</th><th class="num">Piezas</th><th class="num">Total</th><th>Registró</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="p in data.rows" :key="p.id" class="clickable" :class="{ 'muted-row': p.status === 'cancelada' }" @click="open(p)">
                  <td class="mono bold">{{ p.folio }}</td>
                  <td class="nowrap">{{ fmt.datetime(p.created_at) }}</td>
                  <td>{{ p.supplier_name || '—' }}</td>
                  <td>{{ p.invoice || '—' }}</td>
                  <td class="num">{{ p.items_count }}</td>
                  <td class="num bold">{{ fmt.money(p.total) }}</td>
                  <td>{{ p.user_name }}</td>
                  <td><span class="badge" :class="p.status === 'cancelada' ? 'badge-danger' : 'badge-success'">{{ p.status === 'cancelada' ? 'Cancelada' : 'Recibida' }}</span></td>
                </tr>
              </tbody>
            </table>
            <empty v-if="!data.rows.length" icon="truck" title="Sin entradas de mercancía" text="Registra aquí la mercancía que recibes de tus proveedores para actualizar existencias y costos.">
              <a href="#/compras/nueva" class="btn btn-primary"><icon name="package-plus" /> Nueva entrada</a>
            </empty>
          </div>
          <pagination v-if="data" v-model:page="f.page" :total="data.total" :limit="data.limit" />
        </div>

        <modal v-if="detail" :title="'Entrada ' + detail.folio" icon="truck" size="lg" @close="detail = null">
          <div class="grid grid-4 mb-16" style="gap:12px">
            <div><div class="muted small">Fecha</div><div class="bold">{{ fmt.datetime(detail.created_at) }}</div></div>
            <div><div class="muted small">Proveedor</div><div class="bold">{{ detail.supplier_name || '—' }}</div></div>
            <div><div class="muted small">Factura</div><div class="bold">{{ detail.invoice || '—' }}</div></div>
            <div><div class="muted small">Registró</div><div class="bold">{{ detail.user_name }}</div></div>
          </div>
          <div v-if="detail.status === 'cancelada'" class="alert alert-danger mb-16"><icon name="ban" />Compra cancelada el {{ fmt.datetime(detail.cancelled_at) }}</div>
          <div class="card table-wrap">
            <table class="table table-sm">
              <thead><tr><th>Producto</th><th>SKU</th><th class="num">Cantidad</th><th class="num">Costo unit.</th><th class="num">Importe</th></tr></thead>
              <tbody><tr v-for="i in detail.items" :key="i.id"><td class="bold">{{ i.name }}</td><td class="mono">{{ i.sku }}</td><td class="num">{{ i.quantity }}</td><td class="num">{{ fmt.money(i.unit_cost) }}</td><td class="num bold">{{ fmt.money(i.total) }}</td></tr></tbody>
              <tfoot><tr><td colspan="2">Total</td><td class="num">{{ detail.items_count }}</td><td></td><td class="num">{{ fmt.money(detail.total) }}</td></tr></tfoot>
            </table>
          </div>
          <div v-if="detail.notes" class="alert alert-info mt-12"><icon name="file-text" />{{ detail.notes }}</div>
          <template #footer>
            <button v-if="detail.status === 'recibida'" class="btn btn-outline-danger" @click="cancel"><icon name="ban" /> Cancelar compra</button>
            <a :href="'#/etiquetas?purchase_id=' + detail.id" class="btn btn-primary ml-auto"><icon name="tag" /> Imprimir etiquetas</a>
          </template>
        </modal>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  App.views.PurchaseForm = {
    setup() {
      const suppliers = ref([]);
      const form = reactive({ supplier_id: '', invoice: '', notes: '' });
      const items = ref([]);
      const updateCost = ref(true);
      const saving = ref(false);
      onMounted(async () => {
        try { suppliers.value = await App.api.get('/suppliers'); } catch (e) { App.error(e); }
      });
      function add(v) {
        const ex = items.value.find((i) => i.variant_id === v.id);
        if (ex) { ex.quantity = (Number(ex.quantity) || 0) + 1; return; }
        items.value.push({ variant_id: v.id, name: v.name, variant: fmt.variant(v), sku: v.sku, stock: v.stock, price: v.price, unit_cost: v.cost, quantity: 1, new_price: '' });
      }
      const units = computed(() => items.value.reduce((s, i) => s + (Number(i.quantity) || 0), 0));
      const total = computed(() => App.round2(items.value.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0)));
      async function addSupplier() {
        const name = await App.prompt({ title: 'Nuevo proveedor', label: 'Nombre del proveedor', confirmText: 'Crear' });
        if (!name) return;
        try {
          const s = await App.api.post('/suppliers', { name });
          suppliers.value.push(s);
          form.supplier_id = s.id;
        } catch (e) { App.error(e); }
      }
      async function save() {
        if (!items.value.length) return App.toast('Agrega productos a la entrada', 'warning');
        if (items.value.some((i) => !(Number(i.quantity) > 0))) return App.toast('Revisa las cantidades', 'error');
        saving.value = true;
        try {
          const p = await App.api.post('/purchases', {
            ...form, supplier_id: form.supplier_id || null, update_cost: updateCost.value,
            items: items.value.map((i) => ({ variant_id: i.variant_id, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) || 0, new_price: i.new_price === '' ? undefined : Number(i.new_price) })),
          });
          App.toast(`Entrada ${p.folio} registrada. Existencias actualizadas.`);
          if (await App.confirm({ title: 'Entrada registrada', message: '¿Deseas imprimir etiquetas con código de barras para la mercancía recibida?', confirmText: 'Imprimir etiquetas', cancelText: 'No, gracias', icon: 'tag' })) {
            App.go('/etiquetas?purchase_id=' + p.id);
          } else App.go('/compras');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      return { suppliers, form, items, updateCost, saving, add, units, total, addSupplier, save, fmt };
    },
    template: `
      <div>
        <div class="page-head">
          <a href="#/compras" class="btn btn-ghost btn-sm"><icon name="arrow-left" /> Compras</a>
          <h1>Nueva entrada de mercancía</h1>
        </div>
        <div class="card mb-16">
          <div class="card-body grid grid-3">
            <div class="form-group"><label>Proveedor</label>
              <div class="flex"><select class="select flex-1" v-model="form.supplier_id"><option value="">Sin proveedor</option><option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option></select>
                <button class="btn btn-icon" title="Nuevo proveedor" @click="addSupplier"><icon name="plus" /></button></div>
            </div>
            <div class="form-group"><label>Factura / remisión</label><input class="input" v-model="form.invoice" placeholder="Ej. F-12345" /></div>
            <div class="form-group"><label>Notas</label><input class="input" v-model="form.notes" placeholder="Opcional" /></div>
          </div>
        </div>
        <div class="card">
          <div class="card-body" style="border-bottom:1px solid var(--border)">
            <div class="flex flex-wrap">
              <div class="flex-1" style="min-width:280px"><product-search autofocus include-inactive @select="add" placeholder="Escanea o busca los productos recibidos…" /></div>
              <a href="#/productos/nuevo" target="_blank" class="btn btn-ghost btn-sm"><icon name="external-link" /> ¿Producto nuevo? Créalo aquí</a>
            </div>
          </div>
          <div class="table-wrap" v-if="items.length">
            <table class="table">
              <thead><tr><th>Producto</th><th class="num">Stock actual</th><th class="num" style="width:110px">Cantidad</th><th class="num" style="width:140px">Costo unitario</th><th class="num">Importe</th><th class="num" style="width:150px">Nuevo precio venta</th><th></th></tr></thead>
              <tbody>
                <tr v-for="(i, idx) in items" :key="i.variant_id">
                  <td><div class="bold">{{ i.name }}</div><div class="tiny muted">{{ i.variant || 'Única' }} · {{ i.sku }}</div></td>
                  <td class="num">{{ i.stock }} → <b>{{ i.stock + (Number(i.quantity) || 0) }}</b></td>
                  <td><input class="input input-sm num" type="number" min="1" v-model="i.quantity" /></td>
                  <td><input class="input input-sm num" type="number" min="0" step="0.01" v-model="i.unit_cost" /></td>
                  <td class="num bold">{{ fmt.money((Number(i.quantity) || 0) * (Number(i.unit_cost) || 0)) }}</td>
                  <td><input class="input input-sm num" type="number" min="0" step="0.01" v-model="i.new_price" :placeholder="'Actual ' + fmt.money(i.price)" /></td>
                  <td class="actions"><button class="btn btn-ghost btn-icon btn-sm" @click="items.splice(idx, 1)"><icon name="x" /></button></td>
                </tr>
              </tbody>
              <tfoot><tr><td colspan="2">Total</td><td class="num">{{ units }} pzas</td><td></td><td class="num">{{ fmt.money(total) }}</td><td colspan="2"></td></tr></tfoot>
            </table>
          </div>
          <empty v-else icon="package-plus" title="Agrega los productos recibidos" text="Escanea el código de barras de cada producto o búscalo por nombre. Si escaneas el mismo producto varias veces se suma la cantidad." />
          <div class="card-footer flex flex-wrap">
            <label class="check small"><input type="checkbox" v-model="updateCost" /> Actualizar el costo del producto (promedio ponderado)</label>
            <div class="ml-auto flex">
              <a href="#/compras" class="btn">Cancelar</a>
              <button class="btn btn-primary btn-lg" :disabled="saving || !items.length" @click="save"><icon name="save" /> Registrar entrada · {{ fmt.money(total) }}</button>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
