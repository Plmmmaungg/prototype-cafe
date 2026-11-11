import React, { useEffect, useState } from 'react';
import {
  Banknote, ChefHat, ClipboardList, Clock3, CreditCard, RefreshCw, Smartphone, Tag,
  Users, UtensilsCrossed, X
} from 'lucide-react';
import api from './api';
import { formatDateTime, peso } from './posUtils';

const statusChoices = (role, current) => {
  if (role === 'Owner / Manager') return ({ Pending: ['Confirmed', 'Cancelled'], Confirmed: ['Preparing', 'Cancelled'], Preparing: ['Ready', 'Cancelled'], Ready: ['Completed'] })[current] || [];
  if (role === 'Cashier / Service Staff') return ({ Pending: ['Confirmed', 'Cancelled'], Ready: ['Completed'] })[current] || [];
  if (role === 'Kitchen Personnel') return ({ Confirmed: ['Preparing'], Preparing: ['Ready'] })[current] || [];
  return [];
};

const actionLabel = status => ({
  Confirmed: 'Confirm order',
  Preparing: 'Start preparing',
  Ready: 'Mark ready',
  Completed: 'Complete order',
  Cancelled: 'Cancel order'
})[status] || status;

const statusClass = status => `status ${String(status || '').toLowerCase().replaceAll(' ', '-')}`;

export default function OrderDetailModal({ orderId, user, onClose, onStatusChanged }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/orders/${orderId}`);
      setOrder(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [orderId]);
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const updateStatus = async status => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/orders/${order.id}/status`, { status });
      await load();
      onStatusChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update the order status.');
    } finally {
      setBusy(false);
    }
  };

  const items = order?.items || [];
  const statusOptions = order ? statusChoices(user?.role, order.status) : [];
  const subtotal = Number(order?.subtotal) > 0
    ? Number(order.subtotal)
    : Number(order?.total_amount || 0) + Number(order?.discount_amount || 0);
  const PaymentIcon = order?.payment_method === 'GCash' ? Smartphone : order?.payment_method === 'Card' ? CreditCard : Banknote;

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="modal order-detail-modal">
      <div className="modal-head">
        <div>
          <span className="eyebrow">KITCHEN ORDER DETAILS</span>
          <h2>{order ? order.order_number : 'Loading order...'}</h2>
          <p className="detail-subtitle">{order ? `${order.customer_name} · ${order.order_type}` : 'Fetching the customer order and special instructions.'}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close order details"><X /></button>
      </div>

      {error && <div className="error-box">{error}{!loading && <button className="mini-btn" onClick={load}><RefreshCw size={12} /> Try again</button>}</div>}

      {loading
        ? <div className="loading-state">Loading order details...</div>
        : order && <>
          <div className="order-detail-banner">
            <div className="order-detail-banner-top">
              <span className={statusClass(order.status)}>{order.status}</span>
              <span className="order-detail-type">{order.order_type}</span>
            </div>
            <div className="order-detail-meta">
              <div><Users size={15} /><span>Customer</span><b>{order.customer_name}</b></div>
              <div><Clock3 size={15} /><span>Placed</span><b>{formatDateTime(order.created_at)}</b></div>
              <div><ChefHat size={15} /><span>Order</span><b>{order.order_number}</b></div>
            </div>
          </div>

          <div className="order-detail-columns">
            <section className="order-detail-items">
              <div className="detail-section-head">
                <h3><UtensilsCrossed size={16} /> Customer order items</h3>
                <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
              </div>
              {items.length === 0
                ? <div className="order-detail-empty">No line items were found for this order.</div>
                : <table className="detail-items-table">
                  <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {items.map(item => <tr key={item.id}>
                      <td><b>{item.product_name}</b></td>
                      <td>{item.quantity}</td>
                      <td>{peso(item.unit_price)}</td>
                      <td>{peso(item.subtotal)}</td>
                    </tr>)}
                  </tbody>
                </table>}
            </section>

            <aside className="order-detail-side">
              <section className={`order-detail-note ${order.special_instructions ? 'has-note' : ''}`}>
                <h3><ClipboardList size={16} /> Special instruction</h3>
                <p>{order.special_instructions || 'No special instructions for this order.'}</p>
              </section>

              <section className="order-detail-summary">
                <h3>Payment summary</h3>
                <div><span>Subtotal</span><b>{peso(subtotal)}</b></div>
                {Number(order.discount_amount) > 0 && <div className="detail-discount"><span><Tag size={12} /> Promo{order.promo_name ? ` · ${order.promo_name}` : ''}</span><b>-{peso(order.discount_amount)}</b></div>}
                <div className="detail-total"><span>Total</span><b>{peso(order.total_amount)}</b></div>
                <div className="detail-payment"><span>Payment</span><b><PaymentIcon size={14} /> {order.payment_method || '—'}</b></div>
                {Number(order.amount_paid) > 0 && <div><span>Amount paid</span><b>{peso(order.amount_paid)}</b></div>}
                {Number(order.change_due) > 0 && <div><span>Change</span><b>{peso(order.change_due)}</b></div>}
              </section>
            </aside>
          </div>

          {statusOptions.length > 0 && <div className="order-detail-actions">
            <div><span className="eyebrow">NEXT STEP</span><p>Update the kitchen status for this order.</p></div>
            <div className="order-status-buttons">
              {statusOptions.map(status => <button key={status} className={`mini-btn ${status === 'Cancelled' ? 'danger' : ''}`} onClick={() => updateStatus(status)} disabled={busy}>{busy ? 'Updating...' : actionLabel(status)}</button>)}
            </div>
          </div>}
        </>}

      <div className="modal-actions">
        <button className="outline-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>;
}
