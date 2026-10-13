/* Historial de ventas, detalle, reimpresión, cancelaciones y devoluciones. */
(function () {
  'use strict';
  const { ref, reactive, computed, watch, onMounted } = Vue;
  const fmt = App.fmt;

  // ---------------------------------------------------------------------------
  const ReturnModal = {
    props: { sale: Object },
    emits: ['done', 'close'],
    setup(props, { emit }) {
      const lines = reactive(props.sale.items.map((i) => ({ ...i, available: i.quantity - i.returned_qty, qty: 0 })));
      const reason = ref('');
      const method = ref('efectivo');
      const restock = ref(true);
      const saving = ref(false);
      const linesTotal = props.sale.items.reduce((s, i) => s + i.total, 0);
      const factor = linesTotal > 0 ? props.sale.total / linesTotal : 1;
      const estimate = computed(() => App.round2(lines.reduce((s, l) => s + (l.total * (Number(l.qty) || 0) / l.quantity) * factor, 0)));
      const count = computed(() => lines.reduce((s, l) => s + (Number(l.qty) || 0), 0));
      function all() { lines.forEach((l) => { l.qty = l.available; }); }
      async function save() {
        const items = lines.filter((l) => Number(l.qty) > 0).map((l) => ({ sale_item_id: l.id, quantity: Number(l.qty) }));
        if (!items.length) return App.toast('Indica cuántas piezas se devuelven', 'warning');
        if (!reason.value.trim()) return App.toast('Escribe el motivo de la devolución', 'warning');
        saving.value = true;
        try {
          const sale = await App.api.post(`/sales/${props.sale.id}/return`, { items, reason: reason.value, refund_method: method.value, restock: restock.value });
          App.toast('Devolución registrada');
          const ret = sale.returns[sale.returns.length - 1];
          if (ret) App.printReturn(sale, ret);
          App.refreshCash();
          emit('done', sale);
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }
      return { lines, reason, method, restock, saving, estimate, count, all, save, emit, fmt };
    },
    template: `
      <modal :title="'Devolución de ' + sale.folio" icon="rotate-ccw" size="lg" @close="emit('close')">
        <div class="table-wrap card mb-16">
          <table class="table table-sm">
            <thead><tr><th>Producto</th><th class="num">Vendidos</th><th class="num">Ya devueltos</th><th class="num">Pagado</th><th class="num" style="width:120px">Devolver</th></tr></thead>
            <tbody>
              <tr v-for="l in lines" :key="l.id" :class="{ 'muted-row': !l.available }">
                <td><div class="bold">{{ l.name }}</div><div class="tiny muted">{{ l.variant_label || l.sku }}</div></td>
                <td class="num">{{ l.quantity }}</td>
                <td class="num">{{ l.returned_qty }}</td>
                <td class="num">{{ fmt.money(l.total) }}</td>
                <td class="num"><input class="input input-sm num" type="number" min="0" :max="l.available" v-model.number="l.qty" :disabled="!l.available" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="grid grid-2">
          <div class="form-group span-all"><label class="req">Motivo</label>
            <input class="input" v-model="reason" placeholder="Ej. Talla incorrecta, defecto de fábrica…" list="return-reasons" />
            <datalist id="return-reasons"><option>Talla incorrecta</option><option>Defecto de fábrica</option><option>No le gustó al cliente</option><option>Cambio por otro producto</option></datalist>
          </div>
          <div class="form-group"><label>Reembolsar en</label>
            <select class="select" v-model="method"><option value="efectivo">Efectivo (sale de caja)</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="otro">Otro / vale</option></select>
          </div>
          <div class="form-group"><label>&nbsp;</label>
            <label class="switch"><input type="checkbox" v-model="restock" /><span class="track"></span>Regresar piezas al inventario</label>
          </div>
        </div>
        <div v-if="!restock" class="alert alert-warning mt-12"><icon name="info" />Las piezas no regresarán al stock (por ejemplo, si están dañadas).</div>
        <template #footer>
          <button class="btn btn-sm btn-ghost" @click="all">Devolver todo</button>
          <div class="ml-auto flex">
            <span class="muted">Reembolso: <b style="font-size:17px;color:var(--text)">{{ fmt.money(estimate) }}</b></span>
            <button class="btn" @click="emit('close')">Cancelar</button>
            <button class="btn btn-danger" :disabled="saving || !count" @click="save"><icon name="rotate-ccw" /> Registrar devolución</button>
          </div>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  const SaleDetail = {
    components: { ReturnModal },
    props: { saleId: Number },
    emits: ['close', 'changed'],
    setup(props, { emit }) {
      const sale = ref(null);
      const showReturn = ref(false);
      async function load() {
        try { sale.value = await App.api.get('/sales/' + props.saleId); } catch (e) { App.error(e); emit('close'); }
      }
      onMounted(load);
      async function cancel() {
        const reason = await App.prompt({
          title: 'Cancelar venta ' + sale.value.folio,
          message: 'Los productos regresarán al inventario y el importe se descontará de la caja. Esta acción no se puede deshacer.',
          label: 'Motivo de la cancelación', confirmText: 'Cancelar venta', danger: true,
        });
        if (!reason) return;
        try {
          sale.value = await App.api.post(`/sales/${sale.value.id}/cancel`, { reason });
          App.toast('Venta cancelada');
          App.refreshCash();
          emit('changed');
        } catch (e) { App.error(e); }
      }
      function returned(s) { sale.value = s; showReturn.value = false; emit('changed'); }
      const discount = computed(() => sale.value ? sale.value.line_discount + sale.value.global_discount : 0);
      return { sale, showReturn, cancel, returned, discount, emit, fmt, can: App.can };
    },
    template: `
      <modal :title="sale ? 'Venta ' + sale.folio : 'Venta'" icon="receipt" size="lg" @close="emit('close')">
        <loading v-if="!sale" />
        <template v-else>
          <div v-if="sale.status === 'cancelada'" class="alert alert-danger mb-16">
            <icon name="ban" /><div><b>Venta cancelada</b> el {{ fmt.datetime(sale.cancelled_at) }} por {{ sale.cancelled_by_name }}. Motivo: {{ sale.cancel_reason }}</div>
          </div>
          <div class="grid grid-4 mb-16" style="gap:12px">
            <div><div class="muted small">Fecha</div><div class="bold">{{ fmt.datetime(sale.created_at) }}</div></div>
            <div><div class="muted small">Vendedor</div><div class="bold">{{ sale.user_name }}</div></div>
            <div><div class="muted small">Cliente</div><div class="bold">{{ sale.customer_name || 'Público en general' }}</div></div>
            <div><div class="muted small">Pago</div><div class="bold">{{ sale.payments.map(p => fmt.method(p.method)).join(' + ') || '—' }}</div></div>
          </div>
          <div class="card table-wrap mb-16">
            <table class="table table-sm">
              <thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Desc.</th><th class="num">Importe</th></tr></thead>
              <tbody>
                <tr v-for="i in sale.items" :key="i.id">
                  <td><div class="bold">{{ i.name }}</div><div class="tiny muted">{{ i.variant_label ? i.variant_label + ' · ' : '' }}{{ i.sku }}</div>
                    <span v-if="i.returned_qty" class="badge badge-warning mt-4">{{ i.returned_qty }} devuelta(s)</span></td>
                  <td class="num">{{ i.quantity }}</td>
                  <td class="num">{{ fmt.money(i.unit_price) }}</td>
                  <td class="num">{{ i.discount ? '-' + fmt.money(i.discount) : '' }}</td>
                  <td class="num bold">{{ fmt.money(i.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="grid grid-2">
            <div>
              <div class="label mb-8">Pagos</div>
              <div v-for="p in sale.payments" :key="p.id" class="flex between small"><span>{{ fmt.method(p.method) }} <span class="muted" v-if="p.reference">({{ p.reference }})</span></span><span>{{ fmt.money(p.amount) }}</span></div>
              <div v-if="sale.change_amount > 0" class="flex between small muted"><span>Recibido {{ fmt.money(sale.paid) }} · Cambio</span><span>{{ fmt.money(sale.change_amount) }}</span></div>
              <div v-if="sale.notes" class="mt-12 small"><b>Nota:</b> {{ sale.notes }}</div>
            </div>
            <div class="cart-totals" style="border-radius:10px;border:1px solid var(--border)">
              <div class="row" v-if="discount > 0"><span>Importe</span><span>{{ fmt.money(sale.gross) }}</span></div>
              <div class="row discount" v-if="discount > 0"><span>Descuentos</span><span>-{{ fmt.money(discount) }}</span></div>
              <div class="row"><span>Subtotal</span><span>{{ fmt.money(sale.subtotal) }}</span></div>
              <div class="row"><span>IVA {{ sale.tax_rate }}%</span><span>{{ fmt.money(sale.tax) }}</span></div>
              <div class="row total" style="font-size:20px"><span>Total</span><span>{{ fmt.money(sale.total) }}</span></div>
              <div class="row text-danger" v-if="sale.returned_total > 0"><span>Devoluciones</span><span>-{{ fmt.money(sale.returned_total) }}</span></div>
            </div>
          </div>
          <div v-if="sale.returns.length" class="mt-16">
            <div class="label mb-8">Devoluciones</div>
            <div v-for="r in sale.returns" :key="r.id" class="payment-line mb-8">
              <icon name="rotate-ccw" :size="16" />
              <div class="flex-1 small"><b>{{ r.folio }}</b> · {{ fmt.datetime(r.created_at) }} · {{ r.user_name }} · {{ r.reason }}<br>
                <span class="muted">{{ r.items.map(i => i.quantity + '× ' + i.name + (i.variant_label ? ' (' + i.variant_label + ')' : '')).join(', ') }}</span></div>
              <b>{{ fmt.money(r.total) }}</b>
              <button class="btn btn-ghost btn-icon btn-sm" title="Imprimir comprobante" @click="App.printReturn(sale, r)"><icon name="printer" /></button>
            </div>
          </div>
        </template>
        <template #footer v-if="sale">
          <button v-if="can('sales.cancel') && sale.can_cancel" class="btn btn-outline-danger" @click="cancel"><icon name="ban" /> Cancelar venta</button>
          <button v-if="can('sales.cancel') && sale.can_return" class="btn" @click="showReturn = true"><icon name="rotate-ccw" /> Devolución</button>
          <button class="btn btn-primary ml-auto" @click="App.printTicket(sale, { copy: true })"><icon name="printer" /> Reimprimir ticket</button>
        </template>
        <return-modal v-if="showReturn" :sale="sale" @done="returned" @close="showReturn = false" />
      </modal>`,
  };
  App.components.SaleDetail = SaleDetail;

  // ---------------------------------------------------------------------------
  App.views.Sales = {
    components: { SaleDetail },
    setup() {
      const q = App.store.route.query;
      const f = reactive({ from: q.from ?? App.today(), to: q.to ?? App.today(), q: '', status: '', method: '', user_id: '', page: 1 });
      const data = ref(null);
      const loading = ref(false);
      const users = ref([]);
      const detail = ref(q.id ? Number(q.id) : null);

      async function load() {
        loading.value = true;
        try { data.value = await App.api.get('/sales', { ...f, limit: 50 }); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      const reload = () => { f.page = 1; load(); };
      const search = App.debounce(reload, 300);
      watch(() => f.q, search);
      watch(() => f.page, load);
      onMounted(async () => {
        load();
        if (App.can('cash.all') || App.can('reports') || App.can('settings')) {
          try { users.value = await App.api.get('/users'); } catch (e) { /* sin permiso */ }
        }
      });

      async function exportCsv() {
        try {
          const all = await App.api.get('/sales', { ...f, page: 1, limit: 500 });
          App.downloadCsv(`ventas-${f.from || 'todas'}-${f.to || ''}.csv`,
            ['Folio', 'Fecha', 'Cliente', 'Vendedor', 'Artículos', 'Formas de pago', 'Total', 'Devuelto', 'Estado'],
            all.rows.map((s) => [s.folio, s.created_at, s.customer_name || 'Público en general', s.user_name, s.items_count,
              (s.methods || '').split(',').map(fmt.method).join(' + '), s.total, s.returned_total, s.status]));
        } catch (e) { App.error(e); }
      }
      const methods = (s) => (s.methods ? s.methods.split(',').map(fmt.method).join(' + ') : '—');
      return { f, data, loading, users, detail, load, reload, exportCsv, methods, fmt };
    },
    template: `
      <div>
        <div class="stats mb-16" v-if="data">
          <stat-card icon="receipt" label="Ventas" :value="fmt.num(data.summary.completed || 0)" :sub="data.summary.cancelled ? data.summary.cancelled + ' cancelada(s)' : 'en el periodo'" />
          <stat-card icon="circle-dollar-sign" color="green" label="Total vendido" :value="fmt.money(data.summary.amount)" />
          <stat-card icon="rotate-ccw" color="orange" label="Devoluciones" :value="fmt.money(data.summary.returned)" />
          <stat-card icon="wallet" color="teal" label="Venta neta" :value="fmt.money(data.summary.amount - data.summary.returned)" />
        </div>
        <div class="card">
          <div class="toolbar">
            <div class="input-group search"><icon name="search" /><input class="input" v-model="f.q" placeholder="Buscar folio, cliente o producto…" /></div>
            <date-range v-model:from="f.from" v-model:to="f.to" allow-empty @change="reload" />
            <select class="select" style="width:150px" v-model="f.method" @change="reload">
              <option value="">Todo pago</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option>
            </select>
            <select class="select" style="width:140px" v-model="f.status" @change="reload">
              <option value="">Todo estado</option><option value="completada">Completadas</option><option value="cancelada">Canceladas</option>
            </select>
            <select v-if="users.length" class="select" style="width:160px" v-model="f.user_id" @change="reload">
              <option value="">Todo vendedor</option><option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option>
            </select>
            <button class="btn ml-auto" @click="exportCsv"><icon name="download" /> Exportar</button>
          </div>
          <loading v-if="loading && !data" />
          <div v-else-if="data" class="table-wrap">
            <table class="table">
              <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th class="num">Art.</th><th>Pago</th><th class="num">Total</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="s in data.rows" :key="s.id" class="clickable" :class="{ 'muted-row': s.status === 'cancelada' }" @click="detail = s.id">
                  <td class="mono bold">{{ s.folio }}</td>
                  <td class="nowrap">{{ fmt.datetime(s.created_at) }}</td>
                  <td>{{ s.customer_name || 'Público en general' }}</td>
                  <td>{{ s.user_name }}</td>
                  <td class="num">{{ s.items_count }}</td>
                  <td>{{ methods(s) }}</td>
                  <td class="num bold">{{ fmt.money(s.total) }}<div v-if="s.returned_total" class="tiny text-danger">-{{ fmt.money(s.returned_total) }}</div></td>
                  <td>
                    <span v-if="s.status === 'cancelada'" class="badge badge-danger">Cancelada</span>
                    <span v-else-if="s.returned_total >= s.total" class="badge badge-warning">Devuelta</span>
                    <span v-else-if="s.returned_total > 0" class="badge badge-warning">Dev. parcial</span>
                    <span v-else class="badge badge-success">Completada</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <empty v-if="!data.rows.length" icon="receipt" title="No hay ventas" text="No se encontraron ventas con estos filtros." />
          </div>
          <pagination v-if="data" v-model:page="f.page" :total="data.total" :limit="data.limit" />
        </div>
        <sale-detail v-if="detail" :sale-id="detail" @close="detail = null" @changed="load" />
      </div>`,
  };
})();
