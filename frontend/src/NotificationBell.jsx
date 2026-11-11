import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from './api';

export default function NotificationBell({ user }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);
  const navigate = useNavigate();
  const canViewInventory = ['Owner / Manager', 'Inventory Personnel'].includes(user?.role);

  const load = async () => {
    setError('');
    try {
      const { data } = await api.get('/notifications');
      setItems(Array.isArray(data.lowStock) ? data.lowStock : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load stock alerts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = event => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const count = items.length;
  const toggle = () => {
    if (!open) load();
    setOpen(current => !current);
  };

  return <div className="notification-wrap" ref={wrapRef}>
    <button
      type="button"
      className={`icon-btn notification ${open ? 'active' : ''}`}
      aria-label={count ? `${count} low-stock alerts` : 'No low-stock alerts'}
      aria-expanded={open}
      onClick={toggle}
    >
      <Bell size={18} />
      {count > 0 && <span className="notification-badge">{count > 9 ? '9+' : count}</span>}
    </button>

    {open && <div className="notification-panel">
      <div className="notification-panel-head">
        <div><span className="eyebrow">ALERTS</span><b>Low-stock notifications</b></div>
        <button type="button" className="icon-btn" title="Refresh alerts" onClick={load}><RefreshCw size={15} /></button>
      </div>

      {error && <div className="notification-error">{error}</div>}

      {loading
        ? <div className="notification-loading">Checking stock levels...</div>
        : items.length > 0
          ? <div className="notification-list">
            {items.map(item => <div className="notification-item" key={item.id}>
              <div className="notification-alert-icon"><AlertTriangle size={15} /></div>
              <div className="notification-item-main">
                <b>{item.item_name}</b>
                <small>{item.category || 'Inventory'}{item.unit ? ` · ${item.unit}` : ''}</small>
              </div>
              <div className="notification-stock">
                {Number(item.quantity)}{item.unit ? ` ${item.unit}` : ''} left
                <small>min {Number(item.minimum_stock)}{item.unit ? ` ${item.unit}` : ''}</small>
              </div>
            </div>)}
          </div>
          : !error && <div className="notification-empty"><CheckCircle2 size={24} /><b>Stock levels look healthy</b><span>No items are at or below their minimum threshold.</span></div>}

      {items.length > 0 && <div className="notification-panel-foot">
        <span>{count} item{count === 1 ? ' needs' : 's need'} attention</span>
        {canViewInventory && <button type="button" onClick={() => { setOpen(false); navigate('/inventory'); }}>View inventory <ChevronRight size={12} /></button>}
      </div>}
    </div>}
  </div>;
}
