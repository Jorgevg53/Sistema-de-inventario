/* Panel de inicio: resumen del día, alertas de inventario y accesos rápidos. */
(function () {
  'use strict';
  const { ref, computed, onMounted } = Vue;

  App.views.Dashboard = {
    setup() {
      const d = ref(null);
      const loading = ref(true);
      const seeding = ref(false);
      const store = App.store;

      async function load() {
        try { d.value = await App.api.get('/dashboard'); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      onMounted(load);

      const trend = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
      const greeting = computed(() => {
        const h = new Date().getHours();
        return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
      });
      const chart = computed(() => {
        if (!d.value || !d.value.last_30) return null;
        const rows = d.value.last_30;
        return {
          labels: rows.map((r) => r.date.slice(8, 10) + '/' + r.date.slice(5, 7)),
          datasets: [{ label: 'Ventas', data: rows.map((r) => r.total), backgroundColor: '#38bdf8', hoverBackgroundColor: '#0284c7', borderRadius: 5, maxBarThickness: 28 }],
        };
      });
      const maxTop = computed(() => Math.max(1, ...((d.value && d.value.top_products) || []).map((p) => p.units)));

      async function loadDemo() {
        if (!(await App.confirm({
          title: 'Cargar datos de demostración',
          message: 'Se agregarán productos de ejemplo de natación y deportes, clientes y ventas de las últimas semanas para que explores el sistema.\n\nPuedes restaurar un respaldo o empezar de cero después.',
          confirmText: 'Cargar ejemplo', icon: 'sparkles',
        }))) return;
        seeding.value = true;
        try {
          await App.api.post('/demo', { with_sales: true });
          await App.loadCatalogs();
          App.toast('Datos de demostración cargados');
          loading.value = true;
          await load();
        } catch (e) { App.error(e); } finally { seeding.value = false; }
      }

      return { d, loading, seeding, store, trend, greeting, chart, maxTop, loadDemo, fmt: App.fmt, can: App.can };
    },
    template: `
      <loading v-if="loading" />
      <div v-else-if="d">
        <div class="page-head">
          <div>
            <h1>{{ greeting }}, {{ store.user.name.split(' ')[0] }} 👋</h1>
            <div class="sub">Este es el resumen de tu tienda para hoy.</div>
          </div>
          <div class="ml-auto flex flex-wrap">
            <a v-if="can('products.edit')" href="#/productos/nuevo" class="btn"><icon name="package-plus" /> Nuevo producto</a>
            <a v-if="can('purchases')" href="#/compras/nueva" class="btn"><icon name="truck" /> Entrada de mercancía</a>
            <a v-if="can('pos')" href="#/pos" class="btn btn-primary"><icon name="shopping-cart" /> Vender</a>
          </div>
        </div>

        <div v-if="d.stock.products === 0" class="card mb-16" style="border-color:#bae6fd;background:linear-gradient(135deg,#f0f9ff,#fff)">
          <div class="card-body flex gap-16 flex-wrap">
            <div class="stat-icon" style="width:56px;height:56px;border-radius:14px;background:#e0f2fe;color:#0284c7;display:grid;place-items:center"><icon name="sparkles" :size="28" /></div>
            <div class="flex-1" style="min-width:240px">
              <h2>¡Bienvenido! Tu tienda aún no tiene productos</h2>
              <p class="muted mt-4">Empieza agregando tus productos uno por uno, impórtalos desde una hoja de Excel (CSV) o carga datos de ejemplo para conocer el sistema.</p>
            </div>
            <div class="flex flex-wrap">
              <a v-if="can('products.edit')" href="#/productos/nuevo" class="btn btn-primary"><icon name="plus" /> Agregar producto</a>
              <a v-if="can('settings')" href="#/configuracion?tab=datos" class="btn"><icon name="file-spreadsheet" /> Importar CSV</a>
              <button v-if="can('settings')" class="btn btn-light" :disabled="seeding" @click="loadDemo"><icon name="sparkles" /> {{ seeding ? 'Cargando…' : 'Datos de ejemplo' }}</button>
            </div>
          </div>
        </div>

        <div class="stats mb-16" v-if="d.today_sales">
          <stat-card icon="circle-dollar-sign" color="green" label="Ventas de hoy" :value="fmt.money(d.today_sales.net)"
            :trend="trend(d.today_sales.net, d.yesterday_sales.net)" :sub="'vs ayer ' + fmt.money(d.yesterday_sales.net)" />
          <stat-card icon="receipt" label="Tickets de hoy" :value="fmt.num(d.today_sales.count)" :sub="'Ticket promedio ' + fmt.money(d.today_sales.avg_ticket)" />
          <stat-card v-if="d.show_profit" icon="trending-up" color="teal" label="Utilidad de hoy" :value="fmt.money(d.today_sales.profit)" :sub="'Margen ' + fmt.pct(d.today_sales.margin)" />
          <stat-card v-else icon="user" color="teal" label="Mis ventas de hoy" :value="fmt.money(d.my_today.net)" :sub="d.my_today.count + ' ticket(s)'" />
          <stat-card icon="calendar" color="purple" label="Ventas del mes" :value="fmt.money(d.month_sales.net)" :sub="d.month_sales.count + ' tickets · ' + d.month_sales.units + ' artículos'" />
        </div>

        <div class="grid" style="grid-template-columns: minmax(0, 2fr) minmax(0, 1fr)" :class="{ 'grid-2': false }">
          <div class="flex-col gap-16" style="min-width:0">
            <div class="card" v-if="chart">
              <div class="card-header"><h3><icon name="chart-column" /> Ventas de los últimos 30 días</h3>
                <a v-if="can('reports')" href="#/reportes" class="btn btn-sm btn-ghost ml-auto">Ver reportes <icon name="chevron-right" :size="15" /></a></div>
              <div class="card-body"><chart type="bar" :labels="chart.labels" :datasets="chart.datasets" money /></div>
            </div>

            <div class="card" v-if="d.recent_sales">
              <div class="card-header"><h3><icon name="receipt" /> Últimas ventas</h3>
                <a href="#/ventas" class="btn btn-sm btn-ghost ml-auto">Ver todas <icon name="chevron-right" :size="15" /></a></div>
              <div class="table-wrap">
                <table class="table">
                  <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th class="num">Total</th></tr></thead>
                  <tbody>
                    <tr v-for="s in d.recent_sales" :key="s.id" class="clickable" @click="App.go('/ventas?id=' + s.id)">
                      <td class="mono">{{ s.folio }}</td>
                      <td class="nowrap">{{ fmt.relative(s.created_at) }}</td>
                      <td>{{ s.customer_name || 'Público en general' }}</td>
                      <td>{{ s.user_name }}</td>
                      <td class="num bold">
                        <span v-if="s.status === 'cancelada'" class="badge badge-danger">Cancelada</span>
                        <template v-else>{{ fmt.money(s.total) }}</template>
                      </td>
                    </tr>
                    <tr v-if="!d.recent_sales.length"><td colspan="5"><empty icon="receipt" title="Sin ventas todavía" /></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="flex-col gap-16" style="min-width:0">
            <div class="card" v-if="d.cash !== undefined">
              <div class="card-header"><h3><icon name="wallet" /> Mi caja</h3>
                <span class="badge ml-auto" :class="d.cash ? 'badge-success' : 'badge-warning'">{{ d.cash ? 'Abierta' : 'Cerrada' }}</span></div>
              <div class="card-body">
                <template v-if="d.cash">
                  <div class="flex between"><span class="muted">Abierta</span><span>{{ fmt.datetime(d.cash.opened_at) }}</span></div>
                  <div class="flex between mt-4"><span class="muted">Ventas del turno</span><span>{{ d.cash.sales.count }} · {{ fmt.money(d.cash.sales.total) }}</span></div>
                  <div class="flex between mt-4"><span class="muted">Efectivo esperado</span><span class="bold">{{ fmt.money(d.cash.expected_cash) }}</span></div>
                  <a href="#/caja" class="btn btn-block mt-12"><icon name="calculator" /> Ver caja / hacer corte</a>
                </template>
                <template v-else>
                  <p class="muted">Abre tu caja con el fondo inicial para empezar a vender.</p>
                  <a href="#/caja" class="btn btn-primary btn-block"><icon name="wallet" /> Abrir caja</a>
                </template>
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h3><icon name="package" /> Inventario</h3></div>
              <div class="card-body">
                <div class="grid grid-2" style="gap:10px">
                  <div><div class="muted small">Productos</div><div class="bold" style="font-size:20px">{{ fmt.num(d.stock.products) }}</div></div>
                  <div><div class="muted small">Piezas en stock</div><div class="bold" style="font-size:20px">{{ fmt.num(d.stock.units) }}</div></div>
                  <a href="#/productos?stock=low" style="color:inherit"><div class="muted small">Stock bajo</div><div class="bold text-warning" style="font-size:20px">{{ fmt.num(d.stock.low) }}</div></a>
                  <a href="#/productos?stock=out" style="color:inherit"><div class="muted small">Agotados</div><div class="bold text-danger" style="font-size:20px">{{ fmt.num(d.stock.out) }}</div></a>
                  <template v-if="d.stock.cost_value !== undefined">
                    <div><div class="muted small">Valor a costo</div><div class="bold">{{ fmt.money(d.stock.cost_value) }}</div></div>
                    <div><div class="muted small">Valor a precio venta</div><div class="bold">{{ fmt.money(d.stock.price_value) }}</div></div>
                  </template>
                </div>
              </div>
            </div>

            <div class="card" v-if="d.low_stock.length">
              <div class="card-header"><h3><icon name="triangle-alert" style="color:var(--warning)" /> Por agotarse</h3>
                <a href="#/productos?stock=low" class="btn btn-sm btn-ghost ml-auto">Ver todo</a></div>
              <div>
                <a v-for="v in d.low_stock" :key="v.variant_id" :href="'#/productos/' + v.product_id" class="list-item" style="color:inherit;text-decoration:none">
                  <div class="flex-1" style="min-width:0">
                    <div class="bold ellipsis small">{{ v.name }}</div>
                    <div class="tiny muted">{{ fmt.variant(v) || 'Única' }} · mínimo {{ v.min_stock }}</div>
                  </div>
                  <span class="badge" :class="v.stock <= 0 ? 'badge-danger' : 'badge-warning'">{{ v.stock <= 0 ? 'Agotado' : v.stock + ' pzas' }}</span>
                </a>
              </div>
            </div>

            <div class="card" v-if="d.top_products && d.top_products.length">
              <div class="card-header"><h3><icon name="star" /> Más vendidos del mes</h3></div>
              <div class="card-body bar-list">
                <div v-for="p in d.top_products" :key="p.product_id" class="bar-row">
                  <div class="bar-label"><span class="ellipsis">{{ p.name }}</span><span class="bold nowrap">{{ p.units }} pzas</span></div>
                  <div class="bar-track"><div class="bar-fill" :style="{ width: (p.units / maxTop * 100) + '%' }"></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
