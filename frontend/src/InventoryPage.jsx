import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, CheckCircle2, ChevronRight,
  Download, MoreHorizontal, Package, PackageX, Plus, Printer, RefreshCw, Search,
  SlidersHorizontal, X
} from 'lucide-react';
import api from './api';
import {
  INVENTORY_CATEGORIES, INVENTORY_UNITS, expirationInfo, exportInventoryToExcel, formatInventoryDate,
  formatQuantity, printInventoryReport, stockInfo, todayInput
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

const emitInventoryUpdate = () => {
  window.dispatchEvent(new CustomEvent('cm:inventory-updated', { detail: { source: 'inventory-page' } }));
};

function InventoryField({ label, required, error, hint, children }) {
  return <label className={`field ${error ? 'has-error' : ''}`}>
    <span>{label}{required ? ' *' : ''}</span>
    {children}
    {error && <small className="field-error">{error}</small>}
    {!error && hint && <small className="field-hint">{hint}</small>}
  </label>;
}

function StockMovementModal({ row, type, onClose, onSaved }) {
  const isStockIn = type === 'Stock In';
  const isRemoveExpired = type === 'Remove Expired';
  const available = Number(row.quantity || 0);
  const expiredWithStock = row.expiry.key === 'expired' && available > 0;
  const needsNewExpiration = isStockIn && row.expiry.key === 'expired';
  const blocked = isStockIn && expiredWithStock;
  const [quantity, setQuantity] = useState(isRemoveExpired ? String(available) : '');
  const [expirationDate, setExpirationDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const amount = Number(quantity);
  const validAmount = Number.isFinite(amount) && amount > 0;
  const overLimit = !isStockIn && validAmount && amount > available;
  const quantityError = quantity !== '' && !validAmount
    ? 'Enter a quantity greater than zero.'
    : overLimit
      ? `Only ${formatQuantity(available)} ${row.unit} available.`
      : '';
  const projected = isStockIn
    ? available + (validAmount ? amount : 0)
    : Math.max(0, available - (validAmount ? amount : 0));

  const adjust = delta => {
    const base = Number(quantity) || 0;
    const ceiling = isStockIn ? Number.POSITIVE_INFINITY : available;
    const next = Math.min(ceiling, Math.max(0, Math.round((base + delta) * 1000) / 1000));
    setQuantity(next > 0 ? String(next) : '');
    setError('');
  };

  const submit = async event => {
    event.preventDefault();
    if (blocked) return setError('Remove the expired stock before restocking this item.');
    if (!validAmount) return setError('Enter a quantity greater than zero.');
    if (overLimit) return setError(`Only ${formatQuantity(available)} ${row.unit} available.`);
    if (needsNewExpiration && !expirationDate) return setError('Enter the new batch expiration date.');
    if (expirationDate && expirationDate < todayInput()) return setError('The new expiration date cannot be in the past.');
    setBusy(true);
    setError('');
    try {
      const response = isRemoveExpired
        ? await api.post(`/inventory/${row.id}/remove-expired`, { quantity: amount })
        : await api.post(`/inventory/${row.id}/movement`, {
          type,
          quantity: amount,
          ...(expirationDate ? { expiration_date: expirationDate } : {})
        });
      const action = isStockIn ? 'Added' : isRemoveExpired ? 'Removed expired' : 'Removed';
      onSaved(response.data, `${action} ${formatQuantity(amount)} ${row.unit} ${isStockIn ? 'to' : 'from'} ${row.item_name}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update stock.');
    } finally {
      setBusy(false);
    }
  };

  const title = isStockIn ? 'Stock in' : isRemoveExpired ? 'Remove expired stock' : 'Stock out';
  const submitLabel = isStockIn ? 'Confirm stock in' : isRemoveExpired ? 'Remove expired stock' : 'Confirm stock out';

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <div className="modal movement-modal">
      <div className="modal-head">
        <div>
          <span className="eyebrow">{isStockIn ? 'ADD STOCK' : isRemoveExpired ? 'EXPIRED STOCK' : 'REMOVE STOCK'}</span>
          <h2>{title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X /></button>
      </div>

      <div className="movement-item-summary">
        <div className={`movement-item-icon ${isStockIn ? 'in' : 'out'}`}>
          {isStockIn ? <ArrowDownToLine size={18} /> : isRemoveExpired ? <PackageX size={18} /> : <ArrowUpFromLine size={18} />}
        </div>
        <div className="movement-item-main">
          <b>{row.item_name}</b>
          <small>{row.category} · {formatInventoryDate(row.expiration_date)}</small>
        </div>
        <span className={`expiry-badge ${row.expiry.key}`}>{row.expiry.label}</span>
      </div>

      <div className="movement-summary-grid">
        <div><span>Current quantity</span><b>{formatQuantity(available)} {row.unit}</b></div>
        <div><span>{isStockIn ? 'After stock in' : 'After stock out'}</span><b className={overLimit ? 'invalid' : ''}>{overLimit || !validAmount ? '—' : `${formatQuantity(projected)} ${row.unit}`}</b></div>
      </div>

      {blocked && <div className="inventory-notice danger"><AlertTriangle size={15} /><span>This item has expired stock. Remove the expired quantity first, then restock the replacement batch.</span></div>}
      {isRemoveExpired && !blocked && <div className="inventory-notice warning"><PackageX size={15} /><span>This records a Stock Out for audit purposes and does not delete the inventory item.</span></div>}
      {needsNewExpiration && !blocked && <div className="inventory-notice info"><CalendarClock size={15} /><span>Enter the expiration date of the replacement batch. The item stays unavailable until it is restocked.</span></div>}

      <form onSubmit={submit} className="modal-form movement-form">
        <InventoryField label={`Quantity (${row.unit})`} required error={quantityError}>
          <div className="movement-qty-control">
            <button type="button" onClick={() => adjust(-1)} aria-label="Decrease quantity">−</button>
            <input
              type="number"
              min="0.001"
              step="0.001"
              max={isStockIn ? undefined : available}
              value={quantity}
              onChange={event => { setQuantity(event.target.value); setError(''); }}
              placeholder="0"
              required
              autoFocus
            />
            <span>{row.unit}</span>
            <button type="button" onClick={() => adjust(1)} aria-label="Increase quantity">+</button>
          </div>
        </InventoryField>

        {validAmount && !overLimit && <div className={`movement-change-note ${isStockIn ? 'in' : 'out'}`}>
          <span>{isStockIn ? 'Adding' : isRemoveExpired ? 'Removing expired' : 'Removing'}</span>
          <b>{formatQuantity(amount)} {row.unit}</b>
        </div>}

        {!isStockIn && <div className="movement-limit-row">
          <span>Available: <b>{formatQuantity(available)} {row.unit}</b></span>
          {available > 0 && <button type="button" onClick={() => { setQuantity(String(available)); setError(''); }}>Use all</button>}
        </div>}

        {isStockIn && <InventoryField
          label={needsNewExpiration ? 'New batch expiration date' : 'Update expiration date (optional)'}
          required={needsNewExpiration}
          hint={needsNewExpiration ? 'Required so the replacement batch is tracked correctly.' : 'Leave blank to keep the current expiration date.'}
        >
          <input type="date" min={todayInput()} value={expirationDate} required={needsNewExpiration} onChange={event => { setExpirationDate(event.target.value); setError(''); }} />
        </InventoryField>}

        {error && <div className="error-box movement-error">{error}</div>}

        <div className="modal-actions">
          <button className="outline-btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={isStockIn ? 'primary movement-submit in' : 'danger-btn movement-submit'} type="submit" disabled={busy || Boolean(quantityError) || blocked}>
            {busy ? 'Updating...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  </div>;
}

function ItemDetailModal({ row, onClose, onMove, onSaved }) {
  const expiredWithStock = row.expiry.key === 'expired' && Number(row.quantity) > 0;
  const [form, setForm] = useState({
    item_name: row.item_name || '',
    category: row.category || 'Other Supplies',
    unit: row.unit || 'kg',
    minimum_stock: String(Number(row.minimum_stock || 0)),
    purchase_cost: String(Number(row.purchase_cost || 0)),
    expiration_date: row.expiration_date ? String(row.expiration_date).slice(0, 10) : ''
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

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
    for (const [key, label] of [['minimum_stock', 'Minimum stock'], ['purchase_cost', 'Purchase cost']]) {
      if (form[key] === '' || !Number.isFinite(Number(form[key])) || Number(form[key]) < 0) nextErrors[key] = `${label} cannot be empty or negative.`;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return setError('Please correct the highlighted fields before saving.');
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put(`/inventory/${row.id}`, {
        item_name: form.item_name.trim(),
        category: form.category,
        unit: form.unit,
        minimum_stock: Number(form.minimum_stock),
        purchase_cost: Number(form.purchase_cost),
        expiration_date: form.expiration_date || null
      });
      onSaved(data.item, `${form.item_name.trim()} details updated.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update this inventory item.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <div className="modal inventory-detail-modal">
      <div className="modal-head">
        <div>
          <span className="eyebrow">INVENTORY ITEM</span>
          <h2>{row.item_name}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><X /></button>
      </div>

      <div className="inventory-detail-badges">
        <span className={`expiry-badge ${row.expiry.key}`}>{row.expiry.label}</span>
        <span className={`status ${row.stock.key}`}>{row.stock.label}</span>
        <span className="inventory-detail-category">{row.category} · {row.unit}</span>
      </div>

      {expiredWithStock && <div className="inventory-notice danger">
        <AlertTriangle size={15} />
        <span>Expired stock is excluded from usable inventory. Remove it before updating the expiration date or restocking.</span>
      </div>}

      <div className="inventory-detail-metrics">
        <div><span>Current quantity</span><b>{formatQuantity(row.quantity)} {row.unit}</b></div>
        <div><span>Usable quantity</span><b className={expiredWithStock ? 'invalid' : ''}>{formatQuantity(expiredWithStock ? 0 : row.quantity)} {row.unit}</b></div>
        <div><span>Minimum stock</span><b>{formatQuantity(row.minimum_stock)} {row.unit}</b></div>
        <div><span>Expiration date</span><b>{formatInventoryDate(row.expiration_date)}</b></div>
      </div>

      <div className="inventory-detail-actions">
        {expiredWithStock
          ? <button type="button" className="danger-btn small" onClick={() => onMove('Remove Expired')}><PackageX size={15} /> Remove expired stock</button>
          : <button type="button" className="movement-action in" onClick={() => onMove('Stock In')}><ArrowDownToLine size={15} /> {row.expiry.key === 'expired' ? 'Restock item' : 'Stock in'}</button>}
        {!expiredWithStock && <button type="button" className="movement-action out" onClick={() => onMove('Stock Out')} disabled={Number(row.quantity) <= 0}><ArrowUpFromLine size={15} /> Stock out</button>}
      </div>

      <form onSubmit={submit} className="modal-form inventory-detail-form">
        <div className="inventory-detail-form-head">
          <b>Item details</b>
          <span>Quantity is controlled through stock movements to keep history accurate.</span>
        </div>

        <InventoryField label="Item name" required error={fieldErrors.item_name}>
          <input value={form.item_name} onChange={event => set('item_name', event.target.value)} />
        </InventoryField>
        <div className="form-two">
          <InventoryField label="Category">
            <select value={form.category} onChange={event => set('category', event.target.value)}>{INVENTORY_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select>
          </InventoryField>
          <InventoryField label="Unit" required error={fieldErrors.unit}>
            <select value={form.unit} onChange={event => set('unit', event.target.value)}>{INVENTORY_UNITS.map(item => <option key={item}>{item}</option>)}</select>
          </InventoryField>
        </div>
        <div className="form-two">
          <InventoryField label="Minimum stock" error={fieldErrors.minimum_stock}>
            <input type="number" min="0" step="0.001" value={form.minimum_stock} onChange={event => set('minimum_stock', event.target.value)} />
          </InventoryField>
          <InventoryField label="Purchase cost (₱)" error={fieldErrors.purchase_cost}>
            <input type="number" min="0" step="0.01" value={form.purchase_cost} onChange={event => set('purchase_cost', event.target.value)} />
          </InventoryField>
        </div>
        <InventoryField
          label="Expiration date"
          hint={expiredWithStock ? 'Remove the expired stock before changing the expiration date.' : 'Use the replacement batch date when new stock arrives.'}
        >
          <input type="date" value={form.expiration_date} onChange={event => set('expiration_date', event.target.value)} disabled={expiredWithStock} />
        </InventoryField>

        {error && <div className="error-box">{error}</div>}

        <div className="modal-actions">
          <button className="outline-btn" type="button" onClick={onClose} disabled={busy}>Close</button>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  </div>;
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
  const [addError, setAddError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [movement, setMovement] = useState(null);
  const [toast, setToast] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

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
    const onInventoryUpdated = event => {
      if (event?.detail?.source !== 'inventory-page') load(true);
    };
    window.addEventListener('cm:inventory-updated', onInventoryUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cm:inventory-updated', onInventoryUpdated);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const focus = Number(searchParams.get('focus'));
    const stock = searchParams.get('stock');
    const expiry = searchParams.get('expiry');
    if (!focus && !stock && !expiry) return;
    if (stock && ['in-stock', 'low-stock', 'out-of-stock', 'expired'].includes(stock)) setStockFilter(stock);
    if (expiry && ['expired', 'expiring', 'fresh', 'none'].includes(expiry)) setExpiryFilter(expiry);
    if (focus) {
      setQuery('');
      setCategory('All');
      setUnitFilter('All');
      setFocusId(focus);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!focusId || loading) return;
    const element = document.getElementById(`inventory-item-${focusId}`);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setFocusId(null), 3600);
    return () => clearTimeout(timer);
  }, [focusId, loading, rows]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(rows.map(row => row.category).filter(Boolean))).sort()], [rows]);
  const units = useMemo(() => {
    const existing = Array.from(new Set(rows.map(row => row.unit).filter(Boolean))).sort();
    return ['All', ...Array.from(new Set([...INVENTORY_UNITS, ...existing])).sort()];
  }, [rows]);

  const decoratedRows = useMemo(() => rows.map(row => ({
    ...row,
    expiry: expirationInfo(row.expiration_date, now),
    stock: stockInfo(row, now)
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

  const activeFilters = Boolean(query.trim()) || category !== 'All' || unitFilter !== 'All' || stockFilter !== 'All' || expiryFilter !== 'All';

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

  const notify = (message, tone = 'success') => setToast({ id: Date.now(), message, tone });

  const openModal = () => {
    setForm(newForm());
    setFieldErrors({});
    setAddError('');
    setModal(true);
  };

  const set = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: '' }));
    if (addError) setAddError('');
  };

  const submit = async event => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.item_name.trim()) nextErrors.item_name = 'Item name is required.';
    if (!form.unit) nextErrors.unit = 'Choose a unit from the list.';
    for (const [key, label] of [['quantity', 'Quantity'], ['minimum_stock', 'Minimum stock'], ['purchase_cost', 'Purchase cost']]) {
      if (form[key] !== '' && (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0)) nextErrors[key] = `${label} cannot be negative.`;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setAddError('Please correct the highlighted fields before saving.');
      return;
    }
    setBusy(true);
    setAddError('');
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
      notify(`${form.item_name.trim()} added to inventory.`);
      emitInventoryUpdate();
      await load(true);
    } catch (err) {
      setAddError(err.response?.data?.message || 'Unable to save this inventory item.');
    } finally {
      setBusy(false);
    }
  };

  const openMovement = (row, type) => {
    setDetailId(null);
    setMovement({ row, type });
  };

  const handleMovementSaved = (data, message) => {
    setRows(current => current.map(row => row.id === data.id ? {
      ...row,
      quantity: data.quantity,
      expiration_date: data.expiration_date
    } : row));
    setMovement(null);
    notify(message);
    emitInventoryUpdate();
  };

  const handleDetailSaved = (item, message) => {
    setRows(current => current.map(row => row.id === item.id ? { ...row, ...item } : row));
    setDetailId(null);
    notify(message);
    emitInventoryUpdate();
  };

  const selectedRow = detailId ? decoratedRows.find(row => row.id === detailId) : null;
  const expiringItems = [...decoratedRows.filter(row => row.expiry.key === 'expired'), ...decoratedRows.filter(row => row.expiry.key === 'expiring')];

  return <div className="inventory-page">
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

    {error && !modal && <div className="error-box">{error} <button className="mini-btn" onClick={() => load()}>Try again</button></div>}

    <div className="inventory-stat-grid">
      <div className="inventory-stat"><span>Total items</span><b>{counts.total}</b><small>Tracked ingredients</small></div>
      <div className="inventory-stat low"><span>Low stock</span><b>{counts.lowStock}</b><small>{counts.outOfStock} out of stock</small></div>
      <div className="inventory-stat expired"><span>Expired</span><b>{counts.expired}</b><small>Excluded from usable stock</small></div>
      <div className="inventory-stat expiring"><span>Expiring soon</span><b>{counts.expiring}</b><small>Within the next 2 days</small></div>
    </div>

    {expiringItems.length > 0 && <section className="panel inventory-alert-panel">
      <div className="inventory-alert-head">
        <div className="inventory-alert-title"><AlertTriangle size={17} /><div><b>Expiration alerts</b><span>{counts.expired} expired · {counts.expiring} expiring within 2 days · Select an item to review or restock it</span></div></div>
        <div className="inventory-alert-tags">
          {counts.expired > 0 && <button className="inventory-alert-tag expired" onClick={() => setExpiryFilter('expired')}>Expired <b>{counts.expired}</b></button>}
          {counts.expiring > 0 && <button className="inventory-alert-tag expiring" onClick={() => setExpiryFilter('expiring')}>Expiring soon <b>{counts.expiring}</b></button>}
        </div>
      </div>
      <div className="inventory-alert-list">
        {expiringItems.slice(0, 6).map(row => <button type="button" className={`inventory-alert-item ${row.expiry.key}`} key={row.id} onClick={() => setDetailId(row.id)} title={`Open ${row.item_name}`}>
          <span className="inventory-alert-dot" />
          <div><b>{row.item_name}</b><small>{row.expiry.label} · {formatInventoryDate(row.expiration_date)}</small></div>
          <span className="inventory-alert-qty">{formatQuantity(row.quantity)} {row.unit}</span>
          <ChevronRight size={13} className="inventory-alert-open" />
        </button>)}
        {expiringItems.length > 6 && <span className="inventory-alert-more">+ {expiringItems.length - 6} more item(s) in the inventory table</span>}
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
            <option value="expired">Expired / unusable</option>
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
        {activeFilters && <button type="button" className="mini-btn subtle filter-reset" onClick={clearFilters}><X size={12} /> Clear filters</button>}
      </div>

      {loading ? <div className="loading-state">Loading inventory...</div> : filtered.length === 0
        ? <div className="empty-state"><Package size={28} /><b>{rows.length ? 'No items match your filters' : 'No inventory items yet'}</b><span>{rows.length ? 'Try changing or clearing the filters above.' : 'Add an inventory item to start monitoring stock and expiration.'}</span>{rows.length > 0 && activeFilters && <button className="mini-btn" onClick={clearFilters}>Clear filters</button>}</div>
        : <div className="table-scroll"><table className="inventory-table">
          <thead><tr><th>Ingredient</th><th>Category</th><th>On hand</th><th>Minimum</th><th>Expiration date</th><th>Expiration status</th><th>Stock status</th><th>Stock movement</th></tr></thead>
          <tbody>{filtered.map(row => {
            const expiredWithStock = row.expiry.key === 'expired' && Number(row.quantity) > 0;
            return <tr key={row.id} id={`inventory-item-${row.id}`} className={`inventory-row row-${row.expiry.key} ${focusId === row.id ? 'focus-row' : ''}`}>
              <td><b>{row.item_name}</b><small className="cell-sub">{row.unit}</small></td>
              <td>{row.category}</td>
              <td><div className={`inventory-qty-cell ${expiredWithStock ? 'unusable' : ''}`}><b>{formatQuantity(row.quantity)}</b><span>{row.unit}</span>{expiredWithStock && <small>Not usable</small>}</div></td>
              <td>{formatQuantity(row.minimum_stock)} {row.unit}</td>
              <td><span className="expiry-date">{formatInventoryDate(row.expiration_date)}</span></td>
              <td><span className={`expiry-badge ${row.expiry.key}`}>{row.expiry.label}</span></td>
              <td><span className={`status ${row.stock.key}`}>{row.stock.label}</span></td>
              <td><div className="inventory-row-actions">
                {expiredWithStock
                  ? <button className="mini-btn danger" onClick={() => openMovement(row, 'Remove Expired')} title="Remove expired quantity and record a stock-out"><PackageX size={13} /> Remove expired</button>
                  : <button className="mini-btn stock-in" onClick={() => openMovement(row, 'Stock In')} title={row.expiry.key === 'expired' ? 'Restock this expired item with a new batch' : 'Add stock'}><ArrowDownToLine size={13} /> {row.expiry.key === 'expired' ? 'Restock' : 'Stock in'}</button>}
                {!expiredWithStock && Number(row.quantity) > 0 && <button className="mini-btn stock-out" onClick={() => openMovement(row, 'Stock Out')} title="Remove stock"><ArrowUpFromLine size={13} /> Stock out</button>}
                <button className="mini-btn subtle icon-only" onClick={() => setDetailId(row.id)} title={`View ${row.item_name} details`} aria-label={`View ${row.item_name} details`}><MoreHorizontal size={14} /></button>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setModal(false)}>
      <div className="modal inventory-modal">
        <div className="modal-head">
          <div><span className="eyebrow">NEW INVENTORY ITEM</span><h2>Add inventory item</h2></div>
          <button className="icon-btn" onClick={() => setModal(false)}><X /></button>
        </div>
        {addError && <div className="error-box">{addError}</div>}
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
          <p className="form-hint">Expired items are highlighted red and excluded from usable stock. Items expiring within the next 2 days are highlighted yellow. Staff alerts update automatically as the date changes.</p>
          {form.expiration_date && <div className={`expiry-preview ${expirationInfo(form.expiration_date, now).key}`}><CalendarClock size={15} /><span>{expirationInfo(form.expiration_date, now).label} · {formatInventoryDate(form.expiration_date)}</span></div>}
        </form>
        <div className="modal-actions">
          <button className="outline-btn" type="button" onClick={() => setModal(false)}>Cancel</button>
          <button className="primary" type="submit" form="inventory-form" disabled={busy}>{busy ? 'Saving...' : 'Save item'}</button>
        </div>
      </div>
    </div>}

    {movement && <StockMovementModal
      key={`${movement.row.id}-${movement.type}`}
      row={movement.row}
      type={movement.type}
      onClose={() => setMovement(null)}
      onSaved={handleMovementSaved}
    />}

    {selectedRow && <ItemDetailModal
      key={selectedRow.id}
      row={selectedRow}
      onClose={() => setDetailId(null)}
      onMove={type => openMovement(selectedRow, type)}
      onSaved={handleDetailSaved}
    />}

    {toast && <div className={`inventory-toast ${toast.tone}`} role="status" aria-live="polite">
      <CheckCircle2 size={17} />
      <span>{toast.message}</span>
      <button type="button" onClick={() => setToast(null)} aria-label="Dismiss message"><X size={14} /></button>
    </div>}
  </div>;
}
