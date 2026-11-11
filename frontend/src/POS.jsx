import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, Banknote, CalendarDays, CheckCircle2, Coffee, CreditCard,
  Minus, Plus, Printer, Receipt, RefreshCw, Search, ShoppingCart, Smartphone, Tag, Trash2, X
} from 'lucide-react';
import api from './api';
import { formatDateTime, peso, promoAppliesTo, promoDiscountLabel } from './posUtils';

const round = value => Math.round((Number(value) || 0) * 100) / 100;

function POSField({ label, required, error, children }) {
  return <label className={`field ${error ? 'has-error' : ''}`}>
    <span>{label}{required ? ' *' : ''}</span>
    {children}
    {error && <small className="field-error">{error}</small>}
  </label>;
}

function ReceiptView({ receipt }) {
  return <div className="receipt">
    <div className="receipt-brand">
      <div className="receipt-logo"><Coffee size={22} /></div>
      <div><b>Cafe Munaco</b><small>Integrated Cafe Operations</small></div>
    </div>
    <div className="receipt-meta">
      <div><span>Order</span><b>{receipt.order_number}</b></div>
      <div><span>Date</span><b>{formatDateTime(receipt.created_at)}</b></div>
      <div><span>Cashier</span><b>{receipt.cashier_name || '—'}</b></div>
      <div><span>Type</span><b>{receipt.order_type}</b></div>
    </div>
    <table className="receipt-items">
      <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>
        {receipt.items?.map((item, index) => <tr key={`${item.product_id}-${index}`}>
          <td>{item.product_name}</td><td>{item.quantity}</td><td>{peso(item.subtotal)}</td>
        </tr>)}
      </tbody>
    </table>
    <div className="receipt-totals">
      <div><span>Subtotal</span><b>{peso(receipt.subtotal)}</b></div>
      {receipt.promo_name && <div className="receipt-discount"><span>Promo · {receipt.promo_name}</span><b>-{peso(receipt.discount_amount)}</b></div>}
      <div className="receipt-grand"><span>Total</span><b>{peso(receipt.total_amount)}</b></div>
      <div><span>Paid · {receipt.payment_method}</span><b>{peso(receipt.amount_paid)}</b></div>
      <div><span>Change</span><b>{peso(receipt.change_due)}</b></div>
    </div>
    {receipt.special_instructions && <p className="receipt-note"><b>Note:</b> {receipt.special_instructions}</p>}
    <p className="receipt-thanks">Thank you for visiting Cafe Munaco.</p>
  </div>;
}

