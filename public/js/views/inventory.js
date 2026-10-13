/* Inventario: ajustes, conteo físico con lector de códigos y kardex de movimientos. */
(function () {
  'use strict';
  const { ref, reactive, computed, watch, onMounted } = Vue;
  const fmt = App.fmt;
  const store = App.store;

  const REASONS = ['Conteo físico', 'Mercancía dañada', 'Merma', 'Robo / extravío', 'Muestra / regalo', 'Uso interno', 'Corrección de captura', 'Otro'];
  const TYPE_BADGE = {
    inicial: ['badge-info', 'Inicial'], compra: ['badge-success', 'Compra'], venta: ['badge-purple', 'Venta'], devolucion: ['badge-warning', 'Devolución'],
    cancelacion: ['badge-warning', 'Cancelación'], cancelacion_compra: ['badge-danger', 'Canc. compra'], ajuste: ['', 'Ajuste'], conteo: ['badge-info', 'Conteo'],
  };

  // ---------------------------------------------------------------------------
  /** Ajuste rápido de una sola variante (usado también desde la ficha del producto). */
  App.components.AdjustModal = {
    props: { variant: Object },
    emits: ['done', 'close'],
    setup(props, { emit }) {
      const mode = ref('set');
      const qty = ref(props.variant.stock);
      const reason = ref('Conteo físico');
      const note = ref('');
      const saving = ref(false);
      const result = computed(() => {
        const n = Math.trunc(Number(qty.value) || 0);
        return mode.value === 'set' ? n : mode.value === 'add' ? props.variant.stock + n : props.variant.stock - n;
      });
      async function save() {
        const n = Math.trunc(Number(qty.value) || 0);
        if (result.value < 0) return App.toast('El stock resultante no puede ser negativo', 'error');
        saving.value = true;
        try {
          await App.api.post('/inventory/adjust', {
            reason: reason.value, note: note.value,
            items: [{ variant_id: props.variant.id, mode: mode.value === 'set' ? 'set' : 'add', quantity: mode.value === 'remove' ? -n : n }],
          });
          App.toast('Existencia actualizada');
          emit('done');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      return { mode, qty, reason, note, saving, result, save, emit, REASONS, fmt };
    },
    template: `
      <modal title="Ajustar existencia" icon="sliders-horizontal" size="sm" @close="emit('close')">
        <div class="mb-12"><div class="bold">{{ variant.name }}</div><div class="small muted">{{ fmt.variant(variant) || 'Única' }} · {{ variant.sku }} · Actual: <b>{{ variant.stock }}</b></div></div>
        <div class="btn-group mb-12" style="width:100%">
          <button class="btn flex-1" :class="{ active: mode === 'set' }" @click="mode = 'set'; qty = variant.stock">Fijar en</button>
          <button class="btn flex-1" :class="{ active: mode === 'add' }" @click="mode = 'add'; qty = 1">Sumar</button>
          <button class="btn flex-1" :class="{ active: mode === 'remove' }" @click="mode = 'remove'; qty = 1">Restar</button>
        </div>
        <div class="grid grid-2">
          <div class="form-group"><label>Cantidad</label><input class="input input-lg num" type="number" min="0" v-model="qty" @focus="$event.target.select()" @keydown.enter="save" autofocus /></div>
          <div class="form-group"><label>Quedará en</label><div class="input input-lg num bold" style="display:flex;align-items:center;justify-content:flex-end;background:var(--surface-2)" :class="result < 0 ? 'text-danger' : ''">{{ result }}</div></div>
          <div class="form-group span-all"><label>Motivo</label><select class="select" v-model="reason"><option v-for="r in REASONS" :key="r">{{ r }}</option></select></div>
          <div class="form-group span-all"><label>Nota (opcional)</label><input class="input" v-model="note" @keydown.enter="save" /></div>
        </div>
        <template #footer>
          <button class="btn" @click="emit('close')">Cancelar</button>
          <button class="btn btn-primary" :disabled="saving" @click="save"><icon name="save" /> Guardar ajuste</button>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  const AdjustTab = {
    setup() {
      const rows = ref([]);
      const reason = ref('Mercancía dañada');
      const note = ref('');
      const saving = ref(false);
      function add(v) {
        const ex = rows.value.find((r) => r.id === v.id);
        if (ex) { ex.qty = (Number(ex.qty) || 0) + 1; return; }
        rows.value.push({ ...v, mode: 'remove', qty: 1 });
      }
      const after = (r) => {
        const n = Math.trunc(Number(r.qty) || 0);
        return r.mode === 'set' ? n : r.mode === 'add' ? r.stock + n : r.stock - n;
      };
      async function save() {
        if (!rows.value.length) return;
        if (rows.value.some((r) => after(r) < 0)) return App.toast('Algún producto quedaría con existencia negativa', 'error');
        if (!(await App.confirm({ title: 'Aplicar ajuste', message: `Se modificará la existencia de ${rows.value.length} producto(s). Motivo: ${reason.value}.`, confirmText: 'Aplicar ajuste' }))) return;
        saving.value = true;
        try {
          const r = await App.api.post('/inventory/adjust', {
            reason: reason.value, note: note.value,
            items: rows.value.map((x) => ({ variant_id: x.id, mode: x.mode === 'set' ? 'set' : 'add', quantity: x.mode === 'remove' ? -Math.trunc(Number(x.qty) || 0) : Math.trunc(Number(x.qty) || 0) })),
          });
          App.toast(`Ajuste aplicado a ${r.changed} producto(s)`);
          rows.value = [];
          note.value = '';
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      return { rows, reason, note, saving, add, after, save, REASONS, fmt };
    },
    template: `
      <div class="card">
        <div class="card-body" style="border-bottom:1px solid var(--border)">
          <p class="muted small mb-8">Busca o escanea los productos a ajustar. Usa esta opción para mercancía dañada, mermas, regalos o correcciones.</p>
          <product-search autofocus @select="add" />
        </div>
        <div class="table-wrap" v-if="rows.length">
          <table class="table">
            <thead><tr><th>Producto</th><th class="num">Actual</th><th style="width:150px">Acción</th><th style="width:110px" class="num">Cantidad</th><th class="num">Quedará</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in rows" :key="r.id">
                <td><div class="bold">{{ r.name }}</div><div class="tiny muted">{{ fmt.variant(r) || 'Única' }} · {{ r.sku }}</div></td>
                <td class="num">{{ r.stock }}</td>
                <td><select class="select input-sm" v-model="r.mode"><option value="remove">Restar</option><option value="add">Sumar</option><option value="set">Fijar en</option></select></td>
                <td><input class="input input-sm num" type="number" min="0" v-model="r.qty" /></td>
                <td class="num bold" :class="after(r) < 0 ? 'text-danger' : ''">{{ after(r) }}</td>
                <td class="actions"><button class="btn btn-ghost btn-icon btn-sm" @click="rows.splice(i, 1)"><icon name="x" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <empty v-else icon="scan-barcode" title="Agrega productos al ajuste" text="Escanea el código de barras o busca por nombre." />
        <div class="card-footer flex flex-wrap" v-if="rows.length">
          <div class="form-group" style="width:220px"><label>Motivo</label><select class="select" v-model="reason"><option v-for="r in REASONS" :key="r">{{ r }}</option></select></div>
          <div class="form-group flex-1" style="min-width:200px"><label>Nota</label><input class="input" v-model="note" placeholder="Detalle del ajuste (opcional)" /></div>
          <button class="btn btn-primary ml-auto" style="align-self:flex-end" :disabled="saving" @click="save"><icon name="save" /> Aplicar ajuste</button>
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  const CountTab = {
    setup() {
      const f = reactive({ category_id: '', brand_id: '' });
      const rows = ref([]);
      const loading = ref(false);
      const onlyDiff = ref(false);
      const saving = ref(false);
      const lastScanned = ref(null);
      async function load() {
        loading.value = true;
        try { rows.value = (await App.api.get('/inventory/count-sheet', f)).map((r) => ({ ...r, counted: '' })); }
        catch (e) { App.error(e); } finally { loading.value = false; }
      }
      onMounted(load);
      const counted = computed(() => rows.value.filter((r) => r.counted !== '' && r.counted !== null));
      const diffs = computed(() => counted.value.filter((r) => Number(r.counted) !== r.stock));
      const shown = computed(() => (onlyDiff.value ? diffs.value : rows.value));
      const diffValue = computed(() => App.round2(diffs.value.reduce((s, r) => s + (Number(r.counted) - r.stock) * r.cost, 0)));

      function scan(v) {
        const r = rows.value.find((x) => x.variant_id === v.id);
        if (!r) return App.toast('Ese producto no está en la lista filtrada', 'warning');
        r.counted = (Number(r.counted) || 0) + 1;
        lastScanned.value = r.variant_id;
        setTimeout(() => {
          const el = document.getElementById('count-' + r.variant_id);
          if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 50);
      }
      async function apply() {
        if (!diffs.value.length) return App.toast('No hay diferencias que aplicar', 'warning');
        if (!(await App.confirm({
          title: 'Aplicar conteo físico',
          message: `Se actualizarán ${diffs.value.length} producto(s) con diferencia. Los productos que no contaste no se modifican.\nDiferencia en valor: ${fmt.money(diffValue.value)}`,
          confirmText: 'Aplicar conteo',
        }))) return;
        saving.value = true;
        try {
          await App.api.post('/inventory/adjust', { reason: 'Conteo físico', items: diffs.value.map((r) => ({ variant_id: r.variant_id, mode: 'set', quantity: Math.max(0, Math.trunc(Number(r.counted))) })) });
          App.toast('Conteo aplicado');
          load();
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      function printSheet() {
        const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const body = rows.value.map((r) => `<tr><td>${esc(r.name)}<br><small>${esc(fmt.variant(r))}</small></td><td>${esc(r.sku)}</td><td>${esc(r.location || '')}</td><td style="text-align:right">${r.stock}</td><td style="width:70px;border-bottom:1px solid #000"></td></tr>`).join('');
        App.printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Hoja de conteo</title><style>body{font-family:Arial;font-size:11px}table{width:100%;border-collapse:collapse}td,th{padding:5px;border-bottom:1px solid #ddd;text-align:left}h2{margin:0 0 6px}</style></head>
          <body><h2>Hoja de conteo físico — ${esc(store.settings.store_name)}</h2><div>Fecha: ${fmt.datetime(App.nowLocal())}</div><br>
          <table><thead><tr><th>Producto</th><th>SKU</th><th>Ubicación</th><th style="text-align:right">Sistema</th><th>Contado</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
      }
      return { f, rows, loading, onlyDiff, saving, lastScanned, counted, diffs, shown, diffValue, load, scan, apply, printSheet, store, fmt };
    },
    template: `
      <div class="card">
        <div class="toolbar">
          <select class="select" style="width:180px" v-model="f.category_id" @change="load"><option value="">Todas las categorías</option><option v-for="c in store.categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
          <select class="select" style="width:160px" v-model="f.brand_id" @change="load"><option value="">Todas las marcas</option><option v-for="b in store.brands" :key="b.id" :value="b.id">{{ b.name }}</option></select>
          <label class="check small"><input type="checkbox" v-model="onlyDiff" /> Solo diferencias</label>
          <div class="ml-auto flex">
            <button class="btn" @click="printSheet"><icon name="printer" /> Hoja para contar</button>
            <button class="btn btn-primary" :disabled="saving || !diffs.length" @click="apply"><icon name="clipboard-check" /> Aplicar conteo ({{ diffs.length }})</button>
          </div>
        </div>
        <div class="card-body" style="border-bottom:1px solid var(--border);background:var(--surface-2)">
          <div class="flex flex-wrap gap-16">
            <div class="flex-1" style="min-width:280px"><product-search placeholder="Escanea cada pieza para contarla (+1 por escaneo)…" @select="scan" /></div>
            <div class="small"><b>{{ counted.length }}</b> de {{ rows.length }} contados · <b :class="diffs.length ? 'text-warning' : ''">{{ diffs.length }}</b> con diferencia · Valor: <b :class="diffValue < 0 ? 'text-danger' : 'text-success'">{{ fmt.money(diffValue) }}</b></div>
          </div>
        </div>
        <loading v-if="loading" />
        <div v-else class="table-wrap" style="max-height: 60vh">
          <table class="table table-sm">
            <thead><tr><th>Producto</th><th>SKU</th><th>Ubicación</th><th class="num">Sistema</th><th class="num" style="width:120px">Contado</th><th class="num">Diferencia</th></tr></thead>
            <tbody>
              <tr v-for="r in shown" :key="r.variant_id" :id="'count-' + r.variant_id" :class="{ selected: lastScanned === r.variant_id }">
                <td><div class="bold">{{ r.name }}</div><div class="tiny muted">{{ fmt.variant(r) || 'Única' }}<span v-if="r.brand_name"> · {{ r.brand_name }}</span></div></td>
                <td class="mono">{{ r.sku }}</td>
                <td class="small">{{ r.location || '' }}</td>
                <td class="num">{{ r.stock }}</td>
                <td><input class="input input-sm num" type="number" min="0" v-model="r.counted" placeholder="—" /></td>
                <td class="num bold">
                  <template v-if="r.counted !== '' && r.counted !== null">
                    <span v-if="Number(r.counted) === r.stock" class="text-success"><icon name="check" :size="15" /></span>
                    <span v-else :class="Number(r.counted) > r.stock ? 'text-success' : 'text-danger'">{{ Number(r.counted) > r.stock ? '+' : '' }}{{ Number(r.counted) - r.stock }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          <empty v-if="!shown.length" icon="clipboard-list" :title="onlyDiff ? 'Sin diferencias' : 'No hay productos'" />
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  const KardexTab = {
    setup() {
      const q = store.route.query;
      const f = reactive({ q: '', type: '', from: '', to: '', product_id: q.product_id || '', page: 1 });
      const data = ref(null);
      const loading = ref(false);
      async function load() {
        loading.value = true;
        try { data.value = await App.api.get('/inventory/movements', { ...f, limit: 50 }); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      const reload = () => { if (f.page !== 1) f.page = 1; else load(); };
      watch(() => f.q, App.debounce(reload, 300));
      watch(() => f.page, load);
      onMounted(load);
      async function exportCsv() {
        try {
          const all = await App.api.get('/inventory/movements', { ...f, page: 1, limit: 1000 });
          App.downloadCsv('kardex.csv', ['Fecha', 'Producto', 'Variante', 'SKU', 'Tipo', 'Cantidad', 'Antes', 'Después', 'Costo unitario', 'Referencia', 'Nota', 'Usuario'],
            all.rows.map((m) => [m.created_at, m.name, fmt.variant(m), m.sku, all.types[m.type] || m.type, m.quantity, m.stock_before, m.stock_after, m.unit_cost, m.reference, m.note, m.user_name]));
        } catch (e) { App.error(e); }
      }
      function clearProduct() { f.product_id = ''; App.setQuery({ tab: 'kardex' }); reload(); }
      return { f, data, loading, load, reload, exportCsv, clearProduct, TYPE_BADGE, fmt };
    },
    template: `
      <div class="card">
        <div class="toolbar">
          <div class="input-group search"><icon name="search" /><input class="input" v-model="f.q" placeholder="Buscar producto, SKU o referencia…" /></div>
          <select class="select" style="width:170px" v-model="f.type" @change="reload">
            <option value="">Todos los movimientos</option>
            <option v-for="(t, k) in (data ? data.types : {})" :key="k" :value="k">{{ t }}</option>
          </select>
          <date-range v-model:from="f.from" v-model:to="f.to" allow-empty @change="reload" />
          <span v-if="f.product_id" class="badge badge-info">Filtrado por producto <a href="#" @click.prevent="clearProduct" style="margin-left:4px">✕</a></span>
          <button class="btn ml-auto" @click="exportCsv"><icon name="download" /> Exportar</button>
        </div>
        <loading v-if="loading && !data" />
        <div v-else-if="data" class="table-wrap">
          <table class="table table-sm">
            <thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th class="num">Cantidad</th><th class="num">Antes</th><th class="num">Después</th><th>Referencia</th><th>Usuario</th></tr></thead>
            <tbody>
              <tr v-for="m in data.rows" :key="m.id">
                <td class="nowrap">{{ fmt.datetime(m.created_at) }}</td>
                <td><a :href="'#/productos/' + m.product_id" class="bold" style="color:inherit">{{ m.name }}</a><div class="tiny muted">{{ fmt.variant(m) || 'Única' }} · {{ m.sku }}</div></td>
                <td><span class="badge" :class="(TYPE_BADGE[m.type] || [''])[0]">{{ (TYPE_BADGE[m.type] || ['', m.type])[1] }}</span></td>
                <td class="num bold" :class="m.quantity > 0 ? 'text-success' : 'text-danger'">{{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}</td>
                <td class="num muted">{{ m.stock_before }}</td>
                <td class="num bold">{{ m.stock_after }}</td>
                <td class="small"><span class="mono">{{ m.reference }}</span><div class="tiny muted" v-if="m.note">{{ m.note }}</div></td>
                <td class="small">{{ m.user_name }}</td>
              </tr>
            </tbody>
          </table>
          <empty v-if="!data.rows.length" icon="history" title="Sin movimientos" />
        </div>
        <pagination v-if="data" v-model:page="f.page" :total="data.total" :limit="data.limit" />
      </div>`,
  };

  App.views.Inventory = {
    components: { AdjustTab, CountTab, KardexTab },
    setup() {
      const tab = ref(store.route.query.tab || 'ajuste');
      watch(tab, (t) => App.setQuery({ ...store.route.query, tab: t }));
      return { tab };
    },
    template: `
      <div>
        <div class="tabs">
          <button class="tab" :class="{ active: tab === 'ajuste' }" @click="tab = 'ajuste'"><icon name="sliders-horizontal" :size="16" /> Ajuste de inventario</button>
          <button class="tab" :class="{ active: tab === 'conteo' }" @click="tab = 'conteo'"><icon name="clipboard-check" :size="16" /> Conteo físico</button>
          <button class="tab" :class="{ active: tab === 'kardex' }" @click="tab = 'kardex'"><icon name="history" :size="16" /> Kardex / movimientos</button>
        </div>
        <adjust-tab v-if="tab === 'ajuste'" />
        <count-tab v-else-if="tab === 'conteo'" />
        <kardex-tab v-else />
      </div>`,
  };
})();
