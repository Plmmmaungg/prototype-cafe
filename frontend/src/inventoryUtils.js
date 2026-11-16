export const INVENTORY_UNITS = ['kg', 'g', 'liter', 'ml', 'pcs', 'bottle', 'pack', 'box', 'can', 'sack', 'tray', 'dozen', 'loaf', 'cup'];

export const INVENTORY_CATEGORIES = ['Seafood', 'Meat', 'Vegetables', 'Fruits', 'Beverages', 'Dry Goods', 'Dairy', 'Coffee', 'Syrup', 'Packaging', 'Cleaning Supplies', 'Other Supplies'];

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = value => String(value).padStart(2, '0');

export const todayInput = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseDateOnly = value => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  if (text.length > 10) {
    const parsed = new Date(text.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const formatInventoryDate = value => {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};

export const formatQuantity = value => Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 });

export const expirationInfo = (value, now = new Date()) => {
  const date = parseDateOnly(value);
  if (!date) {
    return { key: 'none', label: 'No expiration', dateLabel: '—', days: null };
  }
  const days = Math.round((date.getTime() - startOfDay(now).getTime()) / DAY_MS);
  const dateLabel = formatInventoryDate(value);
  if (days < 0) {
    const overdue = Math.abs(days);
    return { key: 'expired', label: `Expired ${overdue} day${overdue === 1 ? '' : 's'} ago`, dateLabel, days };
  }
  if (days === 0) return { key: 'expiring', label: 'Expires today', dateLabel, days };
  if (days === 1) return { key: 'expiring', label: 'Expires tomorrow', dateLabel, days };
  if (days === 2) return { key: 'expiring', label: 'Expires in 2 days', dateLabel, days };
  return { key: 'fresh', label: 'Fresh', dateLabel, days };
};

export const isExpired = (row, now = new Date()) => expirationInfo(row.expiration_date, now).key === 'expired';

export const usableQuantity = (row, now = new Date()) => isExpired(row, now) ? 0 : Number(row.quantity || 0);

export const stockInfo = (row, now = new Date()) => {
  const quantity = Number(row.quantity || 0);
  const minimum = Number(row.minimum_stock || 0);
  if (quantity <= 0) return { key: 'out-of-stock', label: 'Out of stock' };
  if (isExpired(row, now)) return { key: 'expired', label: 'Expired · unusable' };
  if (quantity <= minimum) return { key: 'low-stock', label: 'Low stock' };
  return { key: 'in-stock', label: 'In stock' };
};

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const reportRows = (rows, now) => rows.map((item, index) => {
  const expiry = expirationInfo(item.expiration_date, now);
  const stock = stockInfo(item, now);
  return {
    index: index + 1,
    item_name: item.item_name || '',
    category: item.category || '',
    unit: item.unit || '',
    quantity: Number(item.quantity || 0),
    minimum_stock: Number(item.minimum_stock || 0),
    purchase_cost: Number(item.purchase_cost || 0),
    expiration_date: expiry.dateLabel,
    expiration_label: expiry.label,
    expiration_key: expiry.key,
    stock_label: stock.label,
    stock_key: stock.key
  };
});

