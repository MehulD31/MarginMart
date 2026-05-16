import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface InvoicePartner {
  id: string;
  name: string;
  address: string;
  phone: string;
}

export interface InvoiceOrder {
  id: string;
  product_name: string;
  created_at: string;
  quantity?: number;
  mrp?: number;
  selling_price: number;
  deal_price: number;
  operator_name?: string;
}

export interface InvoiceRecord {
  id: string;
  invoice_no: string;
  shopkeeper_id: string | null;
  partner_name: string;
  partner_phone: string | null;
  order_ids: string[];
  item_count: number;
  total_amount: number;
  total_savings: number;
  generated_by: string | null;
  generated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─── Fetch invoice history for a partner ─────────────────────────────────────
export async function fetchPartnerInvoices(shopkeeperId: string): Promise<InvoiceRecord[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('shopkeeper_id', shopkeeperId)
    .order('generated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Main invoice generator ───────────────────────────────────────────────────
export async function generateInvoice(
  partner: InvoicePartner,
  orders: InvoiceOrder[],
  operatorName?: string,
  isPreview: boolean = false
): Promise<string> {
  // 0. Open window immediately to avoid popup blocker
  const newWin = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes');
  if (newWin) {
    newWin.document.write(`
      <html>
        <head><title>Generating Invoice...</title></head>
        <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; color:#64748b; background:#f8fafc;">
          <div style="text-align:center;">
            <div style="border:4px solid #e2e8f0; border-top:4px solid #22c55e; border-radius:50%; width:40px; height:40px; animation:spin 1s linear infinite; margin:0 auto 20px;"></div>
            <h2 style="color:#1e293b; margin-bottom:8px;">Preparing Your Invoice</h2>
            <p>Please wait while we secure your record...</p>
          </div>
          <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        </body>
      </html>
    `);
  }

  // 1. Get sequential invoice number from DB (race-safe advisory lock) if official
  let invoiceNo = 'PREVIEW';
  try {
    if (!isPreview) {
      const { data, error: seqErr } = await supabase
        .rpc('generate_invoice_no');
      if (seqErr || !data) throw new Error('Failed to generate invoice number');
      invoiceNo = data as string;
    }
  } catch (err) {
    if (newWin) newWin.close();
    throw err;
  }

  const invoiceDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  let totalAmount = 0;
  let totalSavings = 0;

  const rows = orders.map((order, idx) => {
    const qty = order.quantity || 1;
    const rate = order.selling_price / qty;
    const savingPerPc = order.mrp ? order.mrp - rate : 0;
    const savingPercent = order.mrp ? Math.round((savingPerPc / order.mrp) * 100) : 0;
    
    totalAmount += order.selling_price;
    totalSavings += savingPerPc * qty;
    const date = new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const isEven = idx % 2 === 0;
    return `
      <tr style="background:${isEven ? '#ffffff' : '#f9fafb'};">
        <td style="padding:8px 12px; font-weight:600; color:#1e293b;">${order.product_name}</td>
        <td style="padding:8px 12px; color:#64748b; text-align:center;">${date}</td>
        <td style="padding:8px 12px; text-align:center; font-weight:700;">${qty}</td>
        <td style="padding:8px 12px; text-align:right; color:#64748b;">${order.mrp ? '₹' + formatINR(order.mrp) : '—'}</td>
        <td style="padding:8px 12px; text-align:right; color:#475569;">₹${formatINR(rate)}</td>
        <td style="padding:8px 12px; text-align:right; font-weight:700; color:${savingPerPc > 0 ? '#16a34a' : '#94a3b8'};">
          ${savingPerPc > 0 ? '₹' + formatINR(savingPerPc) : '—'}
        </td>
        <td style="padding:8px 12px; text-align:center; font-weight:700; color:${savingPercent > 0 ? '#16a34a' : '#94a3b8'};">
          ${savingPercent > 0 ? savingPercent + '%' : '—'}
        </td>
        <td style="padding:8px 12px; text-align:right; font-weight:800; color:#1e293b;">₹${formatINR(order.selling_price)}</td>
      </tr>`;
  }).join('');

  // 2. Insert record to audit ledger if not preview
  if (!isPreview) {
    const { error: insertErr } = await supabase
      .from('invoices')
      .insert({
        invoice_no: invoiceNo,
        shopkeeper_id: partner.id,
        partner_name: partner.name,
        partner_phone: partner.phone,
        order_ids: orders.map(o => o.id),
        item_count: orders.length,
        total_amount: totalAmount,
        total_savings: totalSavings,
        generated_by: operatorName || null
      });

    if (insertErr) {
      console.error('Invoice recording failed:', insertErr);
      throw new Error('Failed to record invoice');
    }
  }

  // 3. Build invoice HTML
  const savingsBadge = totalSavings > 0 ? `
    <div style="display:flex; align-items:center; gap:8px; background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:8px; padding:8px 14px; margin-bottom:10px; page-break-inside:avoid;">
      <span style="font-size:18px;">🎉</span>
      <div>
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#15803d;">Your Total Savings with MarginMart</div>
        <div style="font-size:18px; font-weight:900; color:#16a34a; letter-spacing:-0.02em;">₹${formatINR(totalSavings)}</div>
      </div>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice ${invoiceNo} – ${partner.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #e2e8f0; min-height: 100vh; padding: 24px 16px 48px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page {
      width: 794px; margin: 0 auto; background: #ffffff;
      border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      overflow: hidden; display: flex; flex-direction: column; position: relative;
    }
    .inv-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #064e3b 100%);
      padding: 22px 30px 18px; display: flex; justify-content: space-between;
      align-items: flex-start; gap: 20px;
    }
    .inv-brand { color: white; }
    .inv-brand-tag { font-size: 9px; color: #94a3b8; font-weight: 500; margin-top: 2px; letter-spacing: 0.05em; text-transform: uppercase; }
    .inv-brand-location { font-size: 10px; color: #64748b; margin-top: 4px; }
    .inv-meta { text-align: right; color: white; }
    .inv-title { font-size: 24px; font-weight: 900; letter-spacing: -0.03em; color: white; }
    .inv-no { font-size: 10px; color: #86efac; font-weight: 700; letter-spacing: 0.08em; margin-top: 2px; }
    .inv-dates { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
    .inv-date-row { font-size: 10px; color: #94a3b8; display: flex; gap: 6px; justify-content: flex-end; }
    .inv-date-row span:first-child { color: #64748b; }
    .inv-date-row span:last-child { color: #e2e8f0; font-weight: 600; }
    .inv-parties {
      padding: 18px 30px; display: grid; grid-template-columns: 1fr 1px 1fr;
      gap: 0; border-bottom: 1px solid #f1f5f9;
    }
    .inv-divider { background: #f1f5f9; }
    .inv-party { padding: 0 20px; }
    .inv-party:first-child { padding-left: 0; }
    .inv-party:last-child { padding-right: 0; text-align: right; }
    .inv-party-label { font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #16a34a; margin-bottom: 8px; }
    .inv-party-name { font-size: 18px; font-weight: 800; color: #1e293b; margin-bottom: 6px; line-height: 1.2; }
    .inv-party-detail { font-size: 12px; color: #64748b; line-height: 1.6; }
    .inv-party-phone { font-size: 12px; color: #334155; font-weight: 600; margin-top: 6px; }
    .inv-table-wrap { padding: 16px 30px 0; flex: 1; }
    .inv-section-label { font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #94a3b8; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #0f172a; color: white; }
    thead th { padding: 8px 12px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    thead th:nth-child(1) { text-align: left; }
    thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(7) { text-align: center; }
    thead th:nth-child(4), thead th:nth-child(5), thead th:nth-child(6), thead th:nth-child(8) { text-align: right; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tbody td { vertical-align: middle; }
    tfoot tr { background: #f8fafc; }
    tfoot td { padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; border-top: 2px solid #e2e8f0; }
    tfoot td:last-child { color: #1e293b; text-align: right; font-weight: 900; font-size: 13px; }
    .inv-footer { padding: 14px 30px 18px; border-top: 2px solid #f1f5f9; }
    .inv-totals-row { display: flex; justify-content: flex-end; align-items: flex-start; gap: 32px; margin-top: 16px; }
    .inv-grand-box { background: linear-gradient(135deg, #0f172a, #1e293b); border-radius: 10px; padding: 10px 16px; text-align: right; min-width: 140px; }
    .inv-grand-label { font-size: 8.5px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2px; }
    .inv-grand-amount { font-size: 24px; font-weight: 900; color: white; letter-spacing: -0.04em; }
    .inv-terms { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 12px 30px 18px; border-top: 1px solid #f1f5f9; margin-top: auto; }
    .inv-terms-title { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; margin-bottom: 8px; }
    .inv-terms ol { padding-left: 14px; }
    .inv-terms li { font-size: 10px; color: #94a3b8; line-height: 1.7; }
    .inv-sign-box { text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; }
    .inv-sign-line { width: 140px; border-top: 1.5px solid #cbd5e1; margin-bottom: 5px; }
    .inv-sign-label { font-size: 10px; color: #94a3b8; font-weight: 600; }
    .inv-stamp {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 80px; font-weight: 900; color: rgba(22,163,74,0.04);
      letter-spacing: -0.04em; pointer-events: none; text-transform: uppercase; white-space: nowrap;
    }
    .print-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: rgba(15,23,42,0.97); backdrop-filter: blur(12px);
      display: flex; justify-content: center; align-items: center; gap: 12px;
      padding: 12px 24px; z-index: 100;
    }
    .print-bar p { color: #94a3b8; font-size: 12px; }
    .btn-print {
      background: linear-gradient(135deg, #16a34a, #15803d); color: white; border: none;
      border-radius: 8px; padding: 10px 28px; font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: 'Inter', sans-serif; transition: transform 0.15s;
    }
    .btn-print:hover { transform: translateY(-1px); }
    .btn-close {
      background: rgba(255,255,255,0.08); color: #94a3b8;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
      padding: 10px 20px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: 'Inter', sans-serif;
    }
    @media print {
      body { background: white; padding: 0; zoom: 0.92; }
      .page { width: 100%; min-height: auto; border-radius: 0; box-shadow: none; margin: 0; }
      .print-bar { display: none !important; }
      .inv-stamp { display: none; }
    }
  </style>
</head>
<body>

<div class="page">
  <div class="inv-stamp">MARGINMART</div>

  <!-- HEADER -->
  <div class="inv-header">
    <div class="inv-brand">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:40px; height:40px; background:linear-gradient(135deg,#22c55e,#16a34a); border-radius:10px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 12px rgba(34,197,94,0.4); flex-shrink:0;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div>
          <div style="font-size:20px; font-weight:900; letter-spacing:-0.03em; line-height:1;">
            <span style="color:#ffffff;">Margin</span><span style="color:#4ade80;">Mart</span>
          </div>
          <div class="inv-brand-tag">Har Category Ka Sasta Maal</div>
        </div>
      </div>
      <div class="inv-brand-location">Pune, Maharashtra, India</div>
    </div>
    <div class="inv-meta">
      <div class="inv-title">TAX INVOICE</div>
      <div class="inv-no">${invoiceNo}</div>
      <div class="inv-dates">
        <div class="inv-date-row"><span>Invoice Date</span><span>${invoiceDate}</span></div>
        <div class="inv-date-row"><span>Due By</span><span>${dueDate}</span></div>
        ${operatorName ? `<div class="inv-date-row"><span>Generated By</span><span>${operatorName}</span></div>` : ''}
      </div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="inv-parties">
    <div class="inv-party">
      <div class="inv-party-label">Bill To</div>
      <div class="inv-party-name">${partner.name}</div>
      <div class="inv-party-detail">${partner.address || 'Address not on file'}</div>
      <div class="inv-party-phone">📞 ${partner.phone}</div>
    </div>
    <div class="inv-divider"></div>
    <div class="inv-party">
      <div class="inv-party-label">From</div>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; justify-content:flex-end;">
        <div style="font-size:16px; font-weight:900; letter-spacing:-0.02em;">
          <span style="color:#1e293b;">Margin</span><span style="color:#16a34a;">Mart</span>
        </div>
        <div style="width:26px; height:26px; background:linear-gradient(135deg,#22c55e,#16a34a); border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
      </div>
      <div class="inv-party-detail">Har Category Ka Sasta Maal<br/>Pune, Maharashtra, India</div>
    </div>
  </div>

  <!-- TABLE -->
  <div class="inv-table-wrap">
    <div class="inv-section-label">Order Details — ${orders.length} item${orders.length !== 1 ? 's' : ''}</div>
    <table>
      <thead>
        <tr>
          <th style="width:28%; text-align:left; border-radius:6px 0 0 6px;">Item Description</th>
          <th style="width:10%;">Date</th>
          <th style="width:6%;">Qty</th>
          <th style="width:11%;">MRP</th>
          <th style="width:11%;">Rate/pc</th>
          <th style="width:11%; color:#86efac;">Save/pc</th>
          <th style="width:11%; color:#86efac;">DISC %</th>
          <th style="width:12%; border-radius:0 6px 6px 0;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="7" style="text-align:right; padding-right:14px; font-size:11px; font-weight:700; color:#64748b;">SUBTOTAL</td>
          <td>₹${formatINR(totalAmount)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- TOTALS -->
  <div class="inv-footer">
    ${savingsBadge}
    <div class="inv-totals-row">
      <div class="inv-grand-box">
        <div class="inv-grand-label">Total Amount Due</div>
        <div class="inv-grand-amount">₹${formatINR(totalAmount)}</div>
      </div>
    </div>
  </div>

  <!-- TERMS -->
  <div class="inv-terms">
    <div>
      <div class="inv-terms-title">Terms &amp; Conditions</div>
      <ol>
        <li>Goods once sold will not be taken back or exchanged.</li>
        <li>Payment is due within 7 days of invoice date.</li>
        <li>Interest @ 18% p.a. will be charged for delayed payments.</li>
        <li>All disputes are subject to Pune Jurisdiction.</li>
      </ol>
    </div>
    <div class="inv-sign-box">
      <div class="inv-sign-line"></div>
      <div class="inv-sign-label">Authorised Signatory — MarginMart</div>
      <div style="margin-top:10px; font-size:9px; color:#cbd5e1; font-style:italic;">
        This is a computer-generated invoice.<br/>No physical signature required.
      </div>
    </div>
  </div>
</div>

<!-- PRINT BAR -->
<div class="print-bar">
  <p>Invoice ${invoiceNo} · ${partner.name} · ₹${formatINR(totalAmount)} ${isPreview ? '<span style="color: #fbbf24; font-weight: bold; margin-left: 8px;">(PREVIEW ONLY)</span>' : ''}</p>
  <button class="btn-print" onclick="window.print()">⬇ Download / Print PDF</button>
  <button class="btn-close" onclick="window.close()">Close</button>
</div>

<script>window.focus();</script>
</body>
</html>`;

  // 4. Output to window
  if (newWin) {
    newWin.document.open();
    newWin.document.write(html);
    newWin.document.close();
    
    // Auto-focus and optionally print
    setTimeout(() => {
      newWin.focus();
      if (!isPreview) {
        // Subtle hint for official invoices
        console.log('Official invoice generated: ' + invoiceNo);
      }
    }, 500);
  } else {
    // If popup was blocked, we already inserted into DB (if !isPreview),
    // but the user can't see the invoice.
    alert('Invoice ' + (isPreview ? 'Preview' : invoiceNo) + ' generated, but the window was blocked by your browser. Please allow popups for this site.');
  }

  return invoiceNo as string;
}
