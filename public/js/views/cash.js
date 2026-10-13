/* Caja: apertura, entradas/salidas de efectivo, corte de caja e historial de turnos. */
(function () {
  'use strict';
  const { ref, reactive, computed, onMounted } = Vue;
  const fmt = App.fmt;
  const store = App.store;

  const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];

  const SessionSummary = {
    props: { s: Object },
    setup() { return { fmt }; },
    template: `
      <div class="grid grid-2">
        <div>
          <div class="label mb-8">Ventas del turno</div>
          <div class="flex between"><span>Tickets</span><b>{{ s.sales.count }}</b></div>
          <div class="flex between"><span>Artículos</span><b>{{ s.sales.units }}</b></div>
          <div class="flex between"><span>Descuentos otorgados</span><b>{{ fmt.money(s.sales.discounts) }}</b></div>
          <div class="flex between"><span>Total vendido</span><b>{{ fmt.money(s.sales.total) }}</b></div>
          <div class="flex between muted" v-if="s.cancelled.count"><span>Canceladas ({{ s.cancelled.count }})</span><span>{{ fmt.money(s.cancelled.total) }}</span></div>
          <div class="divider"></div>
          <div class="label mb-8">Por forma de pago</div>
          <div v-for="m in s.by_method" :key="m.method" class="flex between"><span>{{ fmt.method(m.method) }} <span class="muted small">({{ m.count }})</span></span><b>{{ fmt.money(m.amount) }}</b></div>
          <div v-if="!s.by_method.length" class="muted small">Sin ventas</div>
          <template v-if="s.refunds.length">
            <div class="divider"></div>
            <div class="label mb-8">Devoluciones</div>
            <div v-for="r in s.refunds" :key="r.method" class="flex between text-danger"><span>{{ fmt.method(r.method) }} ({{ r.count }})</span><b>-{{ fmt.money(r.amount) }}</b></div>
          </template>
        </div>
        <div>
          <div class="label mb-8">Efectivo en caja</div>
          <div class="flex between"><span>Fondo inicial</span><b>{{ fmt.money(s.opening_amount) }}</b></div>
          <div class="flex between"><span>+ Ventas en efectivo</span><b>{{ fmt.money(s.cash_sales) }}</b></div>
          <div class="flex between" v-if="s.cash_refunds"><span>− Devoluciones en efectivo</span><b>{{ fmt.money(s.cash_refunds) }}</b></div>
          <div class="flex between"><span>+ Entradas</span><b>{{ fmt.money(s.inflows) }}</b></div>
          <div class="flex between"><span>− Salidas</span><b>{{ fmt.money(s.outflows) }}</b></div>
          <div class="divider"></div>
          <div class="flex between" style="font-size:16px"><span class="bold">Efectivo esperado</span><b>{{ fmt.money(s.expected_cash) }}</b></div>
          <template v-if="s.status === 'cerrada'">
            <div class="flex between mt-4" style="font-size:16px"><span class="bold">Efectivo contado</span><b>{{ fmt.money(s.counted_amount) }}</b></div>
            <div class="flex between mt-8 change-box" :class="s.difference < 0 ? 'missing' : 'ok'" style="padding:10px 12px">
              <span>{{ s.difference < 0 ? 'Faltante' : s.difference > 0 ? 'Sobrante' : 'Caja cuadrada' }}</span><span>{{ fmt.money(Math.abs(s.difference)) }}</span>
            </div>
          </template>
          <template v-if="s.movements.length">
            <div class="divider"></div>
            <div class="label mb-8">Movimientos de efectivo</div>
            <div v-for="m in s.movements" :key="m.id" class="flex between small">
              <span><span :class="m.type === 'entrada' ? 'text-success' : 'text-danger'">{{ m.type === 'entrada' ? '+' : '−' }}</span> {{ m.reason }} <span class="muted">· {{ fmt.time(m.created_at) }}</span></span>
              <b>{{ fmt.money(m.amount) }}</b>
            </div>
          </template>
        </div>
      </div>`,
  };

  App.views.Cash = {
    components: { SessionSummary },
    setup() {
      const loading = ref(true);
      const opening = ref('');
      const openNotes = ref('');
      const history = ref(null);
      const page = ref(1);
      const detail = ref(null);
      const showMove = ref(null);
      const move = reactive({ amount: '', reason: '' });
      const showClose = ref(false);
      const counts = reactive(Object.fromEntries(DENOMS.map((d) => [d, ''])));
      const useDenoms = ref(false);
      const counted = ref('');
      const closeNotes = ref('');
      const saving = ref(false);

      const current = computed(() => store.cash);
      const countedTotal = computed(() => (useDenoms.value
        ? App.round2(DENOMS.reduce((s, d) => s + d * (Number(counts[d]) || 0), 0))
        : Number(counted.value) || 0));
      const diff = computed(() => (current.value ? App.round2(countedTotal.value - current.value.expected_cash) : 0));

      async function loadHistory() {
        try { history.value = await App.api.get('/cash/sessions', { page: page.value, limit: 20 }); } catch (e) { App.error(e); }
      }
      onMounted(async () => {
        await App.refreshCash();
        loading.value = false;
        loadHistory();
      });

      async function openCash() {
        saving.value = true;
        try {
          store.cash = await App.api.post('/cash/open', { opening_amount: Number(opening.value) || 0, notes: openNotes.value });
          App.toast('Caja abierta');
          loadHistory();
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }

      async function saveMove() {
        saving.value = true;
        try {
          store.cash = await App.api.post('/cash/movements', { type: showMove.value, amount: Number(move.amount), reason: move.reason });
          App.toast(showMove.value === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
          showMove.value = null;
          move.amount = ''; move.reason = '';
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }

      async function closeCash() {
        if (diff.value !== 0 && !(await App.confirm({
          title: diff.value < 0 ? 'Hay un faltante' : 'Hay un sobrante',
          message: `La diferencia es de ${fmt.money(Math.abs(diff.value))}. ¿Deseas cerrar la caja de todos modos?`,
          confirmText: 'Cerrar caja', danger: diff.value < 0,
        }))) return;
        saving.value = true;
        try {
          const s = await App.api.post('/cash/close', { counted_amount: countedTotal.value, notes: closeNotes.value });
          store.cash = null;
          showClose.value = false;
          detail.value = s;
          App.toast('Corte de caja realizado');
          App.printCashReport(s);
          loadHistory();
        } catch (e) { App.error(e); } finally { saving.value = false; }
      }

      async function openDetail(row) {
        try { detail.value = await App.api.get('/cash/sessions/' + row.id); } catch (e) { App.error(e); }
      }
      function changePage(p) { page.value = p; loadHistory(); }
      function startClose() {
        DENOMS.forEach((d) => { counts[d] = ''; });
        counted.value = '';
        closeNotes.value = '';
        showClose.value = true;
      }

      return { loading, opening, openNotes, history, page, detail, showMove, move, showClose, counts, useDenoms, counted, closeNotes, saving,
        current, countedTotal, diff, DENOMS, openCash, saveMove, closeCash, openDetail, changePage, startClose, fmt, can: App.can };
    },
    template: `
      <loading v-if="loading" />
      <div v-else class="flex-col gap-16">
        <div v-if="!current" class="card" style="max-width: 560px">
          <div class="card-header"><h3><icon name="wallet" /> Abrir caja</h3></div>
          <div class="card-body flex-col gap-12">
            <p class="muted">Captura el efectivo con el que inicias el turno (fondo para dar cambio).</p>
            <div class="form-group"><label>Fondo inicial</label><money-input v-model="opening" size="input-lg" @enter="openCash" /></div>
            <div class="form-group"><label>Notas (opcional)</label><input class="input" v-model="openNotes" placeholder="Ej. Turno matutino" /></div>
            <button class="btn btn-primary btn-lg" :disabled="saving" @click="openCash"><icon name="wallet" /> Abrir caja</button>
          </div>
        </div>

        <template v-else>
          <div class="stats">
            <stat-card icon="clock" label="Caja abierta desde" :value="fmt.time(current.opened_at)" :sub="fmt.date(current.opened_at) + ' · ' + current.user_name" />
            <stat-card icon="receipt" color="purple" label="Vendido en el turno" :value="fmt.money(current.sales.total)" :sub="current.sales.count + ' ticket(s)'" />
            <stat-card icon="banknote" color="green" label="Efectivo esperado en caja" :value="fmt.money(current.expected_cash)" :sub="'Fondo ' + fmt.money(current.opening_amount)" />
          </div>
          <div class="card">
            <div class="card-header">
              <h3><icon name="calculator" /> Turno actual #{{ current.id }}</h3>
              <div class="ml-auto flex flex-wrap">
                <button class="btn" @click="showMove = 'entrada'"><icon name="circle-plus" /> Entrada</button>
                <button class="btn" @click="showMove = 'salida'"><icon name="circle-minus" /> Salida</button>
                <button class="btn" @click="App.printCashReport(current)"><icon name="printer" /> Corte parcial</button>
                <button class="btn btn-primary" @click="startClose"><icon name="lock" /> Cerrar caja</button>
              </div>
            </div>
            <div class="card-body"><session-summary :s="current" /></div>
          </div>
        </template>

        <div class="card">
          <div class="card-header"><h3><icon name="history" /> Historial de cortes</h3></div>
          <div class="table-wrap" v-if="history">
            <table class="table">
              <thead><tr><th>#</th><th>Cajero</th><th>Apertura</th><th>Cierre</th><th class="num">Ventas</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="r in history.rows" :key="r.id" class="clickable" @click="openDetail(r)">
                  <td class="mono">{{ r.id }}</td>
                  <td>{{ r.user_name }}</td>
                  <td class="nowrap">{{ fmt.datetime(r.opened_at) }}</td>
                  <td class="nowrap">{{ r.closed_at ? fmt.datetime(r.closed_at) : '—' }}</td>
                  <td class="num">{{ fmt.money(r.sales_total) }} <span class="muted tiny">({{ r.sales_count }})</span></td>
                  <td class="num">{{ r.expected_amount != null ? fmt.money(r.expected_amount) : '—' }}</td>
                  <td class="num">{{ r.counted_amount != null ? fmt.money(r.counted_amount) : '—' }}</td>
                  <td class="num bold" :class="r.difference < 0 ? 'text-danger' : r.difference > 0 ? 'text-success' : ''">{{ r.difference != null ? fmt.money(r.difference) : '—' }}</td>
                  <td><span class="badge" :class="r.status === 'abierta' ? 'badge-success' : ''">{{ r.status === 'abierta' ? 'Abierta' : 'Cerrada' }}</span></td>
                </tr>
              </tbody>
            </table>
            <empty v-if="!history.rows.length" icon="wallet" title="Sin cortes registrados" />
          </div>
          <pagination v-if="history" :page="page" :total="history.total" :limit="history.limit" @update:page="changePage" />
        </div>

        <modal v-if="showMove" :title="showMove === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo'" :icon="showMove === 'entrada' ? 'circle-plus' : 'circle-minus'" size="sm" @close="showMove = null">
          <div class="flex-col gap-12">
            <div class="form-group"><label class="req">Monto</label><money-input v-model="move.amount" size="input-lg" /></div>
            <div class="form-group"><label class="req">Motivo</label>
              <input class="input" v-model="move.reason" :placeholder="showMove === 'entrada' ? 'Ej. Cambio adicional' : 'Ej. Pago a proveedor, compra de insumos…'" list="move-reasons" @keydown.enter="saveMove" />
              <datalist id="move-reasons"><option>Pago a proveedor</option><option>Compra de insumos</option><option>Retiro de efectivo</option><option>Cambio adicional</option><option>Pago de servicios</option></datalist>
            </div>
          </div>
          <template #footer>
            <button class="btn" @click="showMove = null">Cancelar</button>
            <button class="btn btn-primary" :disabled="saving || !move.amount || !move.reason" @click="saveMove"><icon name="save" /> Registrar</button>
          </template>
        </modal>

        <modal v-if="showClose" title="Cerrar caja (corte)" icon="lock" size="lg" @close="showClose = false">
          <div class="grid grid-2">
            <div>
              <div class="flex between mb-8">
                <span class="label">Efectivo contado</span>
                <label class="switch small"><input type="checkbox" v-model="useDenoms" /><span class="track"></span>Contar billetes y monedas</label>
              </div>
              <div v-if="useDenoms" class="card">
                <table class="table table-sm">
                  <tbody>
                    <tr v-for="d in DENOMS" :key="d">
                      <td class="bold">{{ fmt.money(d) }}</td>
                      <td style="width:110px"><input class="input input-sm num" type="number" min="0" v-model="counts[d]" placeholder="0" /></td>
                      <td class="num muted">{{ fmt.money(d * (Number(counts[d]) || 0)) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <money-input v-else v-model="counted" size="input-lg" />
              <div class="form-group mt-12"><label>Notas del corte</label><textarea class="textarea" v-model="closeNotes" placeholder="Observaciones (opcional)"></textarea></div>
            </div>
            <div class="flex-col gap-12">
              <div class="pay-total"><div class="label">Efectivo esperado</div><div class="value" style="font-size:30px">{{ fmt.money(current.expected_cash) }}</div></div>
              <div class="pay-total" style="background:linear-gradient(135deg,#334155,#475569)"><div class="label">Contado</div><div class="value" style="font-size:30px">{{ fmt.money(countedTotal) }}</div></div>
              <div class="change-box" :class="diff < 0 ? 'missing' : 'ok'">
                <span>{{ diff < 0 ? 'Faltante' : diff > 0 ? 'Sobrante' : 'Caja cuadrada' }}</span>
                <span class="value">{{ fmt.money(Math.abs(diff)) }}</span>
              </div>
              <p class="small muted">Al cerrar se imprimirá el corte de caja. Las ventas con tarjeta y transferencia se muestran en el reporte pero no se cuentan en efectivo.</p>
            </div>
          </div>
          <template #footer>
            <button class="btn" @click="showClose = false">Cancelar</button>
            <button class="btn btn-primary" :disabled="saving" @click="closeCash"><icon name="lock" /> Cerrar caja e imprimir corte</button>
          </template>
        </modal>

        <modal v-if="detail" :title="'Turno #' + detail.id + ' · ' + detail.user_name" icon="wallet" size="lg" @close="detail = null">
          <div class="flex flex-wrap mb-16 small muted">
            <span><icon name="clock" :size="14" /> Apertura: {{ fmt.datetime(detail.opened_at) }}</span>
            <span v-if="detail.closed_at">· Cierre: {{ fmt.datetime(detail.closed_at) }}</span>
          </div>
          <session-summary :s="detail" />
          <div v-if="detail.notes" class="alert alert-info mt-16"><icon name="file-text" />{{ detail.notes }}</div>
          <template #footer>
            <button class="btn btn-primary" @click="App.printCashReport(detail)"><icon name="printer" /> Imprimir</button>
          </template>
        </modal>
      </div>`,
  };
})();