export const exportInventoryToExcel = (rows, now = new Date()) => {
  const report = reportRows(rows, now);
  const generated = now.toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const rowStyle = record => {
    if (record.expiration_key === 'expired') return 'background:#fdecea;color:#8f2f24;';
    if (record.expiration_key === 'expiring') return 'background:#fff6db;color:#7a5510;';
    return '';
  };
  const dataRows = report.map(record => `<tr style="${rowStyle(record)}">
    <td style="text-align:center;">${record.index}</td>
    <td>${escapeHtml(record.item_name)}</td>
    <td>${escapeHtml(record.category)}</td>
    <td>${escapeHtml(record.unit)}</td>
    <td style="text-align:right;">${record.quantity}</td>
    <td style="text-align:right;">${record.minimum_stock}</td>
    <td>${escapeHtml(record.stock_label)}</td>
    <td>${escapeHtml(record.expiration_date)}</td>
    <td>${escapeHtml(record.expiration_label)}</td>
    <td style="text-align:right;">${record.purchase_cost.toFixed(2)}</td>
  </tr>`).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head><meta charset="utf-8" />
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Inventory</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt}td,th{border:1px solid #d8d0c7;padding:6px 8px}th{background:#6f4e37;color:#ffffff;font-weight:bold}td{border-color:#e7e0d8}</style>
  </head><body>
  <table>
    <tr><td colspan="10" style="font-size:16pt;font-weight:bold;color:#6f4e37;border:0;padding-bottom:4px;">Cafe Munaco - Inventory Report</td></tr>
    <tr><td colspan="10" style="border:0;color:#7d6e61;padding-top:0;">Generated ${escapeHtml(generated)} - ${report.length} item(s)</td></tr>
    <tr><td colspan="10" style="border:0;height:8px;"></td></tr>
    <tr><th>#</th><th>Item name</th><th>Category</th><th>Unit</th><th>Quantity</th><th>Minimum stock</th><th>Stock status</th><th>Expiration date</th><th>Expiration status</th><th>Purchase cost (PHP)</th></tr>
    ${dataRows || '<tr><td colspan="10" style="text-align:center;color:#9a8d80;">No inventory items match the selected filters.</td></tr>'}
  </table>
  </body></html>`;
  downloadBlob(new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `cafe-munaco-inventory-${todayInput(now)}.xls`);
};

export const printInventoryReport = (rows, options = {}) => {
  const now = options.now || new Date();
  const report = reportRows(rows, now);
  const generated = now.toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const filterText = options.filters?.length ? options.filters.join(' · ') : 'All inventory items';
  const expired = report.filter(record => record.expiration_key === 'expired').length;
  const expiring = report.filter(record => record.expiration_key === 'expiring').length;
  const lowStock = report.filter(record => record.stock_key !== 'in-stock').length;
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('Please allow pop-ups for this site so the inventory report can be printed.');
    return;
  }
  const dataRows = report.map(record => {
    const tone = record.expiration_key === 'expired' ? ' class="expired"' : record.expiration_key === 'expiring' ? ' class="expiring"' : '';
    return `<tr${tone}>
      <td>${record.index}</td>
      <td><strong>${escapeHtml(record.item_name)}</strong></td>
      <td>${escapeHtml(record.category)}</td>
      <td>${escapeHtml(record.unit)}</td>
      <td class="num">${record.quantity}</td>
      <td class="num">${record.minimum_stock}</td>
      <td>${escapeHtml(record.stock_label)}</td>
      <td>${escapeHtml(record.expiration_date)}</td>
      <td>${escapeHtml(record.expiration_label)}</td>
    </tr>`;
  }).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Cafe Munaco Inventory Report</title>
  <style>
    @page{size:A4 landscape;margin:12mm}
    *{box-sizing:border-box}
    body{margin:0;color:#332b25;font-family:'Segoe UI',Arial,sans-serif;background:#fff}
    .report-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #6f4e37;padding-bottom:12px;margin-bottom:14px}
    h1{font-size:22px;margin:0 0 4px;color:#4f3625}
    .muted{font-size:10px;color:#84776b;margin:0;line-height:1.5}
    .brand{text-align:right}
    .brand b{display:block;font-size:15px;color:#6f4e37}
    .brand span{font-size:9px;letter-spacing:1px;color:#9a8d80;text-transform:uppercase}
    .summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
    .summary span{border:1px solid #e4dbd1;border-radius:20px;padding:5px 10px;font-size:9px;color:#6f6155;background:#faf8f5}
    .summary b{color:#3c332c}
    table{width:100%;border-collapse:collapse;font-size:9px}
    th,td{border:1px solid #e2dad1;padding:6px 7px;text-align:left;vertical-align:top}
    th{background:#f3ece4;color:#5f4a39;text-transform:uppercase;letter-spacing:.4px;font-size:8px}
    tbody tr:nth-child(even){background:#fcfbf9}
    tbody tr.expired{background:#fdecea}
    tbody tr.expiring{background:#fff6db}
    .num{text-align:right;white-space:nowrap}
    tfoot td{font-weight:bold;background:#faf8f5}
    .foot{margin-top:12px;display:flex;justify-content:space-between;font-size:8px;color:#9a8d80}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <div class="report-head">
      <div><h1>Inventory Report</h1><p class="muted">${escapeHtml(filterText)}<br/>Generated ${escapeHtml(generated)}</p></div>
      <div class="brand"><b>Cafe Munaco</b><span>Integrated Cafe Operations</span></div>
    </div>
    <div class="summary">
      <span>Items: <b>${report.length}</b></span>
      <span>Expired: <b>${expired}</b></span>
      <span>Expiring within 2 days: <b>${expiring}</b></span>
      <span>Needs stock attention: <b>${lowStock}</b></span>
    </div>
    <table>
      <thead><tr><th>#</th><th>Item name</th><th>Category</th><th>Unit</th><th>Quantity</th><th>Minimum</th><th>Stock status</th><th>Expiration date</th><th>Expiration status</th></tr></thead>
      <tbody>${dataRows || '<tr><td colspan="9" style="text-align:center;color:#9a8d80;">No inventory items match the selected filters.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="9">Cafe Munaco inventory snapshot · Please verify actual stock before ordering.</td></tr></tfoot>
    </table>
    <div class="foot"><span>Prepared from the Cafe Munaco Inventory Management module.</span><span>${escapeHtml(generated)}</span></div>
  </body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 350);
};
