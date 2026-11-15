import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Boxes, CalendarClock, CheckCircle2, Download, Package, Plus, Printer,
  RefreshCw, Search, SlidersHorizontal, X
} from 'lucide-react';
import api from './api';
import {
  INVENTORY_CATEGORIES, INVENTORY_UNITS, expirationInfo, exportInventoryToExcel, formatInventoryDate,
  formatQuantity, printInventoryReport, stockInfo
} from './inventoryUtils';

const newForm = () => ({
  item_name: '',
  category: 'Other Supplies',
  unit: 'kg',
  quantity: '',
  minimum_stock: '',
  purchase_cost: '',
  expiration_date: ''
});

function InventoryField({ label, required, error, hint, children }) {
  return <label className={`field ${error ? 'has-error' : ''}`}>
    <span>{label}{required ? ' *' : ''}</span>
    {children}
    {error && <small className="field-error">{error}</small>}
    {!error && hint && <small className="field-hint">{hint}</small>}
  </label>;
}

export default function InventoryPage({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [unitFilter, setUnitFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [expiryFilter, setExpiryFilter] = useState('All');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(newForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [now, setNow] = useState(() => new Date());
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/inventory');
      setRows(data);
      setLastUpdated(new Date());
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load inventory records.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      setNow(new Date());
      load(true);
    }, 60000);
    const onInventoryUpdated = () => load(true);
    window.addEventListener('cm:inventory-updated', onInventoryUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cm:inventory-updated', onInventoryUpdated);
    };
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(rows.map(row => row.category).filter(Boolean))).sort()], [rows]);
  const units = useMemo(() => {
    const existing = Array.from(new Set(rows.map(row => row.unit).filter(Boolean))).sort();
    return ['All', ...Array.from(new Set([...INVENTORY_UNITS, ...existing])).sort()];
  }, [rows]);

  const decoratedRows = useMemo(() => rows.map(row => ({
    ...row,
    expiry: expirationInfo(row.expiration_date, now),
    stock: stockInfo(row)
  })), [rows, now]);

  const filtered = useMemo(() => decoratedRows.filter(row => {
    const matchesQuery = `${row.item_name} ${row.category} ${row.unit}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = category === 'All' || row.category === category;
    const matchesUnit = unitFilter === 'All' || row.unit === unitFilter;
    const matchesStock = stockFilter === 'All' || row.stock.key === stockFilter;
    const matchesExpiry = expiryFilter === 'All' || row.expiry.key === expiryFilter;
    return matchesQuery && matchesCategory && matchesUnit && matchesStock && matchesExpiry;
  }), [decoratedRows, query, category, unitFilter, stockFilter, expiryFilter]);

  const counts = useMemo(() => decoratedRows.reduce((result, row) => {
    result.total += 1;
    if (row.expiry.key === 'expired') result.expired += 1;
    if (row.expiry.key === 'expiring') result.expiring += 1;
    if (row.stock.key === 'low-stock' || row.stock.key === 'out-of-stock') result.lowStock += 1;
    if (row.stock.key === 'out-of-stock') result.outOfStock += 1;
    return result;
  }, { total: 0, expired: 0, expiring: 0, lowStock: 0, outOfStock: 0 }), [decoratedRows]);

  const activeFilters = [query, category, unitFilter, stockFilter, expiryFilter].some(value => value && value !== 'All');

  const clearFilters = () => {
    setQuery('');
    setCategory('All');
    setUnitFilter('All');
    setStockFilter('All');
    setExpiryFilter('All');
  };

  const filterSummary = () => {
    const parts = [];
    if (query.trim()) parts.push(`Search: "${query.trim()}"`);
    if (category !== 'All') parts.push(`Category: ${category}`);
    if (unitFilter !== 'All') parts.push(`Unit: ${unitFilter}`);
    if (stockFilter !== 'All') parts.push(`Stock: ${stockFilter.replaceAll('-', ' ')}`);
    if (expiryFilter !== 'All') parts.push(`Expiration: ${expiryFilter}`);
    return parts;
  };

  const handleExport = () => {
    if (!filtered.length) return;
    exportInventoryToExcel(filtered, now);
  };

  const handlePrint = () => {
    if (!filtered.length) return;
    printInventoryReport(filtered, { now, filters: filterSummary() });
  };

  const openModal = () => {
    setForm(newForm());
    setFieldErrors({});
    setError('');
    setModal(true);
  };

  const set = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: '' }));
    if (error) setError('');
  };

  const submit = async event => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.item_name.trim()) nextErrors.item_name = 'Item name is required.';
    if (!form.unit) nextErrors.unit = 'Choose a unit from the list.';
    for (const [key, label] of [['quantity', 'Quantity'], ['minimum_stock', 'Minimum stock'], ['purchase_cost', 'Purchase cost']]) {
      if (form[key] !== '' && (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) nextErrors[key] = `${label} cannot be negative.`;
    }
    if (!form.item_name.trim()) nextErrors.item_name = 'Item name is required.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Please correct the highlighted fields before saving.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/inventory', {
        item_name: form.item_name.trim(),
        category: form.category,
        unit: form.unit,
        quantity: Number(form.quantity || 0),
        minimum_stock: Number(form.minimum_stock || 0),
        purchase_cost: Number(form.purchase_cost || 0),
        expiration_date: form.expiration_date || null
      });
      setModal(false);
      window.dispatchEvent(new Event('cm:inventory-updated'));
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save this inventory item.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (row, typeName) => {
    const qty = window.prompt(`Quantity to ${typeName.toLowerCase()} (${row.unit}):`);
    if (qty === null) return;
    const amount = Number(qty);
    if (!amount || amount <= 0) return window.alert('Enter a valid quantity greater than zero.');
    const reason = window.prompt('Reason for this stock movement:') || 'Manual adjustment';
    try {
      await api.post(`/inventory/${row.id}/movement`, { type: typeName, quantity: amount, reason });
      window.dispatchEvent(new Event('cm:inventory-updated'));
      load();
    } catch (err) {
      window.alert(err.response?.data?.message || 'Unable to update stock.');
    }
  };

  const expiringItems = [...decoratedRows.filter(row => row.expiry.key === 'expired'), ...decoratedRows.filter(row => row.expiry.key === 'expiring')];

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">STOCK CONTROL</span>
        <h1>Inventory Management</h1>
        <p>Monitor stock levels, expiration dates, and ingredient availability.</p>
      </div>
      <div className="heading-actions inventory-heading-actions">
        <button className="outline-btn" onClick={() => load()} disabled={loading}><RefreshCw size={16} /> Refresh</button>
        <button className="outline-btn" onClick={handleExport} disabled={!filtered.length} title="Export the filtered inventory table to Excel"><Download size={16} /> Export Excel</button>
        <button className="outline-btn" onClick={handlePrint} disabled={!filtered.length} title="Print the filtered inventory report"><Printer size={16} /> Print</button>
        <button className="primary" onClick={openModal}><Plus size={17} /> Add item</button>
      </div>
    </div>

    {error && !modal && <div className="error-box">{error}</div>}

    <div className="inventory-stat-grid">
      <div className="inventory-stat"><span>Total items</span><b>{counts.total}</b><small>Tracked ingredients</small></div>
      <div className="inventory-stat low"><span>Low stock</span><b>{counts.lowStock}</b><small>{counts.outOfStock} out of stock</small></div>
      <div className="inventory-stat expired"><span>Expired</span><b>{counts.expired}</b><small>Needs immediate review</small></div>
      <div className="inventory-stat expiring"><span>Expiring soon</span><b>{counts.expiring}</b><small>Within the next 2 days</small></div>
    </div>

    {expiringItems.length > 0 && <section className="panel inventory-alert-panel">
      <div className="inventory-alert-head">
        <div className="inventory-alert-title"><AlertTriangle size={17} /><div><b>Expiration alerts</b><span>{counts.expired} expired · {counts.expiring} expiring within 2 days</span></div></div>
        <div className="inventory-alert-tags">
          {counts.expired > 0 && <button className="inventory-alert-tag expired" onClick={() => setExpiryFilter('expired')}>Expired <b>{counts.expired}</b></button>}
          {counts.expiring > 0 && <button className="inventory-alert-tag expiring" onClick={() => setExpiryFilter('expiring')}>Expiring soon <b>{counts.expiring}</b></button>}
        </div>
      </div>
      <div className="inventory-alert-list">
        {expiringItems.slice(0, 4).map(row => <div className={`inventory-alert-item ${row.expiry.key}`} key={row.id}>
          <span className="inventory-alert-dot" />
          <div><b>{row.item_name}</b><small>{row.expiry.label} · {formatInventoryDate(row.expiration_date)}</small></div>
          <span className="inventory-alert-qty">{formatQuantity(row.quantity)} {row.unit}</span>
        </div>)}
        {expiringItems.length > 4 && <span className="inventory-alert-more">+ {expiringItems.length - 4} more item(s)</span>}
      </div>
    </section>}

    <section className="panel table-panel inventory-panel">
      <div className="table-toolbar">
        <div>
          <h3>Inventory items</h3>
          <p>{filtered.length} of {counts.total} item(s) shown{activeFilters ? ' · filtered' : ''} · Expiration status updates automatically{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        </div>
        <div className="table-search"><Search size={16} /><input placeholder="Search item name, category or unit..." value={query} onChange={event => setQuery(event.target.value)} /></div>
      </div>

      <div className="inventory-filter-row">
        <span className="inventory-filter-label"><SlidersHorizontal size={14} /> Filters</span>
        <label className="filter-select">Category
          <select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="filter-select">Unit
          <select value={unitFilter} onChange={event => setUnitFilter(event.target.value)}>{units.map(item => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="filter-select">Stock
          <select value={stockFilter} onChange={event => setStockFilter(event.target.value)}>
            <option value="All">All stock levels</option>
            <option value="in-stock">In stock</option>
            <option value="low-stock">Low stock</option>
            <option value="out-of-stock">Out of stock</option>
          </select>
        </label>
        <label className="filter-select">Expiration
          <select value={expiryFilter} onChange={event => setExpiryFilter(event.target.value)}>
            <option value="All">All expiration statuses</option>
            <option value="expired">Expired</option>
            <option value="expiring">Expiring soon</option>
            <option value="fresh">Fresh</option>
            <option value="none">No expiration</option>
          </select>
        </label>
        <button type="button" className="mini-btn subtle filter-reset" onClick={clearFilters} disabled={!activeFilters}><X size={12} /> Clear filters</button>
      </div>

      {loading ? <div className="loading-state">Loading inventory...</div> : filtered.length === 0
        ? <div className="empty-state"><Package size={28} /><b>{rows.length ? 'No items match your filters' : 'No inventory items yet'}</b><span>{rows.length ? 'Try changing or clearing the filters above.' : 'Add an inventory item to start monitoring stock and expiration.'}</span>{rows.length > 0 && activeFilters && <button className="mini-btn" onClick={clearFilters}>Clear filters</button>}</div>
        : <div className="table-scroll"><table className="inventory-table">
          <thead><tr><th>Ingredient</th><th>Category</th><th>On hand</th><th>Minimum</th><th>Expiration date</th><th>Expiration status</th><th>Stock status</th><th>Stock movement</th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.id} className={`inventory-row row-${row.expiry.key}`}>
            <td><b>{row.item_name}</b><small className="cell-sub">{row.unit}</small></td>
            <td>{row.category}</td>
            <td>{formatQuantity(row.quantity)} {row.unit}</td>
            <td>{formatQuantity(row.minimum_stock)} {row.unit}</td>
            <td><span className="expiry-date">{formatInventoryDate(row.expiration_date)}</span></td>
            <td><span className={`expiry-badge ${row.expiry.key}`}>{row.expiry.label}</span></td>
            <td><span className={`status ${row.stock.key}`}>{row.stock.label}</span></td>
            <td><div className="row-actions"><button className="mini-btn" onClick={() => move(row, 'Stock In')}>+ Stock in</button><button className="mini-btn subtle" onClick={() => move(row, 'Stock Out')}>− Stock out</button></div></td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setModal(false)}>
      <div className="modal inventory-modal">
        <div className="modal-head">
          <div><span className="eyebrow">NEW INVENTORY ITEM</span><h2>Add inventory item</h2></div>
          <button className="icon-btn" onClick={() => setModal(false)}><X /></button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <form id="inventory-form" className="modal-form" onSubmit={submit}>
          <InventoryField label="Item name" required error={fieldErrors.item_name}>
            <input value={form.item_name} onChange={event => set('item_name', event.target.value)} placeholder="e.g. Fresh Milk" />
          </InventoryField>
          <div className="form-two">
            <InventoryField label="Category">
              <select value={form.category} onChange={event => set('category', event.target.value)}>{INVENTORY_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select>
            </InventoryField>
            <InventoryField label="Unit" required error={fieldErrors.unit} hint="Select a predefined unit for consistent records.">
              <select value={form.unit} onChange={event => set('unit', event.target.value)}>{INVENTORY_UNITS.map(item => <option key={item}>{item}</option>)}</select>
            </InventoryField>
          </div>
          <div className="form-two">
            <InventoryField label="Current quantity" error={fieldErrors.quantity}>
              <input type="number" min="0" step="0.001" value={form.quantity} onChange={event => set('quantity', event.target.value)} placeholder="0" />
            </InventoryField>
            <InventoryField label="Minimum stock" error={fieldErrors.minimum_stock}>
              <input type="number" min="0" step="0.001" value={form.minimum_stock} onChange={event => set('minimum_stock', event.target.value)} placeholder="0" />
            </InventoryField>
          </div>
          <div className="form-two">
            <InventoryField label="Purchase cost (₱)" error={fieldErrors.purchase_cost}>
              <input type="number" min="0" step="0.01" value={form.purchase_cost} onChange={event => set('purchase_cost', event.target.value)} placeholder="0.00" />
            </InventoryField>
            <InventoryField label="Expiration date (optional)">
              <input type="date" value={form.expiration_date} onChange={event => set('expiration_date', event.target.value)} />
            </InventoryField>
          </div>
          <p className="form-hint">Expired items are highlighted red and items expiring within the next 2 days are highlighted yellow. Staff alerts update automatically as the date changes.</p>
          {form.expiration_date && <div className={`expiry-preview ${expirationInfo(form.expiration_date, now).key}`}><CalendarClock size={15} /><span>{expirationInfo(form.expiration_date, now).label} · {formatInventoryDate(form.expiration_date)}</span></div>}
        </form>
        <div className="modal-actions">
          <button className="outline-btn" type="button" onClick={() => setModal(false)}>Cancel</button>
          <button className="primary" type="submit" form="inventory-form" disabled={busy}>{busy ? 'Saving...' : 'Save item'}</button>
        </div>
      </div>
    </div>}
  </>;
}
