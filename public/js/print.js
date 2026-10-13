/* Impresión de tickets, cortes de caja y etiquetas con código de barras. */
(function () {
  'use strict';
  const fmt = App.fmt;
  const S = () => App.store.settings;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Imprime HTML en un iframe oculto (no abre ventanas emergentes). */
  App.printHtml = (html) => {
    const old = document.getElementById('print-frame');
    if (old) old.remove();
    const frame = document.createElement('iframe');
    frame.id = 'print-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    const active = document.activeElement;
    setTimeout(() => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (e) {
        App.error(new Error('No se pudo imprimir: ' + e.message));
      } finally {
        // Devolver el foco a la aplicación para que sigan funcionando los atajos de teclado.
        window.focus();
        const target = document.querySelector('[data-autofocus]') || (active && document.contains(active) ? active : null);
        if (target) target.focus();
      }
    }, 300);
  };

  function barcodeSvg(value, opts = {}) {
    if (!window.JsBarcode || !value) return '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      let format = opts.format || 'CODE128';
      if (!opts.format && /^\d{13}$/.test(value)) format = 'EAN13';
      window.JsBarcode(svg, value, {
        format,
        width: opts.width || 1.6,
        height: opts.height || 40,
        displayValue: opts.displayValue !== false,
        fontSize: opts.fontSize || 12,
        margin: opts.margin ?? 2,
        textMargin: 1,
      });
    } catch (e) {
      try { window.JsBarcode(svg, value, { format: 'CODE128', width: opts.width || 1.4, height: opts.height || 40, fontSize: opts.fontSize || 12, margin: 2 }); }
      catch (e2) { return ''; }
    }
    return svg.outerHTML;
  }
  App.barcodeSvg = barcodeSvg;

  function ticketShell(body, width) {
    const w = Number(width || S().ticket_width || 80);
    const inner = w <= 58 ? 48 : 72;
    return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>
      @page { size: ${w}mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: 'Courier New', ui-monospace, monospace; font-size: ${w <= 58 ? 10.5 : 12}px; color: #000; }
      .t { width: ${inner}mm; margin: 0 auto; padding: 4mm 0 6mm; }
      .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
      .big { font-size: 1.45em; font-weight: 700; }
      .store { font-size: 1.35em; font-weight: 800; }
      hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { vertical-align: top; padding: 1px 0; }
      .row { display: flex; justify-content: space-between; gap: 6px; }
      .item-name { font-weight: 700; }
      .muted { color: #333; }
      .foot { white-space: pre-wrap; text-align: center; margin-top: 6px; }
      svg { max-width: 100%; height: auto; }
    </style></head><body><div class="t">${body}</div></body></html>`;
  }

  function storeHeader(s = S()) {
    return `
      <div class="c store">${esc(s.store_name)}</div>
      ${s.store_slogan ? `<div class="c">${esc(s.store_slogan)}</div>` : ''}
      ${s.store_address ? `<div class="c muted">${esc(s.store_address)}</div>` : ''}
      ${s.store_phone ? `<div class="c muted">Tel. ${esc(s.store_phone)}</div>` : ''}
      ${s.store_tax_id ? `<div class="c muted">RFC: ${esc(s.store_tax_id)}</div>` : ''}`;
  }

  /** Construye el HTML del ticket de venta. */
  App.ticketHtml = (sale, opts = {}) => {
    const s = { ...S(), ...(opts.settings || {}) };
    const items = sale.items.map((i) => `
      <div class="item-name">${esc(i.name)}</div>
      ${i.variant_label ? `<div class="muted">${esc(i.variant_label)}</div>` : ''}
      <div class="row"><span>${i.quantity} x ${fmt.money(i.unit_price)}</span><span>${fmt.money(i.unit_price * i.quantity)}</span></div>
      ${i.discount > 0 ? `<div class="row muted"><span>&nbsp; Descuento</span><span>-${fmt.money(i.discount)}</span></div>` : ''}
      ${i.returned_qty > 0 ? `<div class="row muted"><span>&nbsp; Devuelto: ${i.returned_qty}</span><span></span></div>` : ''}`).join('');
    const payments = sale.payments.map((p) => `<div class="row"><span>${esc(fmt.method(p.method))}</span><span>${fmt.money(p.amount)}</span></div>`).join('');
    const discount = (sale.line_discount || 0) + (sale.global_discount || 0);
    const body = `
      ${storeHeader(s)}
      <hr>
      ${opts.copy ? '<div class="c b">*** REIMPRESIÓN ***</div>' : ''}
      ${sale.status === 'cancelada' ? '<div class="c b big">*** CANCELADA ***</div>' : ''}
      <div class="row"><span class="b">Ticket: ${esc(sale.folio)}</span></div>
      <div>Fecha: ${fmt.datetime(sale.created_at)}</div>
      <div>Atendió: ${esc(sale.user_name || '')}</div>
      ${sale.customer_name ? `<div>Cliente: ${esc(sale.customer_name)}</div>` : ''}
      <hr>
      ${items}
      <hr>
      <div class="row"><span>Artículos</span><span>${sale.items_count}</span></div>
      ${discount > 0 ? `<div class="row"><span>Importe</span><span>${fmt.money(sale.gross)}</span></div><div class="row"><span>Descuento</span><span>-${fmt.money(discount)}</span></div>` : ''}
      <div class="row"><span>Subtotal</span><span>${fmt.money(sale.subtotal)}</span></div>
      <div class="row"><span>IVA ${Number(sale.tax_rate)}%${sale.tax_included ? ' (incluido)' : ''}</span><span>${fmt.money(sale.tax)}</span></div>
      <div class="row big"><span>TOTAL</span><span>${fmt.money(sale.total)}</span></div>
      <hr>
      ${payments}
      ${sale.change_amount > 0 ? `<div class="row"><span>Pagó con</span><span>${fmt.money(sale.paid)}</span></div><div class="row b"><span>Cambio</span><span>${fmt.money(sale.change_amount)}</span></div>` : ''}
      ${sale.returned_total > 0 ? `<hr><div class="row b"><span>Devoluciones</span><span>-${fmt.money(sale.returned_total)}</span></div>` : ''}
      ${sale.notes ? `<hr><div>Nota: ${esc(sale.notes)}</div>` : ''}
      <hr>
      <div class="c">${barcodeSvg(sale.folio, { height: 34, width: 1.3, fontSize: 11 })}</div>
      ${s.ticket_footer ? `<div class="foot">${esc(s.ticket_footer)}</div>` : ''}`;
    return ticketShell(body, s.ticket_width);
  };

  App.printTicket = (sale, opts) => App.printHtml(App.ticketHtml(sale, opts));

  /** Comprobante de devolución. */
  App.printReturn = (sale, ret) => {
    const items = ret.items.map((i) => `
      <div class="item-name">${esc(i.name)}</div>${i.variant_label ? `<div class="muted">${esc(i.variant_label)}</div>` : ''}
      <div class="row"><span>${i.quantity} pza(s)</span><span>${fmt.money(i.amount)}</span></div>`).join('');
    App.printHtml(ticketShell(`
      ${storeHeader()}<hr>
      <div class="c b big">DEVOLUCIÓN</div>
      <div>Folio: ${esc(ret.folio)}</div>
      <div>Venta original: ${esc(sale.folio)}</div>
      <div>Fecha: ${fmt.datetime(ret.created_at)}</div>
      <div>Atendió: ${esc(ret.user_name || '')}</div>
      ${ret.reason ? `<div>Motivo: ${esc(ret.reason)}</div>` : ''}
      <hr>${items}<hr>
      <div class="row big"><span>REEMBOLSO</span><span>${fmt.money(ret.total)}</span></div>
      <div class="row"><span>Forma</span><span>${esc(fmt.method(ret.refund_method))}</span></div>
      <br><br><div class="c">______________________</div><div class="c">Firma del cliente</div>`));
  };

  /** Corte de caja. */
  App.printCashReport = (s) => {
    const methods = (s.by_method || []).map((m) => `<div class="row"><span>${esc(fmt.method(m.method))} (${m.count})</span><span>${fmt.money(m.amount)}</span></div>`).join('') || '<div class="muted">Sin ventas</div>';
    const movs = (s.movements || []).map((m) => `<div class="row"><span>${m.type === 'entrada' ? '+' : '-'} ${esc(m.reason)}</span><span>${fmt.money(m.amount)}</span></div>`).join('');
    App.printHtml(ticketShell(`
      ${storeHeader()}<hr>
      <div class="c b big">${s.status === 'cerrada' ? 'CORTE DE CAJA' : 'CORTE PARCIAL (X)'}</div>
      <div>Turno #${s.id} · ${esc(s.user_name)}</div>
      <div>Apertura: ${fmt.datetime(s.opened_at)}</div>
      ${s.closed_at ? `<div>Cierre: ${fmt.datetime(s.closed_at)}</div>` : `<div>Impreso: ${fmt.datetime(App.nowLocal())}</div>`}
      <hr>
      <div class="b">VENTAS</div>
      <div class="row"><span>Tickets</span><span>${s.sales.count}</span></div>
      <div class="row"><span>Artículos</span><span>${s.sales.units}</span></div>
      <div class="row"><span>Descuentos</span><span>${fmt.money(s.sales.discounts)}</span></div>
      <div class="row b"><span>Total vendido</span><span>${fmt.money(s.sales.total)}</span></div>
      ${s.cancelled.count ? `<div class="row muted"><span>Canceladas (${s.cancelled.count})</span><span>${fmt.money(s.cancelled.total)}</span></div>` : ''}
      <hr><div class="b">POR FORMA DE PAGO</div>${methods}
      ${s.refunds_total ? `<hr><div class="b">DEVOLUCIONES</div>${s.refunds.map((r) => `<div class="row"><span>${esc(fmt.method(r.method))}</span><span>-${fmt.money(r.amount)}</span></div>`).join('')}` : ''}
      ${movs ? `<hr><div class="b">ENTRADAS / SALIDAS</div>${movs}` : ''}
      <hr><div class="b">EFECTIVO EN CAJA</div>
      <div class="row"><span>Fondo inicial</span><span>${fmt.money(s.opening_amount)}</span></div>
      <div class="row"><span>+ Ventas en efectivo</span><span>${fmt.money(s.cash_sales)}</span></div>
      ${s.cash_refunds ? `<div class="row"><span>- Devoluciones</span><span>${fmt.money(s.cash_refunds)}</span></div>` : ''}
      ${s.inflows ? `<div class="row"><span>+ Entradas</span><span>${fmt.money(s.inflows)}</span></div>` : ''}
      ${s.outflows ? `<div class="row"><span>- Salidas</span><span>${fmt.money(s.outflows)}</span></div>` : ''}
      <div class="row b"><span>Esperado</span><span>${fmt.money(s.expected_cash)}</span></div>
      ${s.status === 'cerrada' ? `
        <div class="row b"><span>Contado</span><span>${fmt.money(s.counted_amount)}</span></div>
        <div class="row big"><span>${s.difference >= 0 ? (s.difference > 0 ? 'SOBRANTE' : 'CUADRA') : 'FALTANTE'}</span><span>${fmt.money(Math.abs(s.difference))}</span></div>` : ''}
      ${s.notes ? `<hr><div>Notas: ${esc(s.notes)}</div>` : ''}
      <br><br><div class="c">______________________</div><div class="c">Firma</div>`));
  };

  /**
   * Etiquetas con código de barras.
   * items: [{ name, variant, sku, barcode, price, copies }]
   * format: 'sheet' (hoja carta, 3 columnas) | 'roll' (rollo 50x25 mm)
   */
  App.printLabels = (items, opts = {}) => {
    const format = opts.format || 'sheet';
    const showPrice = opts.showPrice !== false;
    const store = S().store_name;
    const labels = [];
    for (const it of items) {
      const code = it.barcode || it.sku;
      const svg = barcodeSvg(code, { height: format === 'roll' ? 30 : 38, width: format === 'roll' ? 1.3 : 1.5, fontSize: 11, margin: 0 });
      for (let i = 0; i < Math.max(1, Number(it.copies) || 1); i++) {
        labels.push(`<div class="lbl">
          ${opts.showStore ? `<div class="st">${esc(store)}</div>` : ''}
          <div class="nm">${esc(it.name)}</div>
          ${it.variant ? `<div class="vr">${esc(it.variant)}</div>` : ''}
          <div class="bc">${svg}</div>
          ${showPrice ? `<div class="pr">${fmt.money(it.price)}</div>` : ''}
        </div>`);
      }
    }
    const css = format === 'roll'
      ? `@page { size: 50mm 25mm; margin: 0; } body { margin: 0; }
         .lbl { width: 50mm; height: 25mm; padding: 1mm 2mm; page-break-after: always; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; }
         .nm { font-size: 8pt; } .vr { font-size: 7pt; } .pr { font-size: 10pt; } .st { font-size: 6pt; } .bc svg { height: 11mm; }`
      : `@page { size: letter; margin: 8mm; } body { margin: 0; }
         .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
         .lbl { border: 1px dashed #bbb; border-radius: 2mm; height: 33mm; padding: 2mm; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid; }
         .nm { font-size: 9pt; } .vr { font-size: 8pt; } .pr { font-size: 13pt; } .st { font-size: 7pt; } .bc svg { height: 14mm; }`;
    App.printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
      * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #000; }
      .lbl { text-align: center; } .nm { font-weight: 700; line-height: 1.1; max-height: 2.3em; overflow: hidden; }
      .vr { color: #333; } .pr { font-weight: 800; } .st { color: #555; text-transform: uppercase; letter-spacing: .05em; }
      .bc svg { max-width: 100%; display: block; margin: 1mm auto 0; }
      ${css}</style></head><body><div class="${format === 'roll' ? '' : 'sheet'}">${labels.join('')}</div></body></html>`);
  };
})();
