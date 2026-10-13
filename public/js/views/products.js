/* Catálogo de productos: listado con filtros y formulario con tallas, colores e imagen. */
(function () {
  'use strict';
  const { ref, reactive, computed, watch, onMounted, nextTick } = Vue;
  const fmt = App.fmt;
  const store = App.store;

  // ---------------------------------------------------------------------------
  // Listado
  // ---------------------------------------------------------------------------
  App.views.Products = {
    setup() {
      const q = store.route.query;
      const f = reactive({
        q: q.q || '', category_id: q.category_id || '', brand_id: q.brand_id || '', supplier_id: q.supplier_id || '', stock: q.stock || '', active: q.active || '1',
        sort: q.sort || 'name', page: Number(q.page) || 1,
      });
      const data = ref(null);
      const loading = ref(false);
      const showCost = computed(() => App.can('products.edit') || App.can('inventory') || App.can('reports'));
      const adjusting = ref(null);

      async function load() {
        loading.value = true;
        App.setQuery(Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== '' && !(k === 'active' && v === '1') && !(k === 'sort' && v === 'name') && !(k === 'page' && v === 1))));
        try { data.value = await App.api.get('/products', { ...f, limit: 50 }); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      const reload = () => { if (f.page !== 1) f.page = 1; else load(); };
      watch(() => f.q, App.debounce(reload, 300));
      watch(() => [f.category_id, f.brand_id, f.supplier_id, f.stock, f.active, f.sort], reload);
      watch(() => f.page, load);
      onMounted(load);

      const priceRange = (p) => (p.min_price === p.max_price ? fmt.money(p.min_price) : `${fmt.money(p.min_price)} – ${fmt.money(p.max_price)}`);
      const margin = (p) => (p.max_price > 0 ? ((p.max_price - p.max_cost) / p.max_price) * 100 : 0);
      const pillClass = (v) => (!v.active ? '' : v.stock <= 0 ? 'out' : v.stock <= v.min_stock ? 'low' : '');
      const pillLabel = (v) => (v.size && v.color ? `${v.size} ${v.color.slice(0, 3)}` : v.size || v.color || 'Única');
      const stockClass = (p) => (p.total_stock <= 0 ? 'out' : p.low_count > 0 ? 'low' : '');

      function exportCsv() { window.location.href = '/api/export/products.csv'; }
      function labels(p) { App.go('/etiquetas?product_id=' + p.id); }

      return { f, data, loading, store, showCost, adjusting, load, priceRange, margin, pillClass, pillLabel, stockClass, exportCsv, labels, fmt, can: App.can };
    },
    template: `
      <div>
        <div class="stats mb-16" v-if="data">
          <stat-card icon="package" label="Productos" :value="fmt.num(data.summary.products)" :sub="fmt.num(data.summary.units) + ' piezas en existencia'" />
          <stat-card v-if="showCost" icon="coins" color="purple" label="Valor del inventario (costo)" :value="fmt.money(data.summary.cost_value)" :sub="'A precio de venta: ' + fmt.money(data.summary.price_value)" />
          <stat-card icon="triangle-alert" color="orange" label="Con stock bajo" :value="fmt.num(data.summary.low_products)" sub="productos con alguna talla/color en mínimo" />
          <stat-card icon="circle-x" color="red" label="Con agotados" :value="fmt.num(data.summary.out_products)" sub="productos con alguna variante en cero" />
        </div>
        <div class="card">
          <div class="toolbar">
            <div class="input-group search"><icon name="search" /><input class="input" v-model="f.q" placeholder="Buscar por nombre, marca, SKU, código, talla…" /></div>
            <select class="select" style="width:170px" v-model="f.category_id"><option value="">Todas las categorías</option><option v-for="c in store.categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
            <select class="select" style="width:150px" v-model="f.brand_id"><option value="">Todas las marcas</option><option v-for="b in store.brands" :key="b.id" :value="b.id">{{ b.name }}</option></select>
            <select class="select" style="width:150px" v-model="f.stock">
              <option value="">Todo el stock</option><option value="low">Stock bajo</option><option value="out">Agotados</option><option value="ok">Stock suficiente</option>
            </select>
            <span v-if="f.supplier_id" class="badge badge-info">Filtrado por proveedor <a href="#" @click.prevent="f.supplier_id = ''" style="margin-left:4px">✕</a></span>
            <select class="select" style="width:120px" v-model="f.active"><option value="1">Activos</option><option value="0">Inactivos</option><option value="all">Todos</option></select>
            <select class="select" style="width:160px" v-model="f.sort" title="Ordenar">
              <option value="name">Nombre A-Z</option><option value="-name">Nombre Z-A</option><option value="stock">Menor stock</option><option value="-stock">Mayor stock</option>
              <option value="price">Menor precio</option><option value="-price">Mayor precio</option><option value="-created">Más recientes</option><option value="category">Categoría</option>
            </select>
            <div class="ml-auto flex">
              <button class="btn" @click="exportCsv" title="Descargar catálogo en CSV (Excel)"><icon name="download" /> Exportar</button>
              <a v-if="can('products.edit')" href="#/productos/nuevo" class="btn btn-primary"><icon name="plus" /> Nuevo producto</a>
            </div>
          </div>
          <loading v-if="loading && !data" />
          <div v-else-if="data" class="table-wrap">
            <table class="table">
              <thead><tr>
                <th>Producto</th><th>Tallas / colores</th><th class="num">Precio</th><th v-if="showCost" class="num">Costo</th><th v-if="showCost" class="num">Margen</th><th class="num">Stock</th><th></th>
              </tr></thead>
              <tbody>
                <tr v-for="p in data.rows" :key="p.id" class="clickable" :class="{ 'muted-row': !p.active }" @click="App.go('/productos/' + p.id)">
                  <td>
                    <div class="flex gap-12">
                      <thumb :product="p" />
                      <div style="min-width:0">
                        <div class="bold">{{ p.name }} <span v-if="!p.active" class="badge">Inactivo</span></div>
                        <div class="tiny muted flex gap-4" style="flex-wrap:wrap">
                          <span v-if="p.category_name" class="flex gap-4"><span class="dot" :style="{ background: p.category_color }"></span>{{ p.category_name }}</span>
                          <span v-if="p.brand_name">· {{ p.brand_name }}</span><span v-if="p.gender">· {{ p.gender }}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style="max-width:320px">
                    <div class="size-pills" v-if="p.variants.length > 1">
                      <span v-for="v in p.variants.filter(v => v.active)" :key="v.id" class="size-pill" :class="pillClass(v)" :title="fmt.variant(v) + ': ' + v.stock + ' pzas'">{{ pillLabel(v) }} · {{ v.stock }}</span>
                    </div>
                    <span v-else class="muted small mono">{{ p.variants[0] && p.variants[0].sku }}</span>
                  </td>
                  <td class="num bold">{{ p.variant_count ? priceRange(p) : '—' }}</td>
                  <td v-if="showCost" class="num muted">{{ p.variant_count ? fmt.money(p.max_cost) : '—' }}</td>
                  <td v-if="showCost" class="num"><span :class="margin(p) < 20 ? 'text-warning' : 'text-success'">{{ fmt.pct(margin(p), 0) }}</span></td>
                  <td class="num"><span class="stock-num" :class="stockClass(p)">{{ fmt.num(p.total_stock) }}</span>
                    <div class="tiny text-warning" v-if="p.low_count && p.total_stock > 0">{{ p.low_count }} en mínimo</div></td>
                  <td class="actions" @click.stop>
                    <button class="btn btn-ghost btn-icon btn-sm" title="Etiquetas" @click="labels(p)"><icon name="tag" /></button>
                    <a :href="'#/productos/' + p.id" class="btn btn-ghost btn-icon btn-sm" :title="can('products.edit') ? 'Editar' : 'Ver'"><icon :name="can('products.edit') ? 'pencil' : 'eye'" /></a>
                  </td>
                </tr>
              </tbody>
            </table>
            <empty v-if="!data.rows.length" icon="package-search" title="No se encontraron productos" text="Prueba con otros filtros o registra un producto nuevo.">
              <a v-if="can('products.edit')" href="#/productos/nuevo" class="btn btn-primary"><icon name="plus" /> Nuevo producto</a>
            </empty>
          </div>
          <pagination v-if="data" v-model:page="f.page" :total="data.total" :limit="data.limit" />
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  // Formulario de producto
  // ---------------------------------------------------------------------------
  const SIZE_PRESETS = [
    { label: 'Trajes dama', sizes: '28, 30, 32, 34, 36, 38, 40' },
    { label: 'Trajes caballero', sizes: '26, 28, 30, 32, 34, 36, 38' },
    { label: 'Ropa XS–XXL', sizes: 'XS, S, M, L, XL, XXL' },
    { label: 'Infantil 4–16', sizes: '4, 6, 8, 10, 12, 14, 16' },
    { label: 'Calzado 22–29', sizes: '22, 23, 24, 25, 26, 27, 28, 29' },
  ];
  const COLOR_PRESETS = ['Negro', 'Azul', 'Azul marino', 'Rojo', 'Rosa', 'Blanco', 'Gris', 'Verde', 'Morado', 'Amarillo', 'Turquesa'];
  const GENDERS = ['Unisex', 'Hombre', 'Mujer', 'Niño', 'Niña'];

  const blankVariant = (extra = {}) => ({
    id: null, size: '', color: '', sku: '', barcode: '', cost: '', price: '', stock: '', min_stock: Number(store.settings.default_min_stock || 0), location: '', active: 1, ...extra,
  });

  App.views.ProductForm = {
    setup() {
      const id = computed(() => store.route.params.id);
      const isNew = computed(() => !id.value);
      const canEdit = computed(() => App.can('products.edit'));
      const loading = ref(!isNew.value);
      const saving = ref(false);
      const suppliers = ref([]);
      const product = ref(null);
      const form = reactive({ name: '', description: '', category_id: '', brand_name: '', supplier_id: '', gender: '', active: 1 });
      const variants = ref([blankVariant()]);
      const multi = ref(false);
      const sizesText = ref('');
      const colorsText = ref('');
      const autoBarcode = ref(true);
      const imagePreview = ref(null);
      const pendingImage = ref(null);
      const fileInput = ref(null);
      const bulk = reactive({ cost: '', price: '', min_stock: '' });
      const adjusting = ref(null);

      async function load() {
        try {
          const [p, s] = await Promise.all([
            isNew.value ? null : App.api.get('/products/' + id.value),
            App.can('suppliers') || App.can('products.edit') ? App.api.get('/suppliers').catch(() => []) : [],
          ]);
          suppliers.value = s;
          if (p) {
            product.value = p;
            Object.assign(form, {
              name: p.name, description: p.description || '', category_id: p.category_id || '', brand_name: p.brand_name || '',
              supplier_id: p.supplier_id || '', gender: p.gender || '', active: p.active,
            });
            variants.value = p.variants.map((v) => ({ ...v, barcode: v.barcode || '', location: v.location || '', size: v.size || '', color: v.color || '' }));
            multi.value = p.variants.length > 1 || p.variants.some((v) => v.size || v.color);
            sizesText.value = [...new Set(p.variants.map((v) => v.size).filter(Boolean))].join(', ');
            colorsText.value = [...new Set(p.variants.map((v) => v.color).filter(Boolean))].join(', ');
            imagePreview.value = App.productImage(p);
            autoBarcode.value = false;
          }
        } catch (e) { App.error(e); App.go('/productos'); } finally { loading.value = false; }
      }
      onMounted(load);

      const split = (t) => [...new Set(String(t).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean))];

      function generate() {
        const sizes = split(sizesText.value);
        const colors = split(colorsText.value);
        if (!sizes.length && !colors.length) return App.toast('Escribe al menos una talla o un color', 'warning');
        const base = variants.value.find((v) => v.price !== '' || v.cost !== '') || blankVariant();
        const combos = [];
        for (const s of sizes.length ? sizes : ['']) for (const c of colors.length ? colors : ['']) combos.push([s, c]);
        const key = (v) => `${(v.size || '').toLowerCase()}|${(v.color || '').toLowerCase()}`;
        // Quitar la variante vacía inicial si no tiene datos propios.
        variants.value = variants.value.filter((v) => v.id || v.size || v.color || v.sku || v.barcode);
        const existing = new Set(variants.value.map(key));
        let added = 0;
        for (const [s, c] of combos) {
          const v = blankVariant({ size: s, color: c, cost: base.cost, price: base.price, min_stock: base.min_stock });
          if (!existing.has(key(v))) { variants.value.push(v); added++; }
        }
        App.toast(added ? `${added} variante(s) agregada(s)` : 'Todas las combinaciones ya existen', added ? 'success' : 'warning');
      }

      function setMulti(on) {
        if (!on && variants.value.filter((v) => v.active).length > 1) {
          App.toast('Para quitar tallas/colores elimina primero las variantes adicionales.', 'warning');
          return;
        }
        multi.value = on;
        if (!on && variants.value[0]) { variants.value[0].size = ''; variants.value[0].color = ''; }
      }

      function removeVariant(i) {
        const v = variants.value[i];
        if (v.id && v.stock > 0) {
          App.toast('Esta variante tiene existencias; se marcará como inactiva al guardar.', 'warning');
          v.active = 0;
          return;
        }
        variants.value.splice(i, 1);
        if (!variants.value.length) variants.value.push(blankVariant());
      }

      function applyBulk(field) {
        if (bulk[field] === '') return;
        variants.value.forEach((v) => { v[field] = bulk[field]; });
      }

      const marginOf = (v) => {
        const p = Number(v.price) || 0;
        const c = Number(v.cost) || 0;
        return p > 0 ? ((p - c) / p) * 100 : 0;
      };

      function pickImage() { fileInput.value && fileInput.value.click(); }
      async function onImage(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const data = await App.resizeImage(file, 600);
          imagePreview.value = data;
          if (isNew.value) pendingImage.value = data;
          else {
            const p = await App.api.put(`/products/${id.value}/image`, { data });
            product.value.updated_at = p.updated_at;
            App.toast('Imagen actualizada');
          }
        } catch (err) { App.error(err); }
      }
      async function removeImage() {
        if (!isNew.value) await App.api.del(`/products/${id.value}/image`);
        imagePreview.value = null;
        pendingImage.value = null;
      }

      async function addCategory() {
        const name = await App.prompt({ title: 'Nueva categoría', label: 'Nombre', placeholder: 'Ej. Natación infantil', confirmText: 'Crear' });
        if (!name) return;
        try {
          const c = await App.api.post('/categories', { name });
          await App.loadCatalogs();
          form.category_id = c.id;
        } catch (e) { App.error(e); }
      }

      async function save(andNew = false) {
        if (!form.name.trim()) return App.toast('Escribe el nombre del producto', 'error');
        const active = variants.value.filter((v) => v.active);
        if (!active.length) return App.toast('El producto necesita al menos una variante activa', 'error');
        if (variants.value.some((v) => v.active && !(Number(v.price) > 0))) {
          if (!(await App.confirm({ title: 'Precio en cero', message: 'Hay variantes sin precio de venta. ¿Guardar de todos modos?', confirmText: 'Guardar' }))) return;
        }
        if (multi.value && variants.value.some((v) => !v.size && !v.color)) return App.toast('Cada variante debe tener talla o color', 'error');
        const payload = {
          ...form,
          category_id: form.category_id || null,
          supplier_id: form.supplier_id || null,
          auto_barcode: autoBarcode.value,
          variants: variants.value.map((v) => ({
            id: v.id || undefined, size: multi.value ? v.size : '', color: multi.value ? v.color : '', sku: v.sku, barcode: v.barcode,
            cost: Number(v.cost) || 0, price: Number(v.price) || 0, stock: v.id ? undefined : Number(v.stock) || 0,
            min_stock: Number(v.min_stock) || 0, location: v.location, active: v.active ? 1 : 0,
          })),
        };
        saving.value = true;
        try {
          const p = isNew.value ? await App.api.post('/products', payload) : await App.api.put('/products/' + id.value, payload);
          if (pendingImage.value) await App.api.put(`/products/${p.id}/image`, { data: pendingImage.value });
          await App.loadCatalogs();
          App.toast(isNew.value ? 'Producto creado' : 'Cambios guardados');
          if (andNew) {
            if (isNew.value) { Object.assign(form, { name: '', description: '' }); variants.value = [blankVariant()]; imagePreview.value = null; pendingImage.value = null; nextTick(() => document.querySelector('#p-name')?.focus()); }
            else App.go('/productos/nuevo');
          } else App.go('/productos');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }

      async function remove() {
        if (!(await App.confirm({
          title: 'Eliminar producto',
          message: 'Si el producto tiene ventas o compras registradas se marcará como inactivo para conservar el historial.',
          confirmText: 'Eliminar', danger: true,
        }))) return;
        try {
          const r = await App.api.del('/products/' + id.value);
          App.toast(r.deactivated ? 'Producto desactivado (tiene historial)' : 'Producto eliminado');
          App.go('/productos');
        } catch (e) { App.error(e); }
      }

      async function afterAdjust() {
        adjusting.value = null;
        const p = await App.api.get('/products/' + id.value);
        for (const v of variants.value) {
          const fresh = p.variants.find((x) => x.id === v.id);
          if (fresh) v.stock = fresh.stock;
        }
      }

      const totalStock = computed(() => variants.value.reduce((s, v) => s + (Number(v.stock) || 0), 0));
      const brandList = computed(() => store.brands.map((b) => b.name));

      return {
        id, isNew, canEdit, loading, saving, suppliers, product, form, variants, multi, sizesText, colorsText, autoBarcode, imagePreview, fileInput, bulk, adjusting,
        SIZE_PRESETS, COLOR_PRESETS, GENDERS, store, totalStock, brandList,
        generate, setMulti, removeVariant, applyBulk, marginOf, pickImage, onImage, removeImage, addCategory, save, remove, afterAdjust,
        addVariant: () => variants.value.push(blankVariant({ cost: variants.value[0]?.cost ?? '', price: variants.value[0]?.price ?? '' })),
        addColor: (c) => { const list = colorsText.value ? colorsText.value.split(',').map((x) => x.trim()) : []; if (!list.includes(c)) colorsText.value = [...list, c].join(', '); },
        fmt, can: App.can,
      };
    },
    template: `
      <loading v-if="loading" />
      <div v-else>
        <div class="page-head">
          <a href="#/productos" class="btn btn-ghost btn-sm"><icon name="arrow-left" /> Productos</a>
          <h1 class="flex-1">{{ isNew ? 'Nuevo producto' : form.name }}</h1>
          <template v-if="!isNew">
            <a :href="'#/etiquetas?product_id=' + id" class="btn"><icon name="tag" /> Etiquetas</a>
            <a v-if="can('inventory')" :href="'#/inventario?tab=kardex&product_id=' + id" class="btn"><icon name="history" /> Kardex</a>
          </template>
        </div>

        <div v-if="product && product.stats" class="stats mb-16">
          <stat-card icon="shopping-bag" label="Piezas vendidas" :value="fmt.num(product.stats.units_sold)" />
          <stat-card icon="circle-dollar-sign" color="green" label="Ingresos por ventas" :value="fmt.money(product.stats.revenue)" />
          <stat-card icon="clock" color="purple" label="Última venta" :value="product.stats.last_sale ? fmt.relative(product.stats.last_sale) : 'Nunca'" />
          <stat-card icon="boxes" color="teal" label="Existencia total" :value="fmt.num(totalStock) + ' pzas'" />
        </div>

        <fieldset :disabled="!canEdit" style="border:0;padding:0;margin:0">
        <div class="grid" style="grid-template-columns: minmax(0, 1fr) 300px">
          <div class="card">
            <div class="card-header"><h3><icon name="file-text" /> Información general</h3></div>
            <div class="card-body grid grid-2">
              <div class="form-group span-all"><label class="req">Nombre del producto</label>
                <input id="p-name" class="input input-lg" v-model="form.name" placeholder="Ej. Traje de baño Endurance+ Medalist" :autofocus="isNew" /></div>
              <div class="form-group"><label>Categoría</label>
                <div class="flex"><select class="select flex-1" v-model="form.category_id"><option value="">Sin categoría</option><option v-for="c in store.categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
                  <button type="button" class="btn btn-icon" title="Nueva categoría" @click="addCategory"><icon name="plus" /></button></div>
              </div>
              <div class="form-group"><label>Marca</label>
                <input class="input" v-model="form.brand_name" list="brand-list" placeholder="Ej. Speedo, Arena, TYR…" />
                <datalist id="brand-list"><option v-for="b in brandList" :key="b" :value="b" /></datalist>
                <span class="hint">Si la marca no existe se crea automáticamente.</span>
              </div>
              <div class="form-group"><label>Género</label>
                <select class="select" v-model="form.gender"><option value="">—</option><option v-for="g in GENDERS" :key="g">{{ g }}</option></select></div>
              <div class="form-group"><label>Proveedor</label>
                <select class="select" v-model="form.supplier_id"><option value="">—</option><option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
              <div class="form-group span-all"><label>Descripción</label><textarea class="textarea" v-model="form.description" placeholder="Material, características, cuidados… (opcional)"></textarea></div>
              <label class="switch span-all"><input type="checkbox" :checked="form.active" @change="form.active = $event.target.checked ? 1 : 0" /><span class="track"></span>Producto activo (visible en el punto de venta)</label>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3><icon name="image" /> Foto</h3></div>
            <div class="card-body flex-col" style="align-items:center">
              <div class="image-drop" @click="pickImage" title="Cambiar foto">
                <img v-if="imagePreview" :src="imagePreview" alt="" />
                <div v-else><icon name="upload" :size="28" /><br>Subir foto</div>
              </div>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onImage" />
              <div class="flex">
                <button type="button" class="btn btn-sm" @click="pickImage"><icon name="upload" /> {{ imagePreview ? 'Cambiar' : 'Elegir' }}</button>
                <button type="button" v-if="imagePreview" class="btn btn-sm btn-ghost" @click="removeImage"><icon name="trash-2" /> Quitar</button>
              </div>
              <p class="tiny muted center">La foto ayuda a identificar el producto en el punto de venta. Se reduce automáticamente.</p>
            </div>
          </div>
        </div>

        <div class="card mt-16">
          <div class="card-header">
            <h3><icon name="ruler" /> Precio, tallas, colores y existencias</h3>
            <label class="switch ml-auto"><input type="checkbox" :checked="multi" @change="setMulti($event.target.checked)" /><span class="track"></span>Tiene tallas o colores</label>
          </div>

          <div v-if="multi" class="card-body" style="border-bottom:1px solid var(--border);background:var(--surface-2)">
            <div class="grid grid-2">
              <div class="form-group"><label>Tallas</label>
                <input class="input" v-model="sizesText" placeholder="Ej. 28, 30, 32, 34  ó  S, M, L" />
                <div class="flex flex-wrap gap-4 mt-4"><button type="button" v-for="p in SIZE_PRESETS" :key="p.label" class="btn btn-xs" @click="sizesText = p.sizes">{{ p.label }}</button></div>
              </div>
              <div class="form-group"><label>Colores</label>
                <input class="input" v-model="colorsText" placeholder="Ej. Negro, Azul marino" />
                <div class="flex flex-wrap gap-4 mt-4"><button type="button" v-for="c in COLOR_PRESETS" :key="c" class="btn btn-xs" @click="addColor(c)">+ {{ c }}</button></div>
              </div>
            </div>
            <div class="flex mt-12">
              <button type="button" class="btn btn-light" @click="generate"><icon name="sparkles" /> Generar combinaciones</button>
              <span class="small muted">Crea una variante por cada talla y color. Las existentes no se duplican.</span>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table variant-table">
              <thead><tr>
                <th v-if="multi">Talla</th><th v-if="multi">Color</th><th>SKU</th><th>Código de barras</th>
                <th class="num">Costo</th><th class="num">Precio venta</th><th class="num">Margen</th>
                <th class="num">{{ isNew ? 'Stock inicial' : 'Existencia' }}</th><th class="num">Mínimo</th><th>Ubicación</th><th></th>
              </tr></thead>
              <tbody>
                <tr v-for="(v, i) in variants" :key="v.id || 'n' + i" :class="{ 'muted-row': !v.active }">
                  <td v-if="multi" style="width:90px"><input class="input" v-model="v.size" placeholder="Talla" /></td>
                  <td v-if="multi" style="width:120px"><input class="input" v-model="v.color" placeholder="Color" /></td>
                  <td style="min-width:120px"><input class="input mono" v-model="v.sku" placeholder="Automático" /></td>
                  <td style="min-width:140px"><input class="input mono" v-model="v.barcode" :placeholder="autoBarcode ? 'Automático' : 'Escanear'" /></td>
                  <td style="width:105px"><input class="input num" type="number" min="0" step="0.01" v-model="v.cost" placeholder="0.00" /></td>
                  <td style="width:110px"><input class="input num bold" type="number" min="0" step="0.01" v-model="v.price" placeholder="0.00" /></td>
                  <td class="num small" :class="marginOf(v) < 20 ? 'text-warning' : 'text-success'">{{ fmt.pct(marginOf(v), 0) }}</td>
                  <td style="width:110px" class="num">
                    <input v-if="!v.id" class="input num" type="number" min="0" step="1" v-model="v.stock" placeholder="0" />
                    <div v-else class="flex gap-4" style="justify-content:flex-end">
                      <span class="stock-num" :class="v.stock <= 0 ? 'out' : v.stock <= v.min_stock ? 'low' : ''">{{ v.stock }}</span>
                      <button v-if="can('inventory')" type="button" class="btn btn-ghost btn-icon btn-xs" title="Ajustar existencia" @click="adjusting = { ...v, name: form.name }"><icon name="sliders-horizontal" :size="14" /></button>
                    </div>
                  </td>
                  <td style="width:80px"><input class="input num" type="number" min="0" step="1" v-model="v.min_stock" /></td>
                  <td style="width:110px"><input class="input" v-model="v.location" placeholder="Ej. Anaquel 3" /></td>
                  <td class="actions">
                    <button v-if="!v.active" type="button" class="btn btn-ghost btn-xs" @click="v.active = 1" title="Reactivar">Activar</button>
                    <button v-else type="button" class="btn btn-ghost btn-icon btn-sm" title="Quitar" @click="removeVariant(i)" :disabled="!multi && variants.length === 1"><icon name="trash-2" /></button>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="multi && variants.length > 1">
                <tr>
                  <td colspan="4" class="small muted" style="font-weight:600">Aplicar a todas las variantes →</td>
                  <td><div class="flex gap-4"><input class="input num" type="number" v-model="bulk.cost" placeholder="Costo" /><button type="button" class="btn btn-icon btn-xs" @click="applyBulk('cost')" title="Aplicar costo"><icon name="check" :size="13" /></button></div></td>
                  <td><div class="flex gap-4"><input class="input num" type="number" v-model="bulk.price" placeholder="Precio" /><button type="button" class="btn btn-icon btn-xs" @click="applyBulk('price')" title="Aplicar precio"><icon name="check" :size="13" /></button></div></td>
                  <td></td><td class="num">{{ totalStock }}</td>
                  <td><div class="flex gap-4"><input class="input num" type="number" v-model="bulk.min_stock" placeholder="Mín." /><button type="button" class="btn btn-icon btn-xs" @click="applyBulk('min_stock')" title="Aplicar mínimo"><icon name="check" :size="13" /></button></div></td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="card-footer flex flex-wrap">
            <button v-if="multi" type="button" class="btn btn-sm" @click="addVariant"><icon name="plus" /> Agregar variante</button>
            <label class="check small"><input type="checkbox" v-model="autoBarcode" /> Generar código de barras automático a las variantes que no tengan</label>
            <span v-if="!isNew" class="small muted ml-auto"><icon name="info" :size="14" /> Para cambiar existencias usa el botón <icon name="sliders-horizontal" :size="13" /> (queda registrado en el kardex).</span>
          </div>
        </div>
        </fieldset>

        <div class="flex mt-16" v-if="canEdit">
          <button v-if="!isNew" class="btn btn-outline-danger" @click="remove"><icon name="trash-2" /> Eliminar</button>
          <div class="ml-auto flex">
            <a href="#/productos" class="btn">Cancelar</a>
            <button class="btn" :disabled="saving" @click="save(true)"><icon name="copy" /> Guardar y agregar otro</button>
            <button class="btn btn-primary btn-lg" :disabled="saving" @click="save(false)"><icon name="save" /> Guardar producto</button>
          </div>
        </div>
        <adjust-modal v-if="adjusting" :variant="adjusting" @done="afterAdjust" @close="adjusting = null" />
      </div>`,
  };
})();
