import React, { useEffect, useState } from 'react';
import {
  Banknote, CalendarDays, CreditCard, ReceiptText, RefreshCw, ShoppingBag, Smartphone, TrendingUp
} from 'lucide-react';
import api from './api';
import { peso } from './posUtils';

const paymentIcon = method => {
  if (method === 'GCash') return <Smartphone size={13} />;
  if (method === 'Card') return <CreditCard size={13} />;
  return <Banknote size={13} />;
};

const formatSaleTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

export default function TodaySalesPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get('/sales/today');
      setData(response.data);
      setRefreshedAt(new Date());
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load today\'s sales.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), 60000);
    const onSale = () => load(true);
    const onFocus = () => load(true);
    window.addEventListener('cm:sales-updated', onSale);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cm:sales-updated', onSale);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const summary = data?.summary || {};
  const payments = data?.payments || [];
  const transactions = data?.transactions || [];
  const dateLabel = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return <section className="panel today-sales-panel">
    <div className="today-sales-head">
      <div>
        <span className="eyebrow">TODAY'S SALES</span>
        <h3>Sales transactions and totals</h3>
        <p><CalendarDays size={12} /> {dateLabel} · Updates automatically when a new transaction is recorded{refreshedAt ? ` · ${refreshedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
      </div>
      <button type="button" className="outline-btn today-sales-refresh" onClick={() => load(false)} disabled={loading}><RefreshCw size={15} /> Refresh</button>
    </div>

    {error && <div className="error-box">{error}</div>}

    {loading && !data ? <div className="loading-state">Loading today's sales...</div> : <>
      <div className="today-sales-metrics">
        <div className="today-sales-metric main">
          <span>Net sales today</span>
          <b>{peso(summary.totalSales)}</b>
          <small>{Number(summary.discounts || 0) > 0 ? `${peso(summary.discounts)} discounts applied` : 'No discounts applied'}</small>
        </div>
        <div className="today-sales-metric">
          <div className="today-sales-metric-icon"><ReceiptText size={15} /></div>
          <span>Transactions</span>
          <b>{Number(summary.transactions || 0)}</b>
          <small>{Number(summary.openOrders || 0)} still open</small>
        </div>
        <div className="today-sales-metric">
          <div className="today-sales-metric-icon"><ShoppingBag size={15} /></div>
          <span>Items sold</span>
          <b>{Number(summary.itemsSold || 0)}</b>
          <small>Across today's sales</small>
        </div>
        <div className="today-sales-metric">
          <div className="today-sales-metric-icon"><TrendingUp size={15} /></div>
          <span>Average sale</span>
          <b>{peso(summary.averageSale)}</b>
          <small>Per transaction</small>
        </div>
      </div>

      <div className="today-sales-body">
        <div className="today-payment-breakdown">
          <div className="today-sales-section-head"><b>Payment breakdown</b><span>Collected {peso(summary.collected)}</span></div>
          <div className="today-payment-list">
            {payments.length === 0
              ? <div className="today-payment-empty">No payments recorded yet.</div>
              : payments.map(payment => <div className="today-payment-row" key={payment.payment_method}>
                <span className="today-payment-icon">{paymentIcon(payment.payment_method)}</span>
                <div><b>{payment.payment_method}</b><small>{payment.transactions} transaction{Number(payment.transactions) === 1 ? '' : 's'}</small></div>
                <strong>{peso(payment.total)}</strong>
              </div>)}
          </div>
          <p className="today-sales-note">Cancelled orders are excluded from today's sales totals.</p>
        </div>

        <div className="today-transactions">
          <div className="today-sales-section-head"><b>Today's transactions</b><span>{transactions.length} record{transactions.length === 1 ? '' : 's'}</span></div>
          {transactions.length === 0
            ? <div className="today-transaction-empty"><ReceiptText size={22} /><b>No sales recorded today</b><span>Completed POS sales will appear here automatically.</span></div>
            : <div className="today-transaction-list">{transactions.map(order => <div className={`today-transaction ${order.status === 'Cancelled' ? 'cancelled' : ''}`} key={order.id}>
              <div className="today-transaction-main">
                <b>{order.order_number}</b>
                <small>{order.customer_name} · {order.order_type} · {order.cashier_name || 'Cashier'}</small>
              </div>
              <span className={`status ${String(order.status || '').toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span>
              <div className="today-transaction-amount">
                <b>{peso(order.total_amount)}</b>
                <small>{order.payment_method} · {formatSaleTime(order.created_at)}</small>
              </div>
            </div>)}</div>}
        </div>
      </div>
    </>}
  </section>;
}
