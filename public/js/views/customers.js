/* Clientes: directorio, historial de compras y datos de contacto. */
(function () {
  'use strict';
  const { ref, reactive, watch, onMounted } = Vue;
  const fmt = App.fmt;

  const CustomerForm = {
    props: { customer: Object },
    emits: ['saved', 'close'],
    setup(props, { emit }) {
      const f = reactive({ name: '', phone: '', email: '', tax_id: '', address: '', notes: '', ...(props.customer || {}) });
      const saving = ref(false);
      async function save() {
        saving.value = true;
        try {
          const c = props.customer && props.customer.id ? await App.api.put('/customers/' + props.customer.id, f) : await App.api.post('/customers', f);
          App.toast('Cliente guardado');
          emit('saved', c);
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      return { f, saving, save, emit };
    },
    template: `
      <modal :title="customer && customer.id ? 'Editar cliente' : 'Nuevo cliente'" icon="user" @close="emit('close')">
        <div class="grid grid-2">
          <div class="form-group span-all"><label class="req">Nombre</label><input class="input" v-model="f.name" autofocus placeholder="Nombre completo, club o escuela" /></div>
          <div class="form-group"><label>Teléfono</label><input class="input" v-model="f.phone" /></div>
          <div class="form-group"><label>Correo electrónico</label><input class="input" type="email" v-model="f.email" /></div>
          <div class="form-group"><label>RFC / ID fiscal</label><input class="input" v-model="f.tax_id" /></div>
          <div class="form-group"><label>Dirección</label><input class="input" v-model="f.address" /></div>
          <div class="form-group span-all"><label>Notas</label><textarea class="textarea" v-model="f.notes" placeholder="Tallas preferidas, club, preferencias…"></textarea></div>
        </div>
        <template #footer>
          <button class="btn" @click="emit('close')">Cancelar</button>
          <button class="btn btn-primary" :disabled="saving || !f.name" @click="save"><icon name="save" /> Guardar</button>
        </template>
      </modal>`,
  };

  App.views.Customers = {
    components: { CustomerForm },
    setup() {
      const f = reactive({ q: '', sort: '', page: 1 });
      const data = ref(null);
      const loading = ref(false);
      const editing = ref(null);
      const detail = ref(null);
      const sale = ref(null);
      async function load() {
        loading.value = true;
        try { data.value = await App.api.get('/customers', { ...f, limit: 50 }); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      const reload = () => { if (f.page !== 1) f.page = 1; else load(); };
      watch(() => f.q, App.debounce(reload, 300));
      watch(() => f.sort, reload);
      watch(() => f.page, load);
      onMounted(load);
      async function open(c) {
        try { detail.value = await App.api.get('/customers/' + c.id); } catch (e) { App.error(e); }
      }
      function saved(c) {
        editing.value = null;
        load();
        if (detail.value && detail.value.id === c.id) open(c);
      }
      async function remove(c) {
        if (!(await App.confirm({ title: 'Eliminar cliente', message: `¿Eliminar a "${c.name}"? Si tiene compras se conservará su historial y solo se ocultará.`, confirmText: 'Eliminar', danger: true }))) return;
        try {
          await App.api.del('/customers/' + c.id);
          App.toast('Cliente eliminado');
          detail.value = null;
          load();
        } catch (e) { App.error(e); }
      }
      function exportCsv() {
        App.api.get('/customers', { ...f, page: 1, limit: 500 }).then((all) => App.downloadCsv('clientes.csv',
          ['Nombre', 'Teléfono', 'Correo', 'RFC', 'Dirección', 'Compras', 'Total comprado', 'Última compra', 'Notas'],
          all.rows.map((c) => [c.name, c.phone, c.email, c.tax_id, c.address, c.purchases, c.total_spent, c.last_purchase, c.notes]))).catch(App.error);
      }
      return { f, data, loading, editing, detail, sale, load, open, saved, remove, exportCsv, fmt };
    },
    template: `
      <div>
        <div class="card">
          <div class="toolbar">
            <div class="input-group search"><icon name="search" /><input class="input" v-model="f.q" placeholder="Buscar por nombre, teléfono, correo o RFC…" /></div>
            <select class="select" style="width:180px" v-model="f.sort"><option value="">Orden alfabético</option><option value="top">Mejores clientes</option><option value="recent">Compra más reciente</option></select>
            <div class="ml-auto flex">
              <button class="btn" @click="exportCsv"><icon name="download" /> Exportar</button>
              <button class="btn btn-primary" @click="editing = {}"><icon name="user-plus" /> Nuevo cliente</button>
            </div>
          </div>
          <loading v-if="loading && !data" />
          <div v-else-if="data" class="table-wrap">
            <table class="table">
              <thead><tr><th>Cliente</th><th>Contacto</th><th class="num">Compras</th><th class="num">Total comprado</th><th>Última compra</th><th></th></tr></thead>
              <tbody>
                <tr v-for="c in data.rows" :key="c.id" class="clickable" @click="open(c)">
                  <td><div class="flex"><div class="avatar">{{ fmt.initials(c.name) }}</div><div><div class="bold">{{ c.name }}</div><div class="tiny muted" v-if="c.tax_id">RFC {{ c.tax_id }}</div></div></div></td>
                  <td class="small">{{ c.phone || '' }}<div class="muted" v-if="c.email">{{ c.email }}</div></td>
                  <td class="num">{{ c.purchases }}</td>
                  <td class="num bold">{{ fmt.money(c.total_spent) }}</td>
                  <td class="small">{{ c.last_purchase ? fmt.relative(c.last_purchase) : '—' }}</td>
                  <td class="actions" @click.stop><button class="btn btn-ghost btn-icon btn-sm" title="Editar" @click="editing = c"><icon name="pencil" /></button></td>
                </tr>
              </tbody>
            </table>
            <empty v-if="!data.rows.length" icon="users" title="Sin clientes" text="Registra a tus clientes frecuentes, clubes y escuelas de natación para conocer su historial.">
              <button class="btn btn-primary" @click="editing = {}"><icon name="user-plus" /> Nuevo cliente</button>
            </empty>
          </div>
          <pagination v-if="data" v-model:page="f.page" :total="data.total" :limit="data.limit" />
        </div>

        <modal v-if="detail" :title="detail.name" icon="user" size="lg" @close="detail = null">
          <div class="stats mb-16">
            <stat-card icon="receipt" label="Compras" :value="fmt.num(detail.purchases)" />
            <stat-card icon="circle-dollar-sign" color="green" label="Total comprado" :value="fmt.money(detail.total_spent)" />
            <stat-card icon="clock" color="purple" label="Última compra" :value="detail.last_purchase ? fmt.relative(detail.last_purchase) : '—'" />
          </div>
          <div class="grid grid-2 mb-16 small">
            <div><span class="muted">Teléfono:</span> {{ detail.phone || '—' }}</div>
            <div><span class="muted">Correo:</span> {{ detail.email || '—' }}</div>
            <div><span class="muted">RFC:</span> {{ detail.tax_id || '—' }}</div>
            <div><span class="muted">Dirección:</span> {{ detail.address || '—' }}</div>
            <div class="span-all" v-if="detail.notes"><span class="muted">Notas:</span> {{ detail.notes }}</div>
          </div>
          <div v-if="detail.top_products.length" class="mb-16">
            <div class="label mb-8">Productos favoritos</div>
            <div class="flex flex-wrap"><span v-for="p in detail.top_products" :key="p.name" class="badge badge-info">{{ p.name }} · {{ p.units }}</span></div>
          </div>
          <div class="label mb-8">Historial de compras</div>
          <div class="card table-wrap" style="max-height:300px">
            <table class="table table-sm">
              <thead><tr><th>Folio</th><th>Fecha</th><th class="num">Artículos</th><th class="num">Total</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="s in detail.sales" :key="s.id" class="clickable" @click="sale = s.id">
                  <td class="mono">{{ s.folio }}</td><td>{{ fmt.datetime(s.created_at) }}</td><td class="num">{{ s.items_count }}</td><td class="num bold">{{ fmt.money(s.total) }}</td>
                  <td><span class="badge" :class="s.status === 'cancelada' ? 'badge-danger' : 'badge-success'">{{ s.status === 'cancelada' ? 'Cancelada' : 'Completada' }}</span></td>
                </tr>
              </tbody>
            </table>
            <empty v-if="!detail.sales.length" icon="receipt" title="Aún no tiene compras" />
          </div>
          <template #footer>
            <button class="btn btn-outline-danger" @click="remove(detail)"><icon name="trash-2" /> Eliminar</button>
            <button class="btn btn-primary ml-auto" @click="editing = detail"><icon name="pencil" /> Editar</button>
          </template>
        </modal>
        <customer-form v-if="editing" :customer="editing" @saved="saved" @close="editing = null" />
        <sale-detail v-if="sale" :sale-id="sale" @close="sale = null" />
      </div>`,
  };
})();
