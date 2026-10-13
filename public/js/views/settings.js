/* Configuración: datos de la tienda, ticket, usuarios, categorías/marcas y respaldos. */
(function () {
  'use strict';
  const { ref, reactive, computed, onMounted } = Vue;
  const fmt = App.fmt;
  const store = App.store;

  const ROLES = [
    { value: 'admin', label: 'Administrador', desc: 'Acceso total: ventas, inventario, reportes, cancelaciones, usuarios y configuración.' },
    { value: 'cajero', label: 'Cajero', desc: 'Punto de venta, su caja, clientes e historial de ventas. Puede ver productos pero no modificarlos.' },
    { value: 'almacen', label: 'Almacén', desc: 'Productos, ajustes de inventario, conteos, compras y proveedores. No vende.' },
  ];

  // ---------------------------------------------------------------------------
  const StoreTab = {
    setup() {
      const s = reactive({ ...store.settings });
      const saving = ref(false);
      async function save() {
        saving.value = true;
        try {
          store.settings = await App.api.put('/settings', s);
          App.toast('Configuración guardada');
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      const bool = (k) => s[k] === '1';
      const setBool = (k, v) => { s[k] = v ? '1' : '0'; };
      return { s, saving, save, bool, setBool };
    },
    template: `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><h3><icon name="store" /> Datos de la tienda</h3></div>
          <div class="card-body grid grid-2">
            <div class="form-group span-all"><label class="req">Nombre de la tienda</label><input class="input" v-model="s.store_name" /></div>
            <div class="form-group span-all"><label>Eslogan / giro</label><input class="input" v-model="s.store_slogan" placeholder="Natación y Deportes" /></div>
            <div class="form-group span-all"><label>Dirección</label><input class="input" v-model="s.store_address" /></div>
            <div class="form-group"><label>Teléfono</label><input class="input" v-model="s.store_phone" /></div>
            <div class="form-group"><label>Correo</label><input class="input" v-model="s.store_email" /></div>
            <div class="form-group"><label>RFC</label><input class="input" v-model="s.store_tax_id" /></div>
            <div class="form-group"><label>Símbolo de moneda</label><input class="input" v-model="s.currency_symbol" style="width:90px" /></div>
          </div>
        </div>
        <div class="flex-col gap-16">
          <div class="card">
            <div class="card-header"><h3><icon name="percent" /> Impuestos</h3></div>
            <div class="card-body grid grid-2">
              <div class="form-group"><label>Tasa de IVA (%)</label><input class="input num" type="number" min="0" max="100" step="0.01" v-model="s.tax_rate" /></div>
              <div class="form-group"><label>&nbsp;</label><label class="switch"><input type="checkbox" :checked="bool('tax_included')" @change="setBool('tax_included', $event.target.checked)" /><span class="track"></span>Los precios ya incluyen IVA</label></div>
              <p class="span-all small muted">Lo más común en tiendas es que el precio de etiqueta ya incluya IVA. El ticket desglosa el impuesto automáticamente.</p>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3><icon name="shield" /> Reglas de venta e inventario</h3></div>
            <div class="card-body flex-col gap-12">
              <label class="switch"><input type="checkbox" :checked="bool('allow_negative_stock')" @change="setBool('allow_negative_stock', $event.target.checked)" /><span class="track"></span>Permitir vender sin existencias (stock negativo)</label>
              <div class="grid grid-2">
                <div class="form-group"><label>Stock mínimo por defecto</label><input class="input num" type="number" min="0" v-model="s.default_min_stock" /><span class="hint">Para alertas de "por agotarse".</span></div>
                <div class="form-group"><label>Descuento máximo para cajeros (%)</label><input class="input num" type="number" min="0" max="100" v-model="s.max_cashier_discount" /><span class="hint">El administrador no tiene límite.</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="span-all flex"><button class="btn btn-primary btn-lg ml-auto" :disabled="saving" @click="save"><icon name="save" /> Guardar configuración</button></div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  const TicketTab = {
    setup() {
      const s = reactive({ ticket_width: store.settings.ticket_width, ticket_footer: store.settings.ticket_footer, ticket_print_auto: store.settings.ticket_print_auto });
      const saving = ref(false);
      const sample = computed(() => ({
        folio: 'V-000123', created_at: App.nowLocal(), user_name: store.user.name, customer_name: 'Club de Natación Delfines', status: 'completada',
        items: [
          { name: 'Goggles Vanquisher 2.0', variant_label: 'Ahumado', quantity: 1, unit_price: 349, discount: 0, total: 349, returned_qty: 0 },
          { name: 'Gorra de silicón Plain', variant_label: 'Azul', quantity: 2, unit_price: 159, discount: 31.8, total: 286.2, returned_qty: 0 },
        ],
        items_count: 3, gross: 667, line_discount: 31.8, global_discount: 0, subtotal: 547.59, tax: 87.61, tax_rate: Number(store.settings.tax_rate), tax_included: store.settings.tax_included === '1',
        total: 635.2, paid: 700, change_amount: 64.8, payments: [{ method: 'efectivo', amount: 635.2 }], returned_total: 0,
      }));
      const html = computed(() => App.ticketHtml(sample.value, { settings: { ...s } }));
      async function save() {
        saving.value = true;
        try { store.settings = await App.api.put('/settings', s); App.toast('Configuración del ticket guardada'); } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      function testPrint() { App.printHtml(html.value); }
      return { s, saving, html, save, testPrint };
    },
    template: `
      <div class="grid" style="grid-template-columns: minmax(0, 1fr) 360px">
        <div class="card">
          <div class="card-header"><h3><icon name="receipt" /> Ticket de venta</h3></div>
          <div class="card-body flex-col gap-12">
            <div class="form-group"><label>Ancho del papel</label>
              <select class="select" v-model="s.ticket_width" style="max-width:260px"><option value="80">80 mm (estándar)</option><option value="58">58 mm (mini impresora)</option></select></div>
            <div class="form-group"><label>Mensaje al pie del ticket</label><textarea class="textarea" rows="4" v-model="s.ticket_footer"></textarea>
              <span class="hint">Ej. políticas de cambio, redes sociales, horario.</span></div>
            <label class="switch"><input type="checkbox" :checked="s.ticket_print_auto === '1'" @change="s.ticket_print_auto = $event.target.checked ? '1' : '0'" /><span class="track"></span>Imprimir ticket automáticamente al cobrar</label>
            <div class="alert alert-info small"><icon name="info" :size="16" /><div>Para impresoras térmicas, selecciona tu impresora en el diálogo de impresión, desactiva encabezados/pies de página del navegador y usa márgenes "Ninguno". En Chrome puedes activar la impresión silenciosa con la opción <code>--kiosk-printing</code>.</div></div>
            <div class="flex"><button class="btn" @click="testPrint"><icon name="printer" /> Imprimir prueba</button>
              <button class="btn btn-primary ml-auto" :disabled="saving" @click="save"><icon name="save" /> Guardar</button></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3><icon name="eye" /> Vista previa</h3></div>
          <div class="card-body" style="background:var(--surface-2)"><iframe :srcdoc="html" style="width:100%;height:560px;border:1px solid var(--border);border-radius:8px;background:#fff"></iframe></div>
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  const UsersTab = {
    setup() {
      const users = ref([]);
      const editing = ref(null);
      const saving = ref(false);
      async function load() { try { users.value = await App.api.get('/users'); } catch (e) { App.error(e); } }
      onMounted(load);
      function edit(u) { editing.value = reactive(u ? { ...u, password: '' } : { name: '', username: '', password: '', role: 'cajero', active: 1 }); }
      async function save() {
        saving.value = true;
        try {
          const u = editing.value;
          if (u.id) await App.api.put('/users/' + u.id, { name: u.name, role: u.role, active: u.active, password: u.password || undefined });
          else await App.api.post('/users', u);
          App.toast('Usuario guardado');
          editing.value = null;
          load();
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      const roleName = (r) => (ROLES.find((x) => x.value === r) || {}).label || r;
      return { users, editing, saving, edit, save, roleName, ROLES, store, fmt };
    },
    template: `
      <div class="card">
        <div class="card-header"><h3><icon name="users" /> Usuarios del sistema</h3><button class="btn btn-primary ml-auto" @click="edit(null)"><icon name="user-plus" /> Nuevo usuario</button></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th></tr></thead>
          <tbody><tr v-for="u in users" :key="u.id" class="clickable" :class="{ 'muted-row': !u.active }" @click="edit(u)">
            <td><div class="flex"><div class="avatar">{{ fmt.initials(u.name) }}</div><b>{{ u.name }}</b><span v-if="u.id === store.user.id" class="badge badge-info">Tú</span></div></td>
            <td class="mono">{{ u.username }}</td>
            <td><span class="badge" :class="u.role === 'admin' ? 'badge-purple' : u.role === 'cajero' ? 'badge-info' : 'badge-warning'">{{ roleName(u.role) }}</span></td>
            <td><span class="badge" :class="u.active ? 'badge-success' : ''">{{ u.active ? 'Activo' : 'Inactivo' }}</span></td>
            <td class="small">{{ fmt.date(u.created_at) }}</td>
            <td class="actions"><icon name="pencil" class="muted" :size="16" /></td>
          </tr></tbody>
        </table></div>
        <modal v-if="editing" :title="editing.id ? 'Editar usuario' : 'Nuevo usuario'" icon="user" @close="editing = null">
          <div class="grid grid-2">
            <div class="form-group span-all"><label class="req">Nombre completo</label><input class="input" v-model="editing.name" autofocus /></div>
            <div class="form-group"><label class="req">Usuario</label><input class="input" v-model="editing.username" :disabled="!!editing.id" autocomplete="off" placeholder="ej. maria" /></div>
            <div class="form-group"><label :class="{ req: !editing.id }">{{ editing.id ? 'Nueva contraseña' : 'Contraseña' }}</label>
              <input class="input" type="password" v-model="editing.password" autocomplete="new-password" :placeholder="editing.id ? 'Dejar vacío para no cambiar' : 'Mínimo 6 caracteres'" /></div>
            <div class="form-group span-all"><label>Rol</label>
              <div class="flex-col gap-8">
                <label v-for="r in ROLES" :key="r.value" class="payment-line" style="cursor:pointer" :style="editing.role === r.value ? 'border-color:var(--primary-500);background:var(--primary-50)' : ''">
                  <input type="radio" :value="r.value" v-model="editing.role" style="accent-color:var(--primary-600)" />
                  <div><div class="bold">{{ r.label }}</div><div class="tiny muted">{{ r.desc }}</div></div>
                </label>
              </div>
            </div>
            <label v-if="editing.id" class="switch span-all"><input type="checkbox" :checked="editing.active" @change="editing.active = $event.target.checked ? 1 : 0" /><span class="track"></span>Usuario activo (puede iniciar sesión)</label>
          </div>
          <template #footer>
            <button class="btn" @click="editing = null">Cancelar</button>
            <button class="btn btn-primary" :disabled="saving || !editing.name || !editing.username" @click="save"><icon name="save" /> Guardar</button>
          </template>
        </modal>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  const CatalogTab = {
    setup() {
      async function reload() { await App.loadCatalogs(); }
      async function addCategory() {
        const name = await App.prompt({ title: 'Nueva categoría', label: 'Nombre', confirmText: 'Crear' });
        if (!name) return;
        try { await App.api.post('/categories', { name }); await reload(); App.toast('Categoría creada'); } catch (e) { App.error(e); }
      }
      async function updateCategory(c, data) {
        try { await App.api.put('/categories/' + c.id, data); await reload(); } catch (e) { App.error(e); }
      }
      async function renameCategory(c) {
        const name = await App.prompt({ title: 'Renombrar categoría', label: 'Nombre', value: c.name, confirmText: 'Guardar' });
        if (name && name !== c.name) updateCategory(c, { name });
      }
      async function move(i, dir) {
        const list = [...store.categories];
        const j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        try {
          await Promise.all(list.map((c, k) => App.api.put('/categories/' + c.id, { sort_order: k })));
          await reload();
        } catch (e) { App.error(e); }
      }
      async function removeCategory(c) {
        if (!(await App.confirm({ title: 'Eliminar categoría', message: `¿Eliminar "${c.name}"?`, confirmText: 'Eliminar', danger: true }))) return;
        try { await App.api.del('/categories/' + c.id); await reload(); App.toast('Categoría eliminada'); } catch (e) { App.error(e); }
      }
      async function addBrand() {
        const name = await App.prompt({ title: 'Nueva marca', label: 'Nombre', confirmText: 'Crear' });
        if (!name) return;
        try { await App.api.post('/brands', { name }); await reload(); App.toast('Marca creada'); } catch (e) { App.error(e); }
      }
      async function renameBrand(b) {
        const name = await App.prompt({ title: 'Renombrar marca', label: 'Nombre', value: b.name, confirmText: 'Guardar' });
        if (!name || name === b.name) return;
        try { await App.api.put('/brands/' + b.id, { name }); await reload(); } catch (e) { App.error(e); }
      }
      async function removeBrand(b) {
        if (!(await App.confirm({ title: 'Eliminar marca', message: `¿Eliminar "${b.name}"?`, confirmText: 'Eliminar', danger: true }))) return;
        try { await App.api.del('/brands/' + b.id); await reload(); App.toast('Marca eliminada'); } catch (e) { App.error(e); }
      }
      return { store, addCategory, updateCategory, renameCategory, move, removeCategory, addBrand, renameBrand, removeBrand };
    },
    template: `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><h3><icon name="layout-grid" /> Categorías</h3><button class="btn btn-sm btn-primary ml-auto" @click="addCategory"><icon name="plus" /> Nueva</button></div>
          <div class="table-wrap"><table class="table table-sm">
            <thead><tr><th>Color</th><th>Nombre</th><th class="num">Productos</th><th></th></tr></thead>
            <tbody><tr v-for="(c, i) in store.categories" :key="c.id">
              <td style="width:60px"><input type="color" :value="c.color" @change="updateCategory(c, { color: $event.target.value })" style="width:34px;height:28px;border:0;background:none;cursor:pointer" title="Cambiar color" /></td>
              <td class="bold">{{ c.name }}</td>
              <td class="num">{{ c.product_count }}</td>
              <td class="actions">
                <button class="btn btn-ghost btn-icon btn-xs" @click="move(i, -1)" :disabled="i === 0" title="Subir"><icon name="arrow-up" :size="14" /></button>
                <button class="btn btn-ghost btn-icon btn-xs" @click="move(i, 1)" :disabled="i === store.categories.length - 1" title="Bajar"><icon name="arrow-down" :size="14" /></button>
                <button class="btn btn-ghost btn-icon btn-xs" @click="renameCategory(c)" title="Renombrar"><icon name="pencil" :size="14" /></button>
                <button class="btn btn-ghost btn-icon btn-xs" @click="removeCategory(c)" title="Eliminar"><icon name="trash-2" :size="14" /></button>
              </td>
            </tr></tbody>
          </table></div>
          <div class="card-footer small muted">El orden y color se usan en el punto de venta.</div>
        </div>
        <div class="card">
          <div class="card-header"><h3><icon name="tags" /> Marcas</h3><button class="btn btn-sm btn-primary ml-auto" @click="addBrand"><icon name="plus" /> Nueva</button></div>
          <div class="table-wrap" style="max-height:520px"><table class="table table-sm">
            <thead><tr><th>Marca</th><th class="num">Productos</th><th></th></tr></thead>
            <tbody><tr v-for="b in store.brands" :key="b.id">
              <td class="bold">{{ b.name }}</td><td class="num">{{ b.product_count }}</td>
              <td class="actions">
                <button class="btn btn-ghost btn-icon btn-xs" @click="renameBrand(b)" title="Renombrar"><icon name="pencil" :size="14" /></button>
                <button class="btn btn-ghost btn-icon btn-xs" @click="removeBrand(b)" title="Eliminar"><icon name="trash-2" :size="14" /></button>
              </td>
            </tr></tbody>
          </table><empty v-if="!store.brands.length" icon="tags" title="Sin marcas" text="Se crean automáticamente al registrar productos." /></div>
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  const DataTab = {
    setup() {
      const importing = ref(false);
      const result = ref(null);
      const updateStock = ref(false);
      const autoBarcode = ref(true);
      const csvInput = ref(null);
      const dbInput = ref(null);
      const seeding = ref(false);

      async function importCsv(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        importing.value = true;
        result.value = null;
        try {
          const text = await file.text();
          result.value = await App.api.post('/import/products', { csv: text, update_stock: updateStock.value, auto_barcode: autoBarcode.value });
          await App.loadCatalogs();
          App.toast('Importación terminada');
        } catch (err) { App.error(err); } finally { importing.value = false; }
      }
      async function restore(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!(await App.confirm({
          title: 'Restaurar respaldo',
          message: `Se reemplazará TODA la información actual por la del archivo "${file.name}".\n\nAntes de restaurar se guardará automáticamente una copia de la base actual en la carpeta data/respaldos.`,
          confirmText: 'Restaurar', danger: true,
        }))) return;
        try {
          await App.api.post('/backup/restore', await file.arrayBuffer());
          App.toast('Respaldo restaurado. Inicia sesión de nuevo.');
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) { App.error(err); }
      }
      async function loadDemo() {
        if (!(await App.confirm({ title: 'Cargar datos de demostración', message: 'Se agregarán productos, clientes y ventas de ejemplo. Solo funciona si no hay productos registrados.', confirmText: 'Cargar', icon: 'sparkles' }))) return;
        seeding.value = true;
        try { await App.api.post('/demo', { with_sales: true }); await App.loadCatalogs(); App.toast('Datos de demostración cargados'); } catch (err) { App.error(err); } finally { seeding.value = false; }
      }
      return { importing, result, updateStock, autoBarcode, csvInput, dbInput, seeding, importCsv, restore, loadDemo };
    },
    template: `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><h3><icon name="database" /> Respaldo de la información</h3></div>
          <div class="card-body flex-col gap-12">
            <p>Descarga un respaldo completo (productos, ventas, clientes, usuarios, imágenes). <b>Te recomendamos hacerlo al menos una vez por semana</b> y guardarlo en una USB o en la nube.</p>
            <a href="/api/backup" class="btn btn-primary" download><icon name="download" /> Descargar respaldo</a>
            <div class="divider"></div>
            <p class="small muted">¿Cambiaste de computadora o necesitas recuperar información? Restaura un archivo de respaldo (.db).</p>
            <button class="btn btn-outline-danger" @click="dbInput.click()"><icon name="upload" /> Restaurar respaldo…</button>
            <input ref="dbInput" type="file" accept=".db,.sqlite,application/octet-stream" class="hidden" @change="restore" />
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3><icon name="file-spreadsheet" /> Importar / exportar productos (Excel)</h3></div>
          <div class="card-body flex-col gap-12">
            <p>Carga muchos productos a la vez desde un archivo <b>CSV</b> (en Excel: <i>Guardar como → CSV UTF-8</i>). Las filas con el mismo nombre y marca se agrupan como tallas/colores de un mismo producto.</p>
            <div class="flex flex-wrap">
              <a href="/api/import/template.csv" class="btn btn-sm"><icon name="download" /> Descargar plantilla</a>
              <a href="/api/export/products.csv" class="btn btn-sm"><icon name="download" /> Exportar catálogo actual</a>
            </div>
            <label class="check small"><input type="checkbox" v-model="autoBarcode" /> Generar códigos de barras para productos que no tengan</label>
            <label class="check small"><input type="checkbox" v-model="updateStock" /> Si el SKU ya existe, actualizar también la existencia</label>
            <button class="btn btn-primary" :disabled="importing" @click="csvInput.click()"><icon name="upload" /> {{ importing ? 'Importando…' : 'Importar archivo CSV' }}</button>
            <input ref="csvInput" type="file" accept=".csv,text/csv,.txt" class="hidden" @change="importCsv" />
            <div v-if="result" class="alert" :class="result.errors.length ? 'alert-warning' : 'alert-success'">
              <icon :name="result.errors.length ? 'triangle-alert' : 'circle-check'" />
              <div>
                <b>{{ result.created_products }}</b> productos nuevos, <b>{{ result.created_variants }}</b> variantes nuevas, <b>{{ result.updated_variants }}</b> actualizadas.
                <div v-if="result.errors.length" class="mt-4"><b>{{ result.errors.length }} fila(s) con error:</b>
                  <div v-for="e in result.errors.slice(0, 10)" :key="e.line" class="tiny">Línea {{ e.line }}: {{ e.message }}</div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card span-all">
          <div class="card-header"><h3><icon name="sparkles" /> Datos de demostración</h3></div>
          <div class="card-body flex flex-wrap">
            <p class="flex-1 muted" style="min-width:260px;margin:0">Carga un catálogo de ejemplo de una tienda de natación (trajes de baño, goggles, gorras, aletas, ropa y calzado) con ventas de las últimas semanas para practicar. Solo disponible cuando no hay productos.</p>
            <button class="btn btn-light" :disabled="seeding" @click="loadDemo"><icon name="sparkles" /> Cargar ejemplo</button>
          </div>
        </div>
      </div>`,
  };

  App.views.Settings = {
    components: { StoreTab, TicketTab, UsersTab, CatalogTab, DataTab },
    setup() {
      const tab = ref(store.route.query.tab || 'tienda');
      function setTab(t) { tab.value = t; App.setQuery({ tab: t }); }
      return { tab, setTab };
    },
    template: `
      <div>
        <div class="tabs">
          <button class="tab" :class="{ active: tab === 'tienda' }" @click="setTab('tienda')"><icon name="store" :size="16" /> Tienda</button>
          <button class="tab" :class="{ active: tab === 'ticket' }" @click="setTab('ticket')"><icon name="receipt" :size="16" /> Ticket</button>
          <button class="tab" :class="{ active: tab === 'usuarios' }" @click="setTab('usuarios')"><icon name="users" :size="16" /> Usuarios</button>
          <button class="tab" :class="{ active: tab === 'catalogos' }" @click="setTab('catalogos')"><icon name="tags" :size="16" /> Categorías y marcas</button>
          <button class="tab" :class="{ active: tab === 'datos' }" @click="setTab('datos')"><icon name="database" :size="16" /> Respaldo e importación</button>
        </div>
        <store-tab v-if="tab === 'tienda'" />
        <ticket-tab v-else-if="tab === 'ticket'" />
        <users-tab v-else-if="tab === 'usuarios'" />
        <catalog-tab v-else-if="tab === 'catalogos'" />
        <data-tab v-else />
      </div>`,
  };
})();