export default function POSPage({ user }) {
  const [products, setProducts] = useState([]);
  const [promos, setPromos] = useState([]);
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [promoId, setPromoId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState('Dine-in');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashReceived, setCashReceived] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [receipt, setReceipt] = useState(null);
  const customerNameRef = useRef(null);
  const cashReceivedRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [productResponse, promoResponse] = await Promise.all([
        api.get('/products'),
        api.get('/promos?active=1')
      ]);
      setProducts(productResponse.data.filter(product => Number(product.available) === 1));
      setPromos(promoResponse.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the POS catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map(product => product.category)))], [products]);
  const filteredProducts = useMemo(() => products.filter(product => {
    const matchesCategory = category === 'All' || product.category === category;
    const matchesSearch = `${product.name} ${product.category} ${product.description || ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [products, category, query]);

  const addProduct = product => {
    setError('');
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      if (existing) return current.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      return [...current, { ...product, qty: 1 }];
    });
  };
  const changeQty = (id, qty) => setCart(current => current.map(item => item.id === id ? { ...item, qty: Math.max(1, Number(qty) || 1) } : item));
  const removeItem = id => setCart(current => current.filter(item => item.id !== id));

  const subtotal = useMemo(() => round(cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0)), [cart]);
  const selectedPromo = useMemo(() => promos.find(promo => String(promo.id) === String(promoId)) || null, [promos, promoId]);
  const promoBase = selectedPromo
    ? round(selectedPromo.product_id
      ? cart.filter(item => Number(item.id) === Number(selectedPromo.product_id)).reduce((sum, item) => sum + Number(item.price) * item.qty, 0)
      : subtotal)
    : 0;
  const discount = selectedPromo && promoBase > 0
    ? round(selectedPromo.discount_type === 'Percent'
      ? promoBase * Number(selectedPromo.discount_value) / 100
      : Math.min(Number(selectedPromo.discount_value), promoBase))
    : 0;
  const total = round(Math.max(0, subtotal - discount));
  const cash = Number(cashReceived || 0);
  const change = round(Math.max(0, cash - total));
  const promoApplicable = !selectedPromo || promoBase > 0;
  const canCheckout = cart.length > 0 && promoApplicable;
  const cashShort = paymentMethod === 'Cash' && cashReceived !== '' && cash < total;

  const quickCash = useMemo(() => {
    const amounts = [total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, 500, 1000, 2000]
      .filter(amount => amount >= total);
    return Array.from(new Set(amounts)).sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  const validateCheckout = () => {
    const nextErrors = {};
    if (!customerName.trim()) nextErrors.customerName = 'Customer name is required.';
    if (paymentMethod === 'Cash') {
      if (!String(cashReceived).trim()) nextErrors.cashReceived = 'Cash received is required.';
      else if (!Number.isFinite(cash) || cash < total) nextErrors.cashReceived = `Cash received must be at least ${peso(total)}.`;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Please complete the required customer and payment fields.');
      if (nextErrors.customerName) customerNameRef.current?.focus();
      else if (nextErrors.cashReceived) cashReceivedRef.current?.focus();
      return false;
    }
    return true;
  };

  const checkout = async () => {
    if (!cart.length) return setError('Add at least one product to the cart.');
    if (!promoApplicable) return setError(`This promo only applies to ${selectedPromo?.product_name}.`);
    if (!validateCheckout()) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/pos/checkout', {
        customer_name: customerName.trim(),
        order_type: orderType,
        special_instructions: notes.trim(),
        promo_id: promoId ? Number(promoId) : null,
        payment_method: paymentMethod,
        amount_paid: paymentMethod === 'Cash' ? cash : total,
        items: cart.map(item => ({ product_id: item.id, quantity: item.qty }))
      });
      setReceipt(data);
      setCart([]);
      setPromoId('');
      setCustomerName('');
      setOrderType('Dine-in');
      setNotes('');
      setPaymentMethod('Cash');
      setCashReceived('');
      setFieldErrors({});
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div className="pos-layout">
      <section className="pos-catalog">
        <div className="page-heading pos-heading">
          <div>
            <span className="eyebrow">POINT OF SALE</span>
            <h1>New sale</h1>
            <p>Select products, apply an active promo, and complete payment.</p>
          </div>
          <div className="heading-actions">
            <button className="outline-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="pos-catalog-toolbar panel">
          <div className="pos-search"><Search size={16} /><input placeholder="Search products..." value={query} onChange={event => setQuery(event.target.value)} /></div>
          <div className="pos-categories">
            {categories.map(item => <button type="button" key={item} className={`pos-chip ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
        </div>

        {promos.length > 0 && <section className="pos-promo-section">
          <div className="pos-section-head"><h3><Tag size={16} /> Active promos</h3><span>{promos.length} available</span></div>
          <div className="pos-promo-strip">
            {promos.map(promo => <button type="button" key={promo.id} className={`pos-promo-card ${String(promoId) === String(promo.id) ? 'selected' : ''}`} onClick={() => setPromoId(current => String(current) === String(promo.id) ? '' : String(promo.id))}>
              <div className="pos-promo-media">
                {promo.image_url ? <img src={promo.image_url} alt={promo.name} /> : <Tag size={22} />}
              </div>
              <div className="pos-promo-info">
                <span className="pos-promo-badge">{promoDiscountLabel(promo)}</span>
                <b>{promo.name}</b>
                <small>{promoAppliesTo(promo)}</small>
                <em><CalendarDays size={12} /> Ends {formatDateTime(promo.expires_at)}</em>
              </div>
              {String(promoId) === String(promo.id) && <span className="pos-promo-applied"><CheckCircle2 size={14} /> Applied</span>}
            </button>)}
          </div>
        </section>}

        <section className="pos-products-panel">
          <div className="pos-section-head"><h3><Coffee size={16} /> Products</h3><span>{filteredProducts.length} item{filteredProducts.length === 1 ? '' : 's'}</span></div>
          {loading ? <div className="loading-state">Loading products...</div> : filteredProducts.length === 0
            ? <div className="empty-state"><Coffee size={28} /><b>No products found</b><span>Try another search or category.</span></div>
            : <div className="pos-product-grid">
              {filteredProducts.map(product => <button type="button" className="pos-product-card" key={product.id} onClick={() => addProduct(product)}>
                <div className="pos-product-media">
                  {product.image_url ? <img src={product.image_url} alt={product.name} /> : <div className="pos-product-fallback"><Coffee size={28} /></div>}
                </div>
                <div className="pos-product-body">
                  <span className="pos-product-cat">{product.category}</span>
                  <b>{product.name}</b>
                  <small>{product.description || 'Freshly prepared'}</small>
                  <strong>{peso(product.price)}</strong>
                </div>
                <span className="pos-product-add"><Plus size={16} /></span>
              </button>)}
            </div>}
        </section>
      </section>

      <aside className="pos-cart panel">
        <div className="pos-cart-head">
          <div><span className="eyebrow">CURRENT SALE</span><h2>Order summary</h2></div>
          <button type="button" className="icon-btn" title="Clear cart" onClick={() => setCart([])} disabled={!cart.length}><Trash2 size={17} /></button>
        </div>

        <div className="pos-cart-scroll">
          {cart.length === 0
            ? <div className="pos-cart-empty"><ShoppingCart size={30} /><b>Cart is empty</b><span>Tap a product to start the sale.</span></div>
            : <div className="pos-cart-items">
              {cart.map(item => <div className="pos-cart-item" key={item.id}>
                <div className="pos-cart-thumb">{item.image_url ? <img src={item.image_url} alt="" /> : <Coffee size={16} />}</div>
                <div className="pos-cart-item-info">
                  <b>{item.name}</b>
                  <small>{peso(item.price)} each</small>
                  <div className="qty-control">
                    <button type="button" onClick={() => changeQty(item.id, item.qty - 1)}><Minus size={12} /></button>
                    <span>{item.qty}</span>
                    <button type="button" onClick={() => changeQty(item.id, item.qty + 1)}><Plus size={12} /></button>
                  </div>
                </div>
                <div className="pos-cart-line"><b>{peso(Number(item.price) * item.qty)}</b><button type="button" className="icon-btn" onClick={() => removeItem(item.id)}><X size={14} /></button></div>
              </div>)}
            </div>}

          <div className="pos-order-fields">
            <POSField label="Customer name" required error={fieldErrors.customerName}>
              <input
                ref={customerNameRef}
                value={customerName}
                onChange={event => {
                  setCustomerName(event.target.value);
                  setError('');
                  if (fieldErrors.customerName) setFieldErrors(current => ({ ...current, customerName: '' }));
                }}
                placeholder="Enter customer name"
                className={fieldErrors.customerName ? 'invalid' : ''}
              />
            </POSField>
            <div className="form-two">
              <POSField label="Order type"><select value={orderType} onChange={event => setOrderType(event.target.value)}>{['Dine-in', 'Takeout', 'Advance Order', 'Event'].map(type => <option key={type}>{type}</option>)}</select></POSField>
              <POSField label="Promo">
                <select value={promoId} onChange={event => setPromoId(event.target.value)}>
                  <option value="">No promo</option>
                  {promos.map(promo => <option key={promo.id} value={promo.id}>{promo.name} · {promoDiscountLabel(promo)}</option>)}
                </select>
              </POSField>
            </div>
            <POSField label="Special instructions"><textarea rows="2" value={notes} onChange={event => setNotes(event.target.value)} placeholder="e.g. Less ice, extra shot" /></POSField>
            {selectedPromo && !promoApplicable && <p className="pos-warning"><AlertTriangle size={14} /> This promo applies to {selectedPromo.product_name}. Add it to the cart or choose another promo.</p>}
          </div>

          <div className="pos-totals">
            <div><span>Subtotal</span><b>{peso(subtotal)}</b></div>
            <div className="pos-discount"><span>Promo discount</span><b>-{peso(discount)}</b></div>
            <div className="pos-grand"><span>Total</span><b>{peso(total)}</b></div>
          </div>
        </div>

        <div className="pos-payment">
          <span className="pos-payment-label">Payment method</span>
          <div className="pos-payment-options">
            {[['Cash', Banknote], ['GCash', Smartphone], ['Card', CreditCard]].map(([method, Icon]) => <button type="button" key={method} className={paymentMethod === method ? 'active' : ''} onClick={() => {
              setPaymentMethod(method);
              setError('');
              if (method !== 'Cash') setFieldErrors(current => ({ ...current, cashReceived: '' }));
            }}><Icon size={16} /> {method}</button>)}
          </div>
          {paymentMethod === 'Cash' && <div className="pos-cash">
            <POSField label="Cash received" required error={fieldErrors.cashReceived}>
              <input
                ref={cashReceivedRef}
                type="number"
                min="0"
                step="0.01"
                value={cashReceived}
                onChange={event => {
                  setCashReceived(event.target.value);
                  setError('');
                  if (fieldErrors.cashReceived) setFieldErrors(current => ({ ...current, cashReceived: '' }));
                }}
                placeholder="0.00"
                className={fieldErrors.cashReceived ? 'invalid' : ''}
              />
            </POSField>
            {cashShort && !fieldErrors.cashReceived && <small className="field-error">Short by {peso(total - cash)}</small>}
            <div className="pos-quick-cash">{quickCash.map(amount => <button type="button" key={amount} onClick={() => {
              setCashReceived(String(amount));
              setError('');
              setFieldErrors(current => ({ ...current, cashReceived: '' }));
            }}>{peso(amount)}</button>)}</div>
            <div className="pos-change"><span>Change</span><b>{peso(change)}</b></div>
          </div>}
        </div>

        <button type="button" className="primary pos-checkout" disabled={!canCheckout || busy} onClick={checkout}>
          {busy ? 'Processing...' : <><Receipt size={17} /> Charge {peso(total)} <ArrowUpRight size={16} /></>}
        </button>
        <p className="pos-secure"><CheckCircle2 size={13} /> The sale is recorded and sent to the kitchen.</p>
      </aside>
    </div>

    {receipt && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setReceipt(null)}>
      <div className="modal receipt-modal">
        <div className="modal-head"><div><span className="eyebrow">PAYMENT COMPLETE</span><h2>Receipt</h2></div><button type="button" className="icon-btn" onClick={() => setReceipt(null)}><X /></button></div>
        <ReceiptView receipt={receipt} />
        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={() => window.print()}><Printer size={16} /> Print receipt</button>
          <button type="button" className="primary" onClick={() => setReceipt(null)}>New sale</button>
        </div>
      </div>
    </div>}

    {receipt && <div className="print-receipt"><ReceiptView receipt={receipt} /></div>}
  </>;
}
