/* Reportes de ventas, utilidad e inventario con gráficas y exportación a CSV. */
(function () {
  'use strict';
  const { ref, reactive, computed, onMounted } = Vue;
  const fmt = App.fmt;
  const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const PALETTE = ['#0284c7', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#2563eb', '#16a34a', '#c026d3', '#ca8a04', '#64748b'];

  App.views.Reports = {
    setup() {
      const ranges = App.ranges();
      const month = ranges.find((r) => r.key === 'month');
      const f = reactive({ from: month.from, to: month.to });
      const tab = ref(App.store.route.query.tab || 'ventas');
      const sales = ref(null);
      const inv = ref(null);
      const loading = ref(false);

      async function loadSales() {
        loading.value = true;
        try { sales.value = await App.api.get('/reports/sales', f); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      async function loadInv() {
        loading.value = true;
        try { inv.value = await App.api.get('/reports/inventory'); } catch (e) { App.error(e); } finally { loading.value = false; }
      }
      function setTab(t) {
        tab.value = t;
        App.setQuery({ tab: t });
        if (t === 'inventario' && !inv.value) loadInv();
        if (t !== 'inventario' && !sales.value) loadSales();
      }
      onMounted(() => (tab.value === 'inventario' ? loadInv() : loadSales()));

      const trend = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
      const seriesChart = computed(() => {
        if (!sales.value) return null;
        const s = sales.value.series;
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const labels = s.rows.map((r) => (s.granularity === 'month' ? monthNames[Number(r.date.slice(5, 7)) - 1] + ' ' + r.date.slice(2, 4) : r.date.slice(8, 10) + '/' + r.date.slice(5, 7)));
        return {
          labels,
          datasets: [
            { type: 'bar', label: 'Ventas netas', data: s.rows.map((r) => r.total), backgroundColor: '#38bdf8', borderRadius: 4, maxBarThickness: 30, order: 2 },
            { type: 'line', label: 'Utilidad', data: s.rows.map((r) => r.profit), borderColor: '#16a34a', backgroundColor: '#16a34a', tension: 0.3, pointRadius: 2, order: 1 },
          ],
        };
      });
      const categoryChart = computed(() => sales.value && {
        labels: sales.value.by_category.map((c) => c.name),
        datasets: [{ data: sales.value.by_category.map((c) => c.amount), backgroundColor: sales.value.by_category.map((c) => c.color), borderWidth: 2, borderColor: '#fff' }],
      });
      const methodChart = computed(() => sales.value && {
        labels: sales.value.by_method.map((m) => fmt.method(m.method)),
        datasets: [{ data: sales.value.by_method.map((m) => m.amount), backgroundColor: ['#16a34a', '#0284c7', '#7c3aed', '#94a3b8'], borderWidth: 2, borderColor: '#fff' }],
      });
      const hourChart = computed(() => {
        if (!sales.value) return null;
        const hours = [];
        for (let h = 7; h <= 22; h++) hours.push(h);
        const map = new Map(sales.value.by_hour.map((r) => [r.hour, r]));
        return {
          labels: hours.map((h) => h + ':00'),
          datasets: [{ label: 'Tickets', data: hours.map((h) => (map.get(h) || {}).count || 0), backgroundColor: '#a78bfa', borderRadius: 4 }],
        };
      });
      const weekdayChart = computed(() => {
        if (!sales.value) return null;
        const order = [1, 2, 3, 4, 5, 6, 0];
        const map = new Map(sales.value.by_weekday.map((r) => [r.weekday, r]));
        return {
          labels: order.map((d) => WEEKDAYS[d].slice(0, 3)),
          datasets: [{ label: 'Ventas', data: order.map((d) => (map.get(d) || {}).total || 0), backgroundColor: '#5eead4', borderRadius: 4 }],
        };
      });
      const invCategoryChart = computed(() => inv.value && {
        labels: inv.value.by_category.map((c) => c.name),
        datasets: [{ data: inv.value.by_category.map((c) => c.cost_value), backgroundColor: inv.value.by_category.map((c, i) => c.color || PALETTE[i % PALETTE.length]), borderWidth: 2, borderColor: '#fff' }],
      });

      function exportTop() {
        App.downloadCsv(`productos-mas-vendidos-${f.from}-${f.to}.csv`, ['Producto', 'Piezas', 'Tickets', 'Ventas', 'Utilidad'],
          sales.value.top_products.map((p) => [p.name, p.units, p.tickets, p.amount, p.profit]));
      }
      function exportDays() {
        App.downloadCsv(`ventas-por-${sales.value.series.granularity === 'month' ? 'mes' : 'dia'}-${f.from}-${f.to}.csv`, ['Periodo', 'Tickets', 'Ventas netas', 'Utilidad'],
          sales.value.series.rows.map((r) => [r.date, r.count, r.total, r.profit]));
      }
      function exportLow() {
        App.downloadCsv('productos-por-surtir.csv', ['Producto', 'Variante', 'SKU', 'Categoría', 'Marca', 'Proveedor', 'Existencia', 'Mínimo', 'Vendidos 30 días', 'Sugerido pedir', 'Costo'],
          inv.value.low_stock.map((v) => [v.name, fmt.variant(v), v.sku, v.category_name, v.brand_name, v.supplier_name, v.stock, v.min_stock, v.sold_30d, suggested(v), v.cost]));
      }
      function exportInventory() { window.location.href = '/api/export/products.csv'; }
      const suggested = (v) => Math.max(v.min_stock * 2 - v.stock, v.sold_30d - v.stock, 1);
      const maxOf = (rows, k) => Math.max(1, ...rows.map((r) => r[k] || 0));

      return { f, tab, sales, inv, loading, loadSales, setTab, trend, seriesChart, categoryChart, methodChart, hourChart, weekdayChart, invCategoryChart,
        exportTop, exportDays, exportLow, exportInventory, suggested, maxOf, fmt, WEEKDAYS };
    },
    template: `
      <div>
        <div class="tabs">
          <button class="tab" :class="{ active: tab === 'ventas' }" @click="setTab('ventas')"><icon name="chart-column" :size="16" /> Ventas y utilidad</button>
          <button class="tab" :class="{ active: tab === 'productos' }" @click="setTab('productos')"><icon name="star" :size="16" /> Productos y categorías</button>
          <button class="tab" :class="{ active: tab === 'inventario' }" @click="setTab('inventario')"><icon name="warehouse" :size="16" /> Inventario</button>
        </div>

        <div v-if="tab !== 'inventario'" class="flex flex-wrap mb-16">
          <date-range v-model:from="f.from" v-model:to="f.to" @change="loadSales" />
          <div v-if="loading" class="spinner"></div>
          <span v-if="sales" class="small muted ml-auto">Comparado con {{ fmt.date(sales.previous.from) }} – {{ fmt.date(sales.previous.to) }}</span>
        </div>

        <template v-if="tab === 'ventas' && sales">
          <div class="stats mb-16">
            <stat-card icon="circle-dollar-sign" color="green" label="Ventas netas" :value="fmt.money(sales.summary.net)" :trend="trend(sales.summary.net, sales.previous.net)" :sub="'antes ' + fmt.money(sales.previous.net)" />
            <stat-card icon="trending-up" color="teal" label="Utilidad bruta" :value="fmt.money(sales.summary.profit)" :trend="trend(sales.summary.profit, sales.previous.profit)" :sub="'Margen ' + fmt.pct(sales.summary.margin)" />
            <stat-card icon="receipt" label="Tickets" :value="fmt.num(sales.summary.count)" :trend="trend(sales.summary.count, sales.previous.count)" :sub="'Promedio ' + fmt.money(sales.summary.avg_ticket)" />
            <stat-card icon="shopping-bag" color="purple" label="Piezas vendidas" :value="fmt.num(sales.summary.units)" :trend="trend(sales.summary.units, sales.previous.units)" />
          </div>
          <div class="grid" style="grid-template-columns: minmax(0, 2fr) minmax(0, 1fr)">
            <div class="card">
              <div class="card-header"><h3><icon name="chart-column" /> Ventas y utilidad por {{ sales.series.granularity === 'month' ? 'mes' : 'día' }}</h3>
                <button class="btn btn-sm btn-ghost ml-auto" @click="exportDays"><icon name="download" /> CSV</button></div>
              <div class="card-body"><chart type="bar" :labels="seriesChart.labels" :datasets="seriesChart.datasets" money height="lg" /></div>
            </div>
            <div class="card">
              <div class="card-header"><h3><icon name="file-text" /> Estado de resultados</h3></div>
              <div class="card-body">
                <div class="flex between"><span>Ventas brutas</span><b>{{ fmt.money(sales.summary.gross) }}</b></div>
                <div class="flex between text-success"><span>− Descuentos</span><b>{{ fmt.money(sales.summary.discounts) }}</b></div>
                <div class="flex between text-danger"><span>− Devoluciones</span><b>{{ fmt.money(sales.summary.returns) }}</b></div>
                <div class="divider"></div>
                <div class="flex between"><span class="bold">Ventas netas</span><b>{{ fmt.money(sales.summary.net) }}</b></div>
                <div class="flex between muted"><span>IVA trasladado</span><span>{{ fmt.money(sales.summary.net - sales.summary.net_before_tax) }}</span></div>
                <div class="flex between"><span>Ventas sin IVA</span><b>{{ fmt.money(sales.summary.net_before_tax) }}</b></div>
                <div class="flex between"><span>− Costo de lo vendido</span><b>{{ fmt.money(sales.summary.cost) }}</b></div>
                <div class="divider"></div>
                <div class="flex between" style="font-size:16px"><span class="bold">Utilidad bruta</span><b class="text-success">{{ fmt.money(sales.summary.profit) }}</b></div>
                <div class="flex between muted small"><span>Margen sobre venta</span><span>{{ fmt.pct(sales.summary.margin) }}</span></div>
                <div v-if="sales.summary.cancelled_count" class="alert alert-warning mt-12 small"><icon name="ban" :size="16" />{{ sales.summary.cancelled_count }} venta(s) cancelada(s) por {{ fmt.money(sales.summary.cancelled_total) }} (no incluidas).</div>
              </div>
            </div>
          </div>
          <div class="grid grid-3 mt-16">
            <div class="card">
              <div class="card-header"><h3><icon name="credit-card" /> Formas de pago</h3></div>
              <div class="card-body"><chart v-if="sales.by_method.length" type="doughnut" :labels="methodChart.labels" :datasets="methodChart.datasets" money height="sm" />
                <empty v-else icon="credit-card" title="Sin datos" /></div>
            </div>
            <div class="card">
              <div class="card-header"><h3><icon name="clock" /> Tickets por hora</h3></div>
              <div class="card-body"><chart type="bar" :labels="hourChart.labels" :datasets="hourChart.datasets" height="sm" /></div>
            </div>
            <div class="card">
              <div class="card-header"><h3><icon name="calendar" /> Ventas por día de la semana</h3></div>
              <div class="card-body"><chart type="bar" :labels="weekdayChart.labels" :datasets="weekdayChart.datasets" money height="sm" /></div>
            </div>
          </div>
          <div class="grid grid-2 mt-16">
            <div class="card">
              <div class="card-header"><h3><icon name="users" /> Ventas por vendedor</h3></div>
              <div class="table-wrap"><table class="table table-sm">
                <thead><tr><th>Vendedor</th><th class="num">Tickets</th><th class="num">Ticket prom.</th><th class="num">Ventas netas</th></tr></thead>
                <tbody><tr v-for="u in sales.by_user" :key="u.name"><td class="bold">{{ u.name }}</td><td class="num">{{ u.count }}</td><td class="num">{{ fmt.money(u.avg_ticket) }}</td><td class="num bold">{{ fmt.money(u.total) }}</td></tr></tbody>
              </table><empty v-if="!sales.by_user.length" icon="users" title="Sin ventas" /></div>
            </div>
            <div class="card">
              <div class="card-header"><h3><icon name="star" /> Mejores clientes</h3></div>
              <div class="table-wrap"><table class="table table-sm">
                <thead><tr><th>Cliente</th><th class="num">Compras</th><th class="num">Total</th></tr></thead>
                <tbody><tr v-for="c in sales.top_customers" :key="c.id"><td class="bold">{{ c.name }}</td><td class="num">{{ c.count }}</td><td class="num bold">{{ fmt.money(c.total) }}</td></tr></tbody>
              </table><empty v-if="!sales.top_customers.length" icon="users" title="Sin ventas a clientes registrados" /></div>
            </div>
          </div>
          <div class="card mt-16" v-if="sales.returns.length">
            <div class="card-header"><h3><icon name="rotate-ccw" /> Devoluciones del periodo</h3></div>
            <div class="table-wrap"><table class="table table-sm">
              <thead><tr><th>Folio</th><th>Fecha</th><th>Venta</th><th>Motivo</th><th>Reembolso</th><th>Usuario</th><th class="num">Importe</th></tr></thead>
              <tbody><tr v-for="r in sales.returns" :key="r.id"><td class="mono">{{ r.folio }}</td><td>{{ fmt.datetime(r.created_at) }}</td><td class="mono">{{ r.sale_folio }}</td><td>{{ r.reason }}</td><td>{{ fmt.method(r.refund_method) }}</td><td>{{ r.user_name }}</td><td class="num bold">{{ fmt.money(r.total) }}</td></tr></tbody>
            </table></div>
          </div>
        </template>

        <template v-if="tab === 'productos' && sales">
          <div class="grid" style="grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)">
            <div class="card">
              <div class="card-header"><h3><icon name="layout-grid" /> Ventas por categoría</h3></div>
              <div class="card-body">
                <chart v-if="sales.by_category.length" type="doughnut" :labels="categoryChart.labels" :datasets="categoryChart.datasets" money />
                <empty v-else icon="layout-grid" title="Sin ventas en el periodo" />
              </div>
              <div class="table-wrap"><table class="table table-sm">
                <thead><tr><th>Categoría</th><th class="num">Piezas</th><th class="num">Ventas</th><th class="num">Utilidad</th></tr></thead>
                <tbody><tr v-for="c in sales.by_category" :key="c.name"><td><span class="dot" :style="{ background: c.color }"></span> {{ c.name }}</td><td class="num">{{ c.units }}</td><td class="num bold">{{ fmt.money(c.amount) }}</td><td class="num text-success">{{ fmt.money(c.profit) }}</td></tr></tbody>
              </table></div>
            </div>
            <div class="card">
              <div class="card-header"><h3><icon name="tags" /> Ventas por marca</h3></div>
              <div class="card-body bar-list">
                <div v-for="b in sales.by_brand" :key="b.name" class="bar-row">
                  <div class="bar-label"><span>{{ b.name }} <span class="muted small">· {{ b.units }} pzas</span></span><b>{{ fmt.money(b.amount) }}</b></div>
                  <div class="bar-track"><div class="bar-fill" :style="{ width: (b.amount / maxOf(sales.by_brand, 'amount') * 100) + '%', background: '#7c3aed' }"></div></div>
                </div>
                <empty v-if="!sales.by_brand.length" icon="tags" title="Sin ventas en el periodo" />
              </div>
            </div>
          </div>
          <div class="card mt-16">
            <div class="card-header"><h3><icon name="star" /> Productos más vendidos</h3><button class="btn btn-sm btn-ghost ml-auto" @click="exportTop"><icon name="download" /> CSV</button></div>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>#</th><th>Producto</th><th class="num">Piezas</th><th class="num">Tickets</th><th class="num">Ventas</th><th class="num">Utilidad</th><th class="num">Margen</th></tr></thead>
              <tbody><tr v-for="(p, i) in sales.top_products" :key="p.product_id" class="clickable" @click="App.go('/productos/' + p.product_id)">
                <td class="muted">{{ i + 1 }}</td><td class="bold">{{ p.name }}</td><td class="num">{{ p.units }}</td><td class="num">{{ p.tickets }}</td>
                <td class="num bold">{{ fmt.money(p.amount) }}</td><td class="num text-success">{{ fmt.money(p.profit) }}</td>
                <td class="num">{{ p.amount ? fmt.pct(p.profit / (p.amount / (1 + Number(App.store.settings.tax_rate || 0) / 100)) * 100, 0) : '—' }}</td></tr></tbody>
            </table><empty v-if="!sales.top_products.length" icon="star" title="Sin ventas en el periodo" /></div>
          </div>
          <div class="card mt-16">
            <div class="card-header"><h3><icon name="ruler" /> Tallas y colores más vendidos</h3></div>
            <div class="table-wrap"><table class="table table-sm">
              <thead><tr><th>Producto</th><th>Variante</th><th>SKU</th><th class="num">Piezas</th><th class="num">Ventas</th></tr></thead>
              <tbody><tr v-for="v in sales.top_variants" :key="v.variant_id"><td class="bold">{{ v.name }}</td><td>{{ v.variant_label || 'Única' }}</td><td class="mono">{{ v.sku }}</td><td class="num">{{ v.units }}</td><td class="num bold">{{ fmt.money(v.amount) }}</td></tr></tbody>
            </table></div>
          </div>
        </template>

        <template v-if="tab === 'inventario'">
          <loading v-if="!inv" />
          <template v-else>
            <div class="stats mb-16">
              <stat-card icon="boxes" label="Piezas en existencia" :value="fmt.num(inv.summary.units)" :sub="inv.summary.products + ' productos · ' + inv.summary.variants + ' variantes'" />
              <stat-card icon="coins" color="purple" label="Inversión (a costo)" :value="fmt.money(inv.summary.cost_value)" />
              <stat-card icon="circle-dollar-sign" color="green" label="Valor a precio de venta" :value="fmt.money(inv.summary.price_value)" :sub="'Utilidad potencial ' + fmt.money(inv.summary.potential_profit)" />
              <stat-card icon="triangle-alert" color="orange" label="Por surtir" :value="fmt.num(inv.low_stock.length)" :sub="inv.summary.out_count + ' agotadas · ' + inv.summary.low_count + ' en mínimo'" />
            </div>
            <div class="grid" style="grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr)">
              <div class="card">
                <div class="card-header"><h3><icon name="layout-grid" /> Inversión por categoría</h3></div>
                <div class="card-body"><chart type="doughnut" :labels="invCategoryChart.labels" :datasets="invCategoryChart.datasets" money /></div>
              </div>
              <div class="card">
                <div class="card-header"><h3><icon name="warehouse" /> Valor por categoría y marca</h3><button class="btn btn-sm btn-ghost ml-auto" @click="exportInventory"><icon name="download" /> Inventario CSV</button></div>
                <div class="table-wrap" style="max-height:360px"><table class="table table-sm">
                  <thead><tr><th>Categoría</th><th class="num">Productos</th><th class="num">Piezas</th><th class="num">Costo</th><th class="num">Precio venta</th></tr></thead>
                  <tbody><tr v-for="c in inv.by_category" :key="c.name"><td><span class="dot" :style="{ background: c.color }"></span> {{ c.name }}</td><td class="num">{{ c.products }}</td><td class="num">{{ c.units }}</td><td class="num bold">{{ fmt.money(c.cost_value) }}</td><td class="num">{{ fmt.money(c.price_value) }}</td></tr></tbody>
                  <thead><tr><th>Marca</th><th class="num">Productos</th><th class="num">Piezas</th><th class="num">Costo</th><th class="num">Precio venta</th></tr></thead>
                  <tbody><tr v-for="b in inv.by_brand" :key="b.name"><td>{{ b.name }}</td><td class="num">{{ b.products }}</td><td class="num">{{ b.units }}</td><td class="num bold">{{ fmt.money(b.cost_value) }}</td><td class="num">{{ fmt.money(b.price_value) }}</td></tr></tbody>
                </table></div>
              </div>
            </div>
            <div class="card mt-16">
              <div class="card-header"><h3><icon name="truck" /> Productos por surtir (lista de pedido)</h3>
                <div class="ml-auto flex"><button class="btn btn-sm" @click="exportLow"><icon name="download" /> Exportar pedido</button>
                <a href="#/compras/nueva" class="btn btn-sm btn-primary"><icon name="package-plus" /> Registrar entrada</a></div></div>
              <div class="table-wrap" style="max-height:420px"><table class="table table-sm">
                <thead><tr><th>Producto</th><th>Variante</th><th>Proveedor</th><th class="num">Existencia</th><th class="num">Mínimo</th><th class="num">Vendidos 30 días</th><th class="num">Sugerido pedir</th></tr></thead>
                <tbody><tr v-for="v in inv.low_stock" :key="v.variant_id" class="clickable" @click="App.go('/productos/' + v.product_id)">
                  <td class="bold">{{ v.name }}<div class="tiny muted">{{ v.brand_name }}</div></td><td>{{ fmt.variant(v) || 'Única' }}</td><td class="small">{{ v.supplier_name || '—' }}</td>
                  <td class="num"><span class="stock-num" :class="v.stock <= 0 ? 'out' : 'low'">{{ v.stock }}</span></td><td class="num">{{ v.min_stock }}</td><td class="num">{{ v.sold_30d }}</td>
                  <td class="num bold text-primary">{{ suggested(v) }}</td></tr></tbody>
              </table><empty v-if="!inv.low_stock.length" icon="circle-check" title="Todo en orden" text="No hay productos por debajo del mínimo." /></div>
            </div>
            <div class="card mt-16">
              <div class="card-header"><h3><icon name="archive" /> Productos sin movimiento (más de {{ inv.slow_days }} días sin venderse)</h3></div>
              <div class="table-wrap" style="max-height:360px"><table class="table table-sm">
                <thead><tr><th>Producto</th><th>Categoría</th><th class="num">Piezas</th><th class="num">Inversión detenida</th><th>Última venta</th></tr></thead>
                <tbody><tr v-for="p in inv.slow_movers" :key="p.id" class="clickable" @click="App.go('/productos/' + p.id)"><td class="bold">{{ p.name }}</td><td>{{ p.category_name || '—' }}</td><td class="num">{{ p.units }}</td><td class="num bold">{{ fmt.money(p.cost_value) }}</td><td>{{ p.last_sale ? fmt.date(p.last_sale) : 'Nunca' }}</td></tr></tbody>
              </table><empty v-if="!inv.slow_movers.length" icon="circle-check" title="Todo se está vendiendo" /></div>
            </div>
          </template>
        </template>
        <loading v-if="tab !== 'inventario' && !sales" />
      </div>`,
  };
})();
