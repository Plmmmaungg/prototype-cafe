import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, CalendarDays, CheckCircle2, Clock3, Pencil, Phone, Plus, RefreshCw,
  Search, Users, X, XCircle
} from 'lucide-react';
import api from './api';

const EVENT_TYPES = ['Regular Dining', 'Birthday Celebration', 'Buffet', 'Private Event', 'Special Occasion'];
const RESERVATION_STATUSES = ['Pending', 'Confirmed', 'Arrived', 'Completed', 'Cancelled'];
const TRANSITIONS = {
  Pending: ['Confirmed', 'Arrived', 'Cancelled'],
  Confirmed: ['Arrived', 'Completed', 'Cancelled'],
  Arrived: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
  'No-show': ['Pending', 'Cancelled']
};

const pad = value => String(value).padStart(2, '0');
const todayValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const dateValue = value => {
  if (!value) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  if (text.length > 10) {
    const parsed = new Date(text.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }
  return match[0];
};
const timeValue = value => {
  const match = String(value || '').match(/(\d{2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : String(value || '').slice(0, 5);
};

const parseLocalDate = value => {
  const text = dateValue(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

const reservationDateTime = row => {
  const date = parseLocalDate(row.reservation_date);
  if (!date) return null;
  const parts = String(row.start_time || '00:00').split(':').map(Number);
  date.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
  return date;
};

const formatDate = value => {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};

const formatTime = value => {
  if (!value) return '—';
  const [hours, minutes] = String(value).split(':').map(Number);
  const date = new Date(2000, 0, 1, hours || 0, minutes || 0);
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

const relativeTime = (row, now) => {
  const date = reservationDateTime(row);
  if (!date) return '';
  const minutes = Math.round((date.getTime() - now.getTime()) / 60000);
  if (minutes <= 15 && minutes >= -15) return 'Starting soon';
  if (minutes < 60) return `In ${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `In ${hours}h${remainder ? ` ${remainder}m` : ''}`;
  }
  const days = Math.round(minutes / 1440);
  return `In ${days} day${days === 1 ? '' : 's'}`;
};

const blankForm = () => ({
  customer_name: '',
  contact_number: '',
  reservation_date: todayValue(),
  start_time: '',
  end_time: '',
  guests: 2,
  event_type: 'Regular Dining',
  table_arrangement: '',
  special_requests: ''
});

function ReservationField({ label, required, error, hint, children }) {
  return <label className={`field ${error ? 'has-error' : ''}`}>
    <span>{label}{required ? ' *' : ''}</span>
    {children}
    {error && <small className="field-error">{error}</small>}
    {!error && hint && <small className="field-hint">{hint}</small>}
  </label>;
}

function StatusBadge({ value }) {
  return <span className={`status ${String(value || '').toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;
}

export default function ReservationsPage({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [scopeFilter, setScopeFilter] = useState('All');
  const [eventFilter, setEventFilter] = useState('All');
  const [now, setNow] = useState(() => new Date());
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/reservations');
      setRows(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load reservations.');
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
    const onReservationsUpdated = () => load(true);
    window.addEventListener('cm:reservations-updated', onReservationsUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cm:reservations-updated', onReservationsUpdated);
    };
  }, []);

  const today = todayValue();

  const upcoming = useMemo(() => rows
    .filter(row => ['Pending', 'Confirmed'].includes(row.status))
    .filter(row => {
      const date = reservationDateTime(row);
      return date && date.getTime() >= now.getTime() - 15 * 60000 && date.getTime() <= now.getTime() + 48 * 60 * 60000;
    })
    .sort((a, b) => (reservationDateTime(a)?.getTime() || 0) - (reservationDateTime(b)?.getTime() || 0)), [rows, now]);

  const counts = useMemo(() => rows.reduce((result, row) => {
    const date = dateValue(row.reservation_date);
    if (row.status !== 'Cancelled' && date === today) result.today += 1;
    if (row.status === 'Pending') result.pending += 1;
    if (row.status === 'Arrived') result.arrived += 1;
    if (row.status === 'Completed') result.completed += 1;
    return result;
  }, { today: 0, pending: 0, arrived: 0, completed: 0 }), [rows, today]);

  const filtered = useMemo(() => rows.filter(row => {
    const matchesQuery = `${row.customer_name} ${row.contact_number || ''} ${row.event_type} ${row.special_requests || ''}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'All' || row.status === statusFilter;
    const matchesEvent = eventFilter === 'All' || row.event_type === eventFilter;
    const date = parseLocalDate(row.reservation_date);
    const todayStart = parseLocalDate(today);
    const matchesScope = scopeFilter === 'All'
      ? true
      : scopeFilter === 'Today'
        ? dateValue(row.reservation_date) === today
        : scopeFilter === 'Upcoming'
          ? Boolean(date && todayStart && date.getTime() >= todayStart.getTime())
          : Boolean(date && todayStart && date.getTime() < todayStart.getTime());
    return matchesQuery && matchesStatus && matchesEvent && matchesScope;
  }), [rows, query, statusFilter, eventFilter, scopeFilter, today, now]);

  const eventTypes = useMemo(() => ['All', ...Array.from(new Set(rows.map(row => row.event_type).filter(Boolean))).sort()], [rows]);
  const activeFilters = [query, statusFilter, scopeFilter, eventFilter].some(value => value && value !== 'All');

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('All');
    setScopeFilter('All');
    setEventFilter('All');
  };

  const set = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: '' }));
    if (error) setError('');
  };

  const openNew = () => {
    setEditing(null);
    setForm(blankForm());
    setFieldErrors({});
    setError('');
    setModal(true);
  };

  const openEdit = row => {
    setEditing(row);
    setForm({
      customer_name: row.customer_name || '',
      contact_number: row.contact_number || '',
      reservation_date: dateValue(row.reservation_date),
      start_time: timeValue(row.start_time),
      end_time: row.end_time ? timeValue(row.end_time) : '',
      guests: row.guests || 1,
      event_type: row.event_type || 'Regular Dining',
      table_arrangement: row.table_arrangement || '',
      special_requests: row.special_requests || ''
    });
    setFieldErrors({});
    setError('');
    setModal(true);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.customer_name.trim()) nextErrors.customer_name = 'Customer name is required.';
    if (!form.contact_number) nextErrors.contact_number = 'Contact number is required.';
    else if (!/^\d{11}$/.test(form.contact_number)) nextErrors.contact_number = 'Contact number must be exactly 11 digits.';
    if (!form.reservation_date) nextErrors.reservation_date = 'Choose a reservation date.';
    if (!form.start_time) nextErrors.start_time = 'Choose a start time.';
    if (form.end_time && form.end_time <= form.start_time) nextErrors.end_time = 'End time must be after the start time.';
    const guests = Number(form.guests);
    if (!Number.isInteger(guests) || guests < 1) nextErrors.guests = 'Enter at least 1 guest.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError('Please correct the highlighted fields before saving.');
      return false;
    }
    return true;
  };

  const submit = async event => {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        contact_number: form.contact_number,
        reservation_date: form.reservation_date,
        start_time: form.start_time,
        end_time: form.end_time || null,
        guests: Number(form.guests),
        event_type: form.event_type,
        table_arrangement: form.table_arrangement.trim(),
        special_requests: form.special_requests.trim()
      };
      if (editing) await api.put(`/reservations/${editing.id}`, payload);
      else await api.post('/reservations', payload);
      setModal(false);
      window.dispatchEvent(new Event('cm:reservations-updated'));
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save this reservation.');
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (row, status) => {
    if (status === 'Cancelled' && !window.confirm(`Cancel the reservation for ${row.customer_name}?`)) return;
    if (status === 'Completed' && !window.confirm(`Mark ${row.customer_name}'s reservation as completed?`)) return;
    setStatusBusy(`${row.id}-${status}`);
    setError('');
    try {
      await api.put(`/reservations/${row.id}/status`, { status });
      window.dispatchEvent(new Event('cm:reservations-updated'));
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update the reservation status.');
    } finally {
      setStatusBusy('');
    }
  };

  const actionLabel = status => ({ Confirmed: 'Confirm', Arrived: 'Mark arrived', Completed: 'Complete', Cancelled: 'Cancel' })[status] || status;

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">GUEST EXPERIENCE</span>
        <h1>Reservations & Events</h1>
        <p>Manage guest bookings, reschedule visits, and track arrival status.</p>
      </div>
      <div className="heading-actions">
        <button className="outline-btn" onClick={() => load()} disabled={loading}><RefreshCw size={16} /> Refresh</button>
        <button className="primary" onClick={openNew}><Plus size={17} /> New reservation</button>
      </div>
    </div>

    {error && !modal && <div className="error-box">{error}</div>}

    <div className="reservation-stat-grid">
      <div className="reservation-stat"><span>Today's reservations</span><b>{counts.today}</b><small>Excluding cancelled bookings</small></div>
      <div className="reservation-stat pending"><span>Pending</span><b>{counts.pending}</b><small>Awaiting guest arrival</small></div>
      <div className="reservation-stat arrived"><span>Arrived</span><b>{counts.arrived}</b><small>Currently seated</small></div>
      <div className="reservation-stat completed"><span>Completed</span><b>{counts.completed}</b><small>Fulfilled reservations</small></div>
    </div>

    {upcoming.length > 0 && <section className="panel reservation-alert-panel">
      <div className="reservation-alert-head">
        <div className="reservation-alert-title"><Bell size={17} /><div><b>Upcoming reservations & events</b><span>{upcoming.length} booking(s) scheduled within the next 48 hours</span></div></div>
        <span className="reservation-alert-live"><i /> Live monitoring</span>
      </div>
      <div className="upcoming-event-strip">
        {upcoming.slice(0, 5).map(row => <div className="upcoming-event-card" key={row.id}>
          <div className="upcoming-event-top">
            <span className="upcoming-event-icon"><CalendarDays size={15} /></span>
            <span className="upcoming-countdown">{relativeTime(row, now)}</span>
          </div>
          <b>{row.customer_name}</b>
          <span className="upcoming-event-type">{row.event_type} · {row.guests} guest{Number(row.guests) === 1 ? '' : 's'}</span>
          <small><Clock3 size={12} /> {formatDate(row.reservation_date)} · {formatTime(row.start_time)}</small>
          {row.special_requests && <em title={row.special_requests}>Note: {row.special_requests}</em>}
        </div>)}
        {upcoming.length > 5 && <div className="upcoming-event-more">+ {upcoming.length - 5} more upcoming booking(s)</div>}
      </div>
    </section>}

    <section className="panel table-panel reservation-panel">
      <div className="table-toolbar">
        <div>
          <h3>Reservation records</h3>
          <p>{filtered.length} of {rows.length} reservation(s) shown{activeFilters ? ' · filtered' : ''}</p>
        </div>
        <div className="table-search"><Search size={16} /><input placeholder="Search customer, contact or event..." value={query} onChange={event => setQuery(event.target.value)} /></div>
      </div>

      <div className="reservation-filter-row">
        <label className="filter-select">Status
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="All">All statuses</option>
            {RESERVATION_STATUSES.map(status => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="filter-select">Date
          <select value={scopeFilter} onChange={event => setScopeFilter(event.target.value)}>
            <option value="All">All dates</option>
            <option value="Today">Today</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Past">Past</option>
          </select>
        </label>
        <label className="filter-select">Event
          <select value={eventFilter} onChange={event => setEventFilter(event.target.value)}>{eventTypes.map(type => <option key={type}>{type === 'All' ? 'All event types' : type}</option>)}</select>
        </label>
        <button type="button" className="mini-btn subtle filter-reset" onClick={clearFilters} disabled={!activeFilters}><X size={12} /> Clear filters</button>
      </div>

      {loading ? <div className="loading-state">Loading reservations...</div> : filtered.length === 0
        ? <div className="empty-state"><CalendarDays size={28} /><b>No reservations found</b><span>{rows.length ? 'Try changing or clearing the filters above.' : 'Create a reservation to start managing guest bookings.'}</span>{rows.length > 0 && activeFilters && <button className="mini-btn" onClick={clearFilters}>Clear filters</button>}</div>
        : <div className="table-scroll"><table className="reservation-table">
          <thead><tr><th>Customer</th><th>Contact</th><th>Date</th><th>Time</th><th>Guests</th><th>Event</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{filtered.map(row => {
            const nextStatuses = TRANSITIONS[row.status] || [];
            const isToday = dateValue(row.reservation_date) === today;
            return <tr key={row.id} className={isToday ? 'reservation-row row-today' : 'reservation-row'}>
              <td><b>{row.customer_name}</b>{row.special_requests && <small className="cell-sub reservation-note"><AlertTriangle size={10} /> {row.special_requests}</small>}</td>
              <td><span className="reservation-contact"><Phone size={12} /> {row.contact_number || '—'}</span></td>
              <td><span className="reservation-date"><CalendarDays size={12} /> {formatDate(row.reservation_date)}</span></td>
              <td>{formatTime(row.start_time)}{row.end_time ? ` – ${formatTime(row.end_time)}` : ''}</td>
              <td><span className="reservation-guests"><Users size={12} /> {row.guests}</span></td>
              <td>{row.event_type}{row.table_arrangement && <small className="cell-sub">{row.table_arrangement}</small>}</td>
              <td><StatusBadge value={row.status} /></td>
              <td><div className="row-actions reservation-actions">
                <button className="mini-btn" onClick={() => openEdit(row)}><Pencil size={12} /> Edit</button>
                {nextStatuses.includes('Confirmed') && <button className="mini-btn" disabled={statusBusy === `${row.id}-Confirmed`} onClick={() => updateStatus(row, 'Confirmed')}><CheckCircle2 size={12} /> Confirm</button>}
                {nextStatuses.includes('Arrived') && <button className="mini-btn" disabled={statusBusy === `${row.id}-Arrived`} onClick={() => updateStatus(row, 'Arrived')}><CheckCircle2 size={12} /> {statusBusy === `${row.id}-Arrived` ? 'Saving...' : 'Mark arrived'}</button>}
                {nextStatuses.includes('Completed') && <button className="mini-btn" disabled={statusBusy === `${row.id}-Completed`} onClick={() => updateStatus(row, 'Completed')}><CheckCircle2 size={12} /> {statusBusy === `${row.id}-Completed` ? 'Saving...' : 'Complete'}</button>}
                {nextStatuses.includes('Cancelled') && <button className="mini-btn danger" disabled={statusBusy === `${row.id}-Cancelled`} onClick={() => updateStatus(row, 'Cancelled')}><XCircle size={12} /> Cancel</button>}
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setModal(false)}>
      <div className="modal reservation-modal">
        <div className="modal-head">
          <div><span className="eyebrow">{editing ? 'EDIT RESERVATION' : 'NEW RESERVATION'}</span><h2>{editing ? 'Reschedule reservation' : 'Create a reservation'}</h2></div>
          <button className="icon-btn" onClick={() => setModal(false)}><X /></button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <form id="reservation-form" className="modal-form" onSubmit={submit} noValidate>
          <div className="form-two">
            <ReservationField label="Customer name" required error={fieldErrors.customer_name}>
              <input value={form.customer_name} onChange={event => set('customer_name', event.target.value)} placeholder="Full name" />
            </ReservationField>
            <ReservationField label="Contact number" required error={fieldErrors.contact_number} hint={`${form.contact_number.length}/11 digits · numbers only`}>
              <input
                inputMode="numeric"
                maxLength={11}
                value={form.contact_number}
                onChange={event => set('contact_number', event.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="11-digit mobile number"
                className={fieldErrors.contact_number ? 'invalid' : ''}
              />
            </ReservationField>
          </div>
          <div className="form-two">
            <ReservationField label="Reservation date" required error={fieldErrors.reservation_date}>
              <input type="date" min={editing ? undefined : todayValue()} value={form.reservation_date} onChange={event => set('reservation_date', event.target.value)} />
            </ReservationField>
            <ReservationField label="Guests" required error={fieldErrors.guests}>
              <input type="number" min="1" step="1" value={form.guests} onChange={event => set('guests', event.target.value)} />
            </ReservationField>
          </div>
          <div className="form-two">
            <ReservationField label="Start time" required error={fieldErrors.start_time}>
              <input type="time" value={form.start_time} onChange={event => set('start_time', event.target.value)} />
            </ReservationField>
            <ReservationField label="End time" error={fieldErrors.end_time}>
              <input type="time" value={form.end_time} onChange={event => set('end_time', event.target.value)} />
            </ReservationField>
          </div>
          <ReservationField label="Event type">
            <select value={form.event_type} onChange={event => set('event_type', event.target.value)}>{EVENT_TYPES.map(type => <option key={type}>{type}</option>)}</select>
          </ReservationField>
          <ReservationField label="Table arrangement">
            <input value={form.table_arrangement} onChange={event => set('table_arrangement', event.target.value)} placeholder="e.g. Long table near the window" />
          </ReservationField>
          <ReservationField label="Special requests">
            <textarea rows="3" value={form.special_requests} onChange={event => set('special_requests', event.target.value)} placeholder="Dietary needs, decorations, or other arrangements" />
          </ReservationField>
          <p className="form-hint">Contact number is required and must contain exactly 11 digits. Rescheduling saves immediately to the reservation records.</p>
        </form>
        <div className="modal-actions">
          <button className="outline-btn" type="button" onClick={() => setModal(false)}>Cancel</button>
          <button className="primary" type="submit" form="reservation-form" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create reservation'}</button>
        </div>
      </div>
    </div>}
  </>;
}
