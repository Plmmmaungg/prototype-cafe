import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Bell, CalendarDays, CheckCircle2, ChevronRight, Clock3, Package, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from './api';
import { formatInventoryDate } from './inventoryUtils';

const emptyData = {
  lowStock: [],
  expired: [],
  expiring: [],
  upcomingReservations: [],
  lowStockCount: 0,
  expiredCount: 0,
  expiringCount: 0,
  upcomingCount: 0,
  totalCount: 0
};

const alertKeyFor = (group, item) => {
  if (group === 'lowStock') return `low-stock:${item.id}:${Number(item.minimum_stock || 0)}:${Number(item.quantity) <= 0 ? 'out' : 'low'}`;
  if (group === 'expired') return `expired:${item.id}:${item.expiration_date || ''}`;
  if (group === 'expiring') return `expiring:${item.id}:${item.expiration_date || ''}`;
  if (group === 'upcoming') return `reservation:${item.id}:${item.reservation_date || ''}:${item.start_time || ''}`;
  return `${group}:${item.id}`;
};

const dismissedStorageKey = user => `cm_dismissed_alerts_${user?.id || 'guest'}`;

const readDismissed = user => {
  try {
    const parsed = JSON.parse(localStorage.getItem(dismissedStorageKey(user)) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const formatAlertTime = value => {
  if (!value) return '';
  const [hours, minutes] = String(value).split(':').map(Number);
  return new Date(2000, 0, 1, hours || 0, minutes || 0).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

const formatCountdown = minutes => {
  if (minutes === null || minutes === undefined) return '';
  const amount = Number(minutes);
  if (amount <= 15) return 'Starting soon';
  if (amount < 60) return `In ${amount} min`;
  if (amount < 1440) return `In ${Math.floor(amount / 60)} hr`;
  const days = Math.round(amount / 1440);
  return `In ${days} day${days === 1 ? '' : 's'}`;
};

const expiryCountdown = item => {
  if (Number(item.days_remaining) === 0) return 'Expires today';
  if (Number(item.days_remaining) === 1) return 'Expires tomorrow';
  return `Expires in ${item.days_remaining} days`;
};

export default function NotificationBell({ user }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(() => readDismissed(user));
  const wrapRef = useRef(null);
  const navigate = useNavigate();
  const canViewInventory = ['Owner / Manager', 'Inventory Personnel'].includes(user?.role);
  const canViewReservations = ['Owner / Manager', 'Cashier / Service Staff'].includes(user?.role);

  const load = async () => {
    setError('');
    try {
      const response = await api.get('/notifications');
      const nextData = { ...emptyData, ...response.data };
      const currentKeys = new Set([
        ...nextData.expired.map(item => alertKeyFor('expired', item)),
        ...nextData.expiring.map(item => alertKeyFor('expiring', item)),
        ...nextData.lowStock.map(item => alertKeyFor('lowStock', item)),
        ...nextData.upcomingReservations.map(item => alertKeyFor('upcoming', item))
      ]);
      setDismissed(current => {
        const next = new Set([...current].filter(key => currentKeys.has(key)));
        return next.size === current.size ? current : next;
      });
      setData(nextData);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(dismissedStorageKey(user), JSON.stringify([...dismissed]));
    } catch {
      // Notification state is still kept in memory when storage is unavailable.
    }
  }, [dismissed, user]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    const onInventoryUpdated = () => load();
    const onReservationsUpdated = () => load();
    window.addEventListener('cm:inventory-updated', onInventoryUpdated);
    window.addEventListener('cm:reservations-updated', onReservationsUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cm:inventory-updated', onInventoryUpdated);
      window.removeEventListener('cm:reservations-updated', onReservationsUpdated);
    };
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

  const toggle = () => {
    if (!open) load();
    setOpen(current => !current);
  };

  const goTo = path => {
    setOpen(false);
    navigate(path);
  };

  const openAlert = (group, item) => {
    setDismissed(current => {
      const next = new Set(current);
      next.add(alertKeyFor(group, item));
      return next;
    });
    setOpen(false);
    if (group === 'upcoming') {
      navigate(`/reservations?focus=${item.id}`);
      return;
    }
    const params = new URLSearchParams({ focus: String(item.id) });
    if (group === 'lowStock') params.set('stock', 'low-stock');
    if (group === 'expired') params.set('expiry', 'expired');
    if (group === 'expiring') params.set('expiry', 'expiring');
    navigate(`/inventory?${params.toString()}`);
  };

  const rawGroups = [
    {
      key: 'expired', title: 'Expired items', tone: 'expired', icon: <AlertTriangle size={13} />,
      items: data.expired, render: item => <button type="button" className="notification-item notification-item-expired" key={item.id} onClick={() => openAlert('expired', item)} title={`Open ${item.item_name} in Inventory`}>
        <div className="notification-alert-icon expired"><AlertTriangle size={15} /></div>
        <div className="notification-item-main">
          <b>{item.item_name}</b>
          <small>{item.category}{item.unit ? ` · ${Number(item.quantity)} ${item.unit} on hand` : ''}</small>
        </div>
        <div className="notification-expiry expired">
          <b>Expired</b>
          <small>{formatInventoryDate(item.expiration_date)}</small>
        </div>
        <ChevronRight size={13} className="notification-open-cue" />
      </button>
    },
    {
      key: 'expiring', title: 'Expiring within 2 days', tone: 'expiring', icon: <Clock3 size={13} />,
      items: data.expiring, render: item => <button type="button" className="notification-item notification-item-expiring" key={item.id} onClick={() => openAlert('expiring', item)} title={`Open ${item.item_name} in Inventory`}>
        <div className="notification-alert-icon expiring"><Clock3 size={15} /></div>
        <div className="notification-item-main">
          <b>{item.item_name}</b>
          <small>{item.category}{item.unit ? ` · ${Number(item.quantity)} ${item.unit} on hand` : ''}</small>
        </div>
        <div className="notification-expiry expiring">
          <b>{expiryCountdown(item)}</b>
          <small>{formatInventoryDate(item.expiration_date)}</small>
        </div>
        <ChevronRight size={13} className="notification-open-cue" />
      </button>
    },
    {
      key: 'upcoming', title: 'Upcoming reservations & events', tone: 'event', icon: <CalendarDays size={13} />,
      items: data.upcomingReservations, render: item => <button type="button" className="notification-item notification-item-event" key={item.id} onClick={() => openAlert('upcoming', item)} title={`Open ${item.customer_name} reservation`}>
        <div className="notification-alert-icon event"><CalendarDays size={15} /></div>
        <div className="notification-item-main">
          <b>{item.customer_name}</b>
          <small>{item.event_type} · {item.guests} guest{Number(item.guests) === 1 ? '' : 's'}</small>
          <small>{formatInventoryDate(item.reservation_date)} · {formatAlertTime(item.start_time)}</small>
        </div>
        <div className="notification-countdown">{formatCountdown(item.minutes_until)}</div>
        <ChevronRight size={13} className="notification-open-cue" />
      </button>
    },
    {
      key: 'lowStock', title: 'Low stock', tone: 'low', icon: <Package size={13} />,
      items: data.lowStock, render: item => <button type="button" className="notification-item" key={item.id} onClick={() => openAlert('lowStock', item)} title={`Open ${item.item_name} in Inventory`}>
        <div className="notification-alert-icon"><AlertTriangle size={15} /></div>
        <div className="notification-item-main">
          <b>{item.item_name}</b>
          <small>{item.category || 'Inventory'}{item.unit ? ` · ${item.unit}` : ''}</small>
        </div>
        <div className="notification-stock">
          {Number(item.quantity)}{item.unit ? ` ${item.unit}` : ''} left
          <small>min {Number(item.minimum_stock)}{item.unit ? ` ${item.unit}` : ''}</small>
        </div>
        <ChevronRight size={13} className="notification-open-cue" />
      </button>
    }
  ];
  const groups = rawGroups
    .map(group => ({ ...group, items: group.items.filter(item => !dismissed.has(alertKeyFor(group.key, item))) }))
    .filter(group => group.items.length > 0);
  const counts = Object.fromEntries(groups.map(group => [group.key, group.items.length]));
  const stockAlerts = Number(counts.expired || 0) + Number(counts.expiring || 0) + Number(counts.lowStock || 0);
  const count = stockAlerts + Number(counts.upcoming || 0);

  return <div className="notification-wrap" ref={wrapRef}>
    <button
      type="button"
      className={`icon-btn notification ${open ? 'active' : ''}`}
      aria-label={count ? `${count} staff alerts` : 'No staff alerts'}
      aria-expanded={open}
      onClick={toggle}
    >
      <Bell size={18} />
      {count > 0 && <span className="notification-badge">{count > 9 ? '9+' : count}</span>}
    </button>

    {open && <div className="notification-panel">
      <div className="notification-panel-head">
        <div><span className="eyebrow">ALERTS</span><b>Staff notifications</b></div>
        <button type="button" className="icon-btn" title="Refresh alerts" onClick={load}><RefreshCw size={15} /></button>
      </div>

      {error && <div className="notification-error">{error}</div>}

      {loading
        ? <div className="notification-loading">Checking inventory and reservations...</div>
        : groups.length > 0
          ? <div className="notification-list">
            {groups.map(group => <div className="notification-group" key={group.key}>
              <div className={`notification-group-head ${group.tone}`}>
                <span>{group.icon} {group.title}</span>
                <b>{group.items.length}</b>
              </div>
              {group.items.slice(0, 5).map(group.render)}
              {group.items.length > 5 && <button type="button" className="notification-more" onClick={() => goTo(group.key === 'upcoming' ? '/reservations' : '/inventory')}>+ {group.items.length - 5} more {group.key === 'upcoming' ? 'booking(s)' : 'item(s)'}</button>}
            </div>)}
          </div>
          : !error && <div className="notification-empty"><CheckCircle2 size={24} /><b>No open alerts</b><span>Dismissed alerts stay in Inventory until the stock or expiration issue is resolved.</span></div>}

      {count > 0 && <div className="notification-panel-foot">
        <span>{count} alert{count === 1 ? '' : 's'} need attention</span>
        <div className="notification-foot-actions">
          {canViewInventory && stockAlerts > 0 && <button type="button" onClick={() => goTo('/inventory')}>Inventory <ChevronRight size={12} /></button>}
          {canViewReservations && counts.upcoming > 0 && <button type="button" onClick={() => goTo('/reservations')}>Reservations <ChevronRight size={12} /></button>}
        </div>
      </div>}
    </div>}
  </div>;
}
