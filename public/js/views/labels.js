/* Etiquetas con código de barras para productos (hoja carta o rollo térmico). */
(function () {
  'use strict';
  const { ref, computed, onMounted } = Vue;
  const fmt = App.fmt;
  const store = App.store;
  const KEY = 'labels-options';

  App.views.Labels = {
    setup() {
      const items = ref([]);
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* ignorar */ }
      const format = ref(saved.format || 'sheet');
      const showPrice = ref(saved.showPrice !== false);
      const showStore = ref(!!saved.showStore);
      const loading = ref(false);

      function add(v, copies = 1) {
        const ex = items.value.find((i) => i.id === v.id);
        if (ex) { ex.copies += copies; return; }
        items.value.push({ id: v.id, name: v.name, variant: fmt.variant(v), sku: v.sku, barcode: v.barcode, price: v.price, copies });
      }

      onMounted(async () => {
        const q = store.route.query;
        loading.value = true;
        try {
          if (q.product_id) {
            const p = await App.api.get('/products/' + q.product_id);
            p.variants.filter((v) => v.active).forEach((v) => add({ ...v, name: p.name }, Math.max(1, v.stock)));
          }
          if (q.purchase_id) {
            const pu = await App.api.get('/purchases/' + q.purchase_id);
            pu.items.filter((i) => i.variant_id).forEach((i) => add({ id: i.variant_id, name: i.name.replace(/\s\(.*\)$/, ''), size: i.size, color: i.color, sku: i.sku, barcode: i.barcode, price: i.price }, i.quantity));
          }
        } catch (e) { App.error(e); } finally { loading.value = false; }
      });

      const total = computed(() => items.value.reduce((s, i) => s + (Number(i.copies) || 0), 0));
      const preview = computed(() => {
        const i = items.value[0];
        return i ? App.barcodeSvg(i.barcode || i.sku, { height: 40 }) : '';
      });
      const missing = computed(() => items.value.filter((i) => !i.barcode).length);

      function print() {
        if (!total.value) return App.toast('Agrega productos para imprimir', 'warning');
        try { localStorage.setItem(KEY, JSON.stringify({ format: format.value, showPrice: showPrice.value, showStore: showStore.value })); } catch (e) { /* ignorar */ }
        App.printLabels(items.value, { format: format.value, showPrice: showPrice.value, showStore: showStore.value });
      }
      return { items, format, showPrice, showStore, loading, add, total, preview, missing, print, store, fmt };
    },
    template: `
      <div class="grid" style="grid-template-columns: minmax(0, 1fr) 320px">
        <div class="card">
          <div class="card-body" style="border-bottom:1px solid var(--border)"><product-search autofocus @select="add($event)" placeholder="Busca o escanea productos para agregar etiquetas…" /></div>
          <loading v-if="loading" />
          <div v-else-if="items.length" class="table-wrap">
            <table class="table">
              <thead><tr><th>Producto</th><th>Código</th><th class="num">Precio</th><th class="num" style="width:110px">Etiquetas</th><th></th></tr></thead>
              <tbody>
                <tr v-for="(i, idx) in items" :key="i.id">
                  <td><div class="bold">{{ i.name }}</div><div class="tiny muted">{{ i.variant || 'Única' }}</div></td>
                  <td class="mono">{{ i.barcode || i.sku }} <span v-if="!i.barcode" class="badge badge-warning" title="Se usará el SKU como código">SKU</span></td>
                  <td class="num">{{ fmt.money(i.price) }}</td>
                  <td><input class="input input-sm num" type="number" min="0" v-model.number="i.copies" /></td>
                  <td class="actions"><button class="btn btn-ghost btn-icon btn-sm" @click="items.splice(idx, 1)"><icon name="x" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <empty v-else icon="tag" title="Sin productos" text="Agrega productos para imprimir sus etiquetas. También puedes imprimirlas desde un producto o una entrada de mercancía." />
          <div class="card-footer flex" v-if="items.length">
            <button class="btn btn-sm btn-ghost" @click="items.forEach(i => i.copies = 1)">1 etiqueta por producto</button>
            <button class="btn btn-sm btn-ghost" @click="items = []">Limpiar</button>
            <span class="ml-auto small muted">{{ total }} etiqueta(s)</span>
          </div>
        </div>
        <div class="flex-col gap-16">
          <div class="card">
            <div class="card-header"><h3><icon name="printer" /> Opciones</h3></div>
            <div class="card-body flex-col gap-12">
              <div class="form-group"><label>Formato</label>
                <select class="select" v-model="format"><option value="sheet">Hoja carta (3 columnas)</option><option value="roll">Rollo térmico 50 × 25 mm</option></select></div>
              <label class="switch"><input type="checkbox" v-model="showPrice" /><span class="track"></span>Mostrar precio</label>
              <label class="switch"><input type="checkbox" v-model="showStore" /><span class="track"></span>Mostrar nombre de la tienda</label>
              <div v-if="missing" class="alert alert-warning small"><icon name="info" :size="16" />{{ missing }} producto(s) sin código de barras usarán su SKU.</div>
              <button class="btn btn-primary btn-lg" :disabled="!total" @click="print"><icon name="printer" /> Imprimir {{ total }} etiqueta(s)</button>
            </div>
          </div>
          <div class="card" v-if="items.length">
            <div class="card-header"><h3><icon name="eye" /> Vista previa</h3></div>
            <div class="card-body" style="display:grid;place-items:center">
              <div class="label-item">
                <div v-if="showStore" class="tiny muted" style="text-transform:uppercase">{{ store.settings.store_name }}</div>
                <div class="l-name">{{ items[0].name }}</div>
                <div class="l-var">{{ items[0].variant }}</div>
                <div v-html="preview"></div>
                <div v-if="showPrice" class="l-price">{{ fmt.money(items[0].price) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
