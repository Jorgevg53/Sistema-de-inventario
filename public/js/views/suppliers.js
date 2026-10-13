/* Proveedores: directorio y resumen de compras. */
(function () {
  'use strict';
  const { ref, reactive, watch, onMounted } = Vue;
  const fmt = App.fmt;

  App.views.Suppliers = {
    setup() {
      const q = ref('');
      const showAll = ref(false);
      const rows = ref(null);
      const editing = ref(null);
      const saving = ref(false);
      async function load() {
        try { rows.value = await App.api.get('/suppliers', { q: q.value, active: showAll.value ? 'all' : '' }); } catch (e) { App.error(e); }
      }
      watch(q, App.debounce(load, 300));
      watch(showAll, load);
      onMounted(load);
      function edit(s) {
        editing.value = reactive({ name: '', contact: '', phone: '', email: '', address: '', tax_id: '', notes: '', active: 1, ...(s || {}) });
      }
      async function save() {
        saving.value = true;
        try {
          const s = editing.value;
          if (s.id) await App.api.put('/suppliers/' + s.id, s);
          else await App.api.post('/suppliers', s);
          App.toast('Proveedor guardado');
          editing.value = null;
          load();
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      async function remove(s) {
        if (!(await App.confirm({ title: 'Eliminar proveedor', message: `¿Eliminar "${s.name}"? Si tiene compras o productos asociados solo se desactivará.`, confirmText: 'Eliminar', danger: true }))) return;
        try {
          const r = await App.api.del('/suppliers/' + s.id);
          App.toast(r.deactivated ? 'Proveedor desactivado' : 'Proveedor eliminado');
          editing.value = null;
          load();
        } catch (e) { App.error(e); }
      }
      return { q, showAll, rows, editing, saving, edit, save, remove, fmt };
    },
    template: `
      <div class="card">
        <div class="toolbar">
          <div class="input-group search"><icon name="search" /><input class="input" v-model="q" placeholder="Buscar proveedor, contacto, teléfono…" /></div>
          <label class="check small"><input type="checkbox" v-model="showAll" /> Mostrar inactivos</label>
          <button class="btn btn-primary ml-auto" @click="edit(null)"><icon name="plus" /> Nuevo proveedor</button>
        </div>
        <loading v-if="!rows" />
        <div v-else class="table-wrap">
          <table class="table">
            <thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono / correo</th><th class="num">Productos</th><th class="num">Compras</th><th class="num">Total comprado</th><th>Última compra</th><th></th></tr></thead>
            <tbody>
              <tr v-for="s in rows" :key="s.id" class="clickable" :class="{ 'muted-row': !s.active }" @click="edit(s)">
                <td><div class="bold">{{ s.name }}</div><div class="tiny muted" v-if="s.tax_id">RFC {{ s.tax_id }}</div></td>
                <td>{{ s.contact || '—' }}</td>
                <td class="small">{{ s.phone || '' }}<div class="muted">{{ s.email || '' }}</div></td>
                <td class="num"><a :href="'#/productos?supplier_id=' + s.id" @click.stop>{{ s.product_count }}</a></td>
                <td class="num">{{ s.purchase_count }}</td>
                <td class="num bold">{{ fmt.money(s.purchase_total) }}</td>
                <td class="small">{{ s.last_purchase ? fmt.date(s.last_purchase) : '—' }}</td>
                <td class="actions"><icon name="chevron-right" class="muted" /></td>
              </tr>
            </tbody>
          </table>
          <empty v-if="!rows.length" icon="contact" title="Sin proveedores" text="Registra a tus proveedores para asociarlos a productos y entradas de mercancía.">
            <button class="btn btn-primary" @click="edit(null)"><icon name="plus" /> Nuevo proveedor</button>
          </empty>
        </div>

        <modal v-if="editing" :title="editing.id ? 'Editar proveedor' : 'Nuevo proveedor'" icon="contact" @close="editing = null">
          <div class="grid grid-2">
            <div class="form-group span-all"><label class="req">Nombre o razón social</label><input class="input" v-model="editing.name" autofocus /></div>
            <div class="form-group"><label>Persona de contacto</label><input class="input" v-model="editing.contact" /></div>
            <div class="form-group"><label>RFC</label><input class="input" v-model="editing.tax_id" /></div>
            <div class="form-group"><label>Teléfono</label><input class="input" v-model="editing.phone" /></div>
            <div class="form-group"><label>Correo</label><input class="input" type="email" v-model="editing.email" /></div>
            <div class="form-group span-all"><label>Dirección</label><input class="input" v-model="editing.address" /></div>
            <div class="form-group span-all"><label>Notas</label><textarea class="textarea" v-model="editing.notes" placeholder="Días de entrega, condiciones de pago, marcas que maneja…"></textarea></div>
            <label v-if="editing.id" class="switch span-all"><input type="checkbox" :checked="editing.active" @change="editing.active = $event.target.checked ? 1 : 0" /><span class="track"></span>Proveedor activo</label>
          </div>
          <template #footer>
            <button v-if="editing.id" class="btn btn-outline-danger" @click="remove(editing)"><icon name="trash-2" /> Eliminar</button>
            <button class="btn ml-auto" @click="editing = null">Cancelar</button>
            <button class="btn btn-primary" :disabled="saving || !editing.name" @click="save"><icon name="save" /> Guardar</button>
          </template>
        </modal>
      </div>`,
  };
})();
