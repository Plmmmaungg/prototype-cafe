import React, { useEffect, useState } from 'react';
import {
  CalendarDays, Clock3, ImagePlus, Pencil, Plus, RefreshCw, Tag, Trash2, X
} from 'lucide-react';
import api from './api';
import {
  fileToDataUrl, formatDateTime, promoAppliesTo, promoDiscountLabel, promoStatus, toDateTimeInput
} from './posUtils';

function PromoField({ label, required, children }) {
  return <div className="field"><span>{label}{required ? ' *' : ''}</span>{children}</div>;
}

const newForm = () => ({
  name: '',
  description: '',
  discount_type: 'Percent',
  discount_value: '',
  product_id: '',
  image_url: '',
  starts_at: toDateTimeInput(),
  expires_at: toDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
  is_active: true
});

export default function PromosPage() {
  const [promos, setPromos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(newForm);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [promoResponse, productResponse] = await Promise.all([api.get('/promos'), api.get('/products')]);
      setPromos(promoResponse.data);
      setProducts(productResponse.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load promos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const openNew = () => { setEditing(null); setForm(newForm()); setError(''); setModal(true); };
  const openEdit = promo => {
    setEditing(promo);
    setError('');
    setForm({
      name: promo.name || '',
      description: promo.description || '',
      discount_type: promo.discount_type || 'Percent',
      discount_value: promo.discount_value ?? '',
      product_id: promo.product_id ? String(promo.product_id) : '',
      image_url: promo.image_url || '',
      starts_at: toDateTimeInput(promo.starts_at),
      expires_at: toDateTimeInput(promo.expires_at),
      is_active: Number(promo.is_active) === 1
    });
    setModal(true);
  };

  const pickImage = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      set('image_url', dataUrl);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value),
        product_id: form.product_id || null,
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
        is_active: form.is_active ? 1 : 0
      };
      if (editing) await api.put(`/promos/${editing.id}`, payload);
      else await api.post('/promos', payload);
      setModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this promo.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async promo => {
    if (!window.confirm(`Delete the promo "${promo.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/promos/${promo.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete this promo.');
    }
  };

  const counts = promos.reduce((result, promo) => {
    const status = promoStatus(promo);
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">MARKETING & SALES</span>
        <h1>Promos</h1>
        <p>Create time-limited offers for the POS and remove them when they end.</p>
      </div>
      <div className="heading-actions">
        <button className="outline-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
        <button className="primary" onClick={openNew}><Plus size={17} /> Add promo</button>
      </div>
    </div>

    {error && !modal && <div className="error-box">{error}</div>}

    <div className="promo-stat-row">
      {['Active', 'Scheduled', 'Expired', 'Inactive'].map(status => <div className={`promo-stat ${status.toLowerCase()}`} key={status}>
        <span>{status}</span><b>{counts[status] || 0}</b>
      </div>)}
    </div>

    {loading ? <div className="loading-state">Loading promos...</div> : promos.length === 0
      ? <section className="panel empty-state"><Tag size={28} /><b>No promos yet</b><span>Create a promo to show it on the cashier POS.</span></section>
      : <div className="promo-admin-grid">
        {promos.map(promo => {
          const status = promoStatus(promo);
          return <article className="promo-admin-card" key={promo.id}>
            <div className="promo-admin-media">
              {promo.image_url ? <img src={promo.image_url} alt={promo.name} /> : <Tag size={32} />}
              <span className={`status ${status.toLowerCase()}`}>{status}</span>
            </div>
            <div className="promo-admin-body">
              <div className="promo-admin-top">
                <span className="promo-admin-discount">{promoDiscountLabel(promo)}</span>
                <small>Applies to {promoAppliesTo(promo)}</small>
              </div>
              <h3>{promo.name}</h3>
              <p>{promo.description || 'No description provided.'}</p>
              <div className="promo-meta">
                <span><CalendarDays size={13} /> Starts {formatDateTime(promo.starts_at)}</span>
                <span><Clock3 size={13} /> Ends {formatDateTime(promo.expires_at)}</span>
              </div>
              <div className="promo-admin-actions">
                <button className="mini-btn" onClick={() => openEdit(promo)}><Pencil size={12} /> Edit</button>
                <button className="mini-btn danger" onClick={() => remove(promo)}><Trash2 size={12} /> Delete</button>
              </div>
            </div>
          </article>;
        })}
      </div>}

    {modal && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setModal(false)}>
      <div className="modal promo-modal">
        <div className="modal-head">
          <div><span className="eyebrow">{editing ? 'EDIT PROMO' : 'NEW PROMO'}</span><h2>{editing ? 'Update promo' : 'Create a promo'}</h2></div>
          <button className="icon-btn" onClick={() => setModal(false)}><X /></button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <form id="promo-form" className="modal-form" onSubmit={submit}>
          <PromoField label="Promo name" required><input value={form.name} onChange={event => set('name', event.target.value)} required placeholder="e.g. Happy Hour" /></PromoField>
          <PromoField label="Description"><textarea rows="2" value={form.description} onChange={event => set('description', event.target.value)} placeholder="Short description shown on the POS" /></PromoField>
          <div className="form-two">
            <PromoField label="Discount type"><select value={form.discount_type} onChange={event => set('discount_type', event.target.value)}><option value="Percent">Percent (%)</option><option value="Fixed">Fixed amount (₱)</option></select></PromoField>
            <PromoField label="Discount value" required><input type="number" min="0.01" step="0.01" value={form.discount_value} onChange={event => set('discount_value', event.target.value)} required placeholder={form.discount_type === 'Percent' ? '10' : '25'} /></PromoField>
          </div>
          <PromoField label="Applies to"><select value={form.product_id} onChange={event => set('product_id', event.target.value)}><option value="">All products</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></PromoField>
          <div className="form-two">
            <PromoField label="Starts at"><input type="datetime-local" value={form.starts_at} onChange={event => set('starts_at', event.target.value)} /></PromoField>
            <PromoField label="Expires at" required><input type="datetime-local" value={form.expires_at} onChange={event => set('expires_at', event.target.value)} required /></PromoField>
          </div>
          <PromoField label="Promo image">
            <div className="image-upload">
              <div className="image-preview">{form.image_url ? <img src={form.image_url} alt="Promo preview" /> : <ImagePlus size={24} />}</div>
              <div className="image-upload-actions">
                <label className="outline-btn image-pick"><ImagePlus size={15} /> Choose image<input type="file" accept="image/*" onChange={pickImage} hidden /></label>
                {form.image_url && <button type="button" className="mini-btn subtle" onClick={() => set('image_url', '')}>Remove image</button>}
                <small>JPG, PNG or WebP. Images are resized before saving.</small>
              </div>
            </div>
          </PromoField>
          <label className="check-row"><input type="checkbox" checked={form.is_active} onChange={event => set('is_active', event.target.checked)} /><span>Active and visible on the POS (until the expiry time)</span></label>
          <p className="form-hint">The promo stops appearing on the POS automatically after its expiry date and time. Use Delete to remove it permanently.</p>
        </form>
        <div className="modal-actions">
          <button className="outline-btn" type="button" onClick={() => setModal(false)}>Cancel</button>
          <button className="primary" type="submit" form="promo-form" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create promo'}</button>
        </div>
      </div>
    </div>}
  </>;
}
