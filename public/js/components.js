/* Componentes reutilizables de la interfaz. */
(function () {
  'use strict';
  const { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, h } = Vue;
  const C = App.components;

  // ---------------------------------------------------------------------------
  C.Icon = {
    name: 'Icon',
    props: { name: String, size: { type: [Number, String], default: 18 }, stroke: { type: [Number, String], default: 2 } },
    setup(props) {
      return () => h('svg', {
        class: 'icon',
        width: props.size,
        height: props.size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': props.stroke,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        innerHTML: (window.ICONS && window.ICONS[props.name]) || '',
      });
    },
  };

  // ---------------------------------------------------------------------------
  // Pila de modales abiertos: Esc solo cierra el que está encima.
  const modalStack = [];
  let modalSeq = 0;
  App.modalOpen = () => modalStack.length > 0;

  C.Modal = {
    name: 'Modal',
    props: { title: String, icon: String, size: { type: String, default: '' }, persistent: Boolean },
    emits: ['close'],
    setup(props, { emit }) {
      const id = ++modalSeq;
      const onKey = (e) => {
        if (e.key === 'Escape' && !props.persistent && modalStack[modalStack.length - 1] === id && !e.defaultPrevented) {
          e.preventDefault();
          emit('close');
        }
      };
      onMounted(() => { modalStack.push(id); document.addEventListener('keydown', onKey); });
      onBeforeUnmount(() => {
        const i = modalStack.indexOf(id);
        if (i >= 0) modalStack.splice(i, 1);
        document.removeEventListener('keydown', onKey);
      });
      const overlayDown = ref(false);
      return { overlayDown, emit };
    },
    template: `
      <teleport to="body">
        <div class="modal-overlay" @mousedown.self="overlayDown = true" @mouseup.self="overlayDown && !persistent && emit('close'); overlayDown = false">
          <div class="modal" :class="size" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h2><icon v-if="icon" :name="icon" :size="20" />{{ title }}</h2>
              <slot name="header-extra" />
              <button class="btn btn-ghost btn-icon btn-sm ml-auto" @click="emit('close')" title="Cerrar (Esc)"><icon name="x" /></button>
            </div>
            <div class="modal-body"><slot /></div>
            <div class="modal-footer" v-if="$slots.footer"><slot name="footer" /></div>
          </div>
        </div>
      </teleport>`,
  };

  // ---------------------------------------------------------------------------
  C.Pagination = {
    name: 'Pagination',
    props: { page: Number, total: Number, limit: Number },
    emits: ['update:page'],
    setup(props) {
      const pages = computed(() => Math.max(1, Math.ceil((props.total || 0) / (props.limit || 1))));
      const from = computed(() => (props.total ? (props.page - 1) * props.limit + 1 : 0));
      const to = computed(() => Math.min(props.total, props.page * props.limit));
      return { pages, from, to, fmt: App.fmt };
    },
    template: `
      <div class="pagination" v-if="total > 0">
        <span>Mostrando {{ fmt.num(from) }}–{{ fmt.num(to) }} de {{ fmt.num(total) }}</span>
        <div class="ml-auto flex">
          <button class="btn btn-sm btn-icon" :disabled="page <= 1" @click="$emit('update:page', page - 1)" title="Anterior"><icon name="chevron-left" /></button>
          <span class="small">Página {{ page }} de {{ pages }}</span>
          <button class="btn btn-sm btn-icon" :disabled="page >= pages" @click="$emit('update:page', page + 1)" title="Siguiente"><icon name="chevron-right" /></button>
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  C.DateRange = {
    name: 'DateRange',
    props: { from: String, to: String, allowEmpty: Boolean },
    emits: ['update:from', 'update:to', 'change'],
    setup(props, { emit }) {
      const ranges = App.ranges();
      const preset = computed(() => {
        if (!props.from && !props.to) return 'all';
        const r = ranges.find((x) => x.from === props.from && x.to === props.to);
        return r ? r.key : 'custom';
      });
      function pick(key) {
        if (key === 'all') { emit('update:from', ''); emit('update:to', ''); }
        else if (key !== 'custom') {
          const r = ranges.find((x) => x.key === key);
          emit('update:from', r.from); emit('update:to', r.to);
        }
        nextTick(() => emit('change'));
      }
      function setFrom(v) { emit('update:from', v); if (props.to && v > props.to) emit('update:to', v); nextTick(() => emit('change')); }
      function setTo(v) { emit('update:to', v); if (props.from && v < props.from) emit('update:from', v); nextTick(() => emit('change')); }
      return { ranges, preset, pick, setFrom, setTo };
    },
    template: `
      <div class="flex flex-wrap">
        <select class="select" style="width: 160px" :value="preset" @change="pick($event.target.value)">
          <option v-if="allowEmpty" value="all">Todas las fechas</option>
          <option v-for="r in ranges" :key="r.key" :value="r.key">{{ r.label }}</option>
          <option value="custom">Personalizado</option>
        </select>
        <input type="date" class="input" style="width: 150px" :value="from" @change="setFrom($event.target.value)" />
        <span class="muted">a</span>
        <input type="date" class="input" style="width: 150px" :value="to" @change="setTo($event.target.value)" />
      </div>`,
  };

  // ---------------------------------------------------------------------------
  C.Empty = {
    name: 'Empty',
    props: { icon: { type: String, default: 'inbox' }, title: String, text: String },
    template: `
      <div class="empty">
        <icon :name="icon" :size="44" :stroke="1.5" />
        <h3 v-if="title">{{ title }}</h3>
        <p v-if="text" class="small">{{ text }}</p>
        <div class="mt-12" v-if="$slots.default"><slot /></div>
      </div>`,
  };

  C.Loading = {
    name: 'Loading',
    props: { text: { type: String, default: 'Cargando…' } },
    template: `<div class="loading"><div class="spinner"></div>{{ text }}</div>`,
  };

  // ---------------------------------------------------------------------------
  C.StatCard = {
    name: 'StatCard',
    props: { icon: String, color: String, label: String, value: [String, Number], sub: String, trend: Number, trendLabel: String },
    template: `
      <div class="stat">
        <div class="stat-icon" :class="color"><icon :name="icon" :size="21" /></div>
        <div class="flex-1">
          <div class="stat-label">{{ label }}</div>
          <div class="stat-value">{{ value }}</div>
          <div class="stat-sub" v-if="sub || trend !== undefined">
            <span v-if="trend !== undefined && trend !== null && isFinite(trend)" class="trend" :class="trend >= 0 ? 'up' : 'down'">
              <icon :name="trend >= 0 ? 'trending-up' : 'trending-down'" :size="13" /> {{ Math.abs(trend).toFixed(0) }}%
            </span>
            {{ sub }}
          </div>
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  C.Thumb = {
    name: 'Thumb',
    props: { product: Object, size: { type: String, default: '' } },
    setup(props) {
      const failed = ref(false);
      const src = computed(() => (failed.value ? null : App.productImage(props.product)));
      const color = computed(() => App.colorFor(props.product && props.product.category_id));
      const initials = computed(() => App.fmt.initials(props.product && props.product.name));
      watch(() => props.product && props.product.updated_at, () => { failed.value = false; });
      return { src, color, initials, failed };
    },
    template: `
      <div class="thumb" :class="size" :style="src ? '' : 'background:' + color">
        <img v-if="src" :src="src" loading="lazy" alt="" @error="failed = true" />
        <template v-else>{{ initials }}</template>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  /** Buscador de productos (variantes) con lista desplegable. Compatible con lector de código de barras. */
  C.ProductSearch = {
    name: 'ProductSearch',
    props: { placeholder: { type: String, default: 'Buscar producto por nombre, SKU o código de barras…' }, autofocus: Boolean, includeInactive: Boolean },
    emits: ['select'],
    setup(props, { emit }) {
      const q = ref('');
      const results = ref([]);
      const open = ref(false);
      const active = ref(0);
      const loading = ref(false);
      const input = ref(null);
      let seq = 0;

      const search = App.debounce(async () => {
        const term = q.value.trim();
        if (!term) { results.value = []; return; }
        const my = ++seq;
        loading.value = true;
        try {
          const r = await App.api.get('/variants/search', { q: term, all: props.includeInactive ? 1 : '' });
          if (my === seq) { results.value = r; active.value = 0; open.value = true; }
        } catch (e) { App.error(e); } finally { loading.value = false; }
      }, 220);

      watch(q, search);

      function choose(v) {
        emit('select', v);
        q.value = '';
        results.value = [];
        open.value = false;
        nextTick(() => input.value && input.value.focus());
      }

      async function onEnter() {
        const term = q.value.trim();
        if (!term) return;
        if (open.value && results.value[active.value]) return choose(results.value[active.value]);
        try {
          const r = await App.api.get('/variants/search', { q: term });
          if (r.length === 1 || (r[0] && r[0].exact)) choose(r[0]);
          else { results.value = r; open.value = true; if (!r.length) App.toast('No se encontró ningún producto con "' + term + '"', 'warning'); }
        } catch (e) { App.error(e); }
      }

      function onKey(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(results.value.length - 1, active.value + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(0, active.value - 1); }
        else if (e.key === 'Escape') { open.value = false; }
      }

      onMounted(() => { if (props.autofocus) input.value && input.value.focus(); });
      const blur = () => setTimeout(() => { open.value = false; }, 180);
      return { q, results, open, active, loading, input, choose, onEnter, onKey, blur, fmt: App.fmt };
    },
    template: `
      <div style="position: relative">
        <div class="input-group">
          <icon name="scan-barcode" />
          <input ref="input" class="input" v-model="q" :placeholder="placeholder" @keydown.enter.prevent="onEnter" @keydown="onKey"
            @focus="results.length && (open = true)" @blur="blur" autocomplete="off" />
          <div class="addon" v-if="loading"><div class="spinner" style="width:16px;height:16px"></div></div>
        </div>
        <div class="search-results" v-if="open && q.trim()">
          <div v-if="!results.length" class="list-item muted small">Sin resultados</div>
          <div v-for="(v, i) in results" :key="v.id" class="search-result" :class="{ active: i === active }" @mousedown.prevent="choose(v)" @mouseenter="active = i">
            <thumb :product="{ id: v.product_id, name: v.name, has_image: v.has_image, category_id: v.category_id, updated_at: v.updated_at }" />
            <div class="flex-1">
              <div class="bold ellipsis">{{ v.name }} <span v-if="fmt.variant(v)" class="muted">· {{ fmt.variant(v) }}</span></div>
              <div class="tiny muted">{{ v.sku }}<span v-if="v.barcode"> · {{ v.barcode }}</span><span v-if="v.brand_name"> · {{ v.brand_name }}</span></div>
            </div>
            <div class="right">
              <div class="bold">{{ fmt.money(v.price) }}</div>
              <div class="tiny" :class="v.stock <= 0 ? 'text-danger' : v.stock <= v.min_stock ? 'text-warning' : 'muted'">Stock: {{ v.stock }}</div>
            </div>
          </div>
        </div>
      </div>`,
  };

  // ---------------------------------------------------------------------------
  /** Selector de cliente con búsqueda y alta rápida. */
  C.CustomerPicker = {
    name: 'CustomerPicker',
    emits: ['select', 'close'],
    setup(props, { emit }) {
      const q = ref('');
      const rows = ref([]);
      const loading = ref(false);
      const creating = ref(false);
      const form = ref({ name: '', phone: '', email: '', tax_id: '' });
      const input = ref(null);
      const load = App.debounce(async () => {
        loading.value = true;
        try { rows.value = (await App.api.get('/customers', { q: q.value, limit: 30, sort: q.value ? '' : 'recent' })).rows; }
        catch (e) { App.error(e); } finally { loading.value = false; }
      }, 200);
      watch(q, load);
      onMounted(() => { load(); nextTick(() => input.value && input.value.focus()); });
      function startCreate() {
        creating.value = true;
        const isPhone = /^[\d\s+-]{7,}$/.test(q.value.trim());
        form.value = { name: isPhone ? '' : q.value.trim(), phone: isPhone ? q.value.trim() : '', email: '', tax_id: '' };
      }
      async function save() {
        try {
          const c = await App.api.post('/customers', form.value);
          App.toast('Cliente registrado');
          emit('select', c);
        } catch (e) { App.error(e); }
      }
      return { q, rows, loading, creating, form, input, startCreate, save, emit, fmt: App.fmt };
    },
    template: `
      <modal :title="creating ? 'Nuevo cliente' : 'Seleccionar cliente'" icon="user" @close="emit('close')">
        <template v-if="!creating">
          <div class="input-group mb-12">
            <icon name="search" />
            <input ref="input" class="input" v-model="q" placeholder="Buscar por nombre, teléfono o correo…" @keydown.enter="rows[0] && emit('select', rows[0])" />
          </div>
          <div class="card" style="max-height: 340px; overflow-y: auto">
            <div class="list-item" @click="emit('select', null)">
              <div class="avatar" style="background:#94a3b8"><icon name="users" :size="16" /></div>
              <div class="flex-1"><div class="bold">Público en general</div><div class="tiny muted">Venta sin cliente registrado</div></div>
            </div>
            <div v-for="c in rows" :key="c.id" class="list-item" @click="emit('select', c)">
              <div class="avatar">{{ fmt.initials(c.name) }}</div>
              <div class="flex-1">
                <div class="bold">{{ c.name }}</div>
                <div class="tiny muted">{{ c.phone || 'Sin teléfono' }}<span v-if="c.purchases"> · {{ c.purchases }} compra(s)</span></div>
              </div>
              <div class="small muted" v-if="c.total_spent">{{ fmt.money(c.total_spent) }}</div>
            </div>
            <div v-if="!loading && !rows.length && q" class="list-item muted small">No se encontró "{{ q }}"</div>
          </div>
        </template>
        <div v-else class="grid grid-2">
          <div class="form-group span-all"><label class="req">Nombre</label><input class="input" v-model="form.name" autofocus /></div>
          <div class="form-group"><label>Teléfono</label><input class="input" v-model="form.phone" /></div>
          <div class="form-group"><label>Correo</label><input class="input" v-model="form.email" type="email" /></div>
          <div class="form-group span-all"><label>RFC / ID fiscal</label><input class="input" v-model="form.tax_id" /></div>
        </div>
        <template #footer>
          <template v-if="!creating">
            <button class="btn btn-light" @click="startCreate"><icon name="user-plus" /> Nuevo cliente</button>
            <button class="btn" @click="emit('close')">Cerrar</button>
          </template>
          <template v-else>
            <button class="btn" @click="creating = false">Volver</button>
            <button class="btn btn-primary" @click="save" :disabled="!form.name.trim()"><icon name="save" /> Guardar y seleccionar</button>
          </template>
        </template>
      </modal>`,
  };

  // ---------------------------------------------------------------------------
  /** Envoltorio de Chart.js. */
  C.Chart = {
    name: 'Chart',
    props: { type: { type: String, default: 'bar' }, labels: Array, datasets: Array, options: Object, height: { type: String, default: '' }, money: Boolean },
    setup(props) {
      const canvas = ref(null);
      let chart = null;
      function build() {
        if (!canvas.value || !window.Chart) return;
        if (chart) chart.destroy();
        const isPie = props.type === 'doughnut' || props.type === 'pie';
        const fmtVal = (v) => (props.money ? App.fmt.money(v) : App.fmt.num(v));
        chart = new window.Chart(canvas.value, {
          type: props.type,
          data: { labels: props.labels || [], datasets: props.datasets || [] },
          options: Object.assign({
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 350 },
            interaction: { mode: isPie ? 'nearest' : 'index', intersect: isPie },
            plugins: {
              legend: { display: isPie || (props.datasets || []).length > 1, position: isPie ? 'right' : 'top', labels: { boxWidth: 12, boxHeight: 12, font: { size: 12 } } },
              tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label || ctx.label}: ${fmtVal(ctx.parsed.y ?? ctx.parsed)}` } },
            },
            scales: isPie ? {} : {
              x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 } },
              y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { font: { size: 11 }, callback: (v) => (props.money ? App.fmt.money(v).replace(/\.00$/, '') : v) } },
            },
            cutout: props.type === 'doughnut' ? '62%' : undefined,
          }, props.options || {}),
        });
      }
      onMounted(build);
      watch(() => [props.labels, props.datasets], build, { deep: true });
      onBeforeUnmount(() => chart && chart.destroy());
      return { canvas };
    },
    template: `<div class="chart-box" :class="height"><canvas ref="canvas"></canvas></div>`,
  };

  // ---------------------------------------------------------------------------
  C.MoneyInput = {
    name: 'MoneyInput',
    props: { modelValue: [Number, String], size: { type: String, default: '' }, placeholder: { type: String, default: '0.00' } },
    emits: ['update:modelValue', 'enter'],
    setup(props, { emit, expose }) {
      const el = ref(null);
      expose({ focus: () => el.value && el.value.focus(), select: () => el.value && el.value.select() });
      function onInput(e) {
        const v = e.target.value;
        emit('update:modelValue', v === '' ? '' : Number(v));
      }
      return { el, onInput, sym: computed(() => App.store.settings.currency_symbol || '$') };
    },
    template: `
      <div class="input-prefix">
        <span>{{ sym }}</span>
        <input ref="el" class="input num" :class="size" type="number" step="0.01" min="0" inputmode="decimal" :value="modelValue" :placeholder="placeholder"
          @input="onInput" @focus="$event.target.select()" @keydown.enter.prevent="$emit('enter')" />
      </div>`,
  };

  /** Registra todos los componentes en la app de Vue. */
  App.registerComponents = (app) => {
    for (const [name, comp] of Object.entries(C)) {
      app.component(name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(), comp);
      app.component(name, comp);
    }
  };
})();
