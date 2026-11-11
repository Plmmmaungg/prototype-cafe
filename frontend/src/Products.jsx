import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive, Coffee, ImagePlus, Pencil, Plus, RefreshCw, Search, UtensilsCrossed, X
} from 'lucide-react';
import api from './api';
import { formatDateTime, peso, fileToDataUrl } from './posUtils';

function ProductField({ label, required, children }) {
  return <div className="field"><span>{label}{required ? ' *' : ''}</span>{children}</div>;
}

const newForm = () => ({
  name: '',
  category: 'Coffee',
  description: '',
  price: '',
  image_url: '',
  available: true
});

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(newForm);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/products');
      setProducts(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map(product => product.category)))], [products]);
  const filtered = useMemo(() => products.filter(product => {
    const matchesCategory = category === 'All' || product.category === category;
    const matchesQuery = `${product.name} ${product.category} ${product.description || ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }), [products, category, query]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const openNew = () => { setEditing(null); setForm(newForm()); setError(''); setModal(true); };
  const openEdit = product => {
    setEditing(product);
    setError('');
    setForm({
      name: product.name || '',
      category: product.category || 'Coffee',
      description: product.description || '',
      price: product.price ?? '',
      image_url: product.image_url || '',
      available: Number(product.available) === 1
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
      const payload = { ...form, price: Number(form.price), available: form.available ? 1 : 0 };
      if (editing) await api.put(`/products/${editing.id}`, payload);
      else await api.post('/products', payload);
      setModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this product.');
    } finally {
      setBusy(false);
    }
  };

  const archive = async product => {
    if (!window.confirm(`Archive "${product.name}"? It will no longer appear on the POS.`)) return;
    try {
      await api.delete(`/products/${product.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not archive this product.');
    }
  };

  const restore = async product => {
    try {
      await api.put(`/products/${product.id}`, { ...product, available: 1 });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not restore this product.');
    }
  };

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">MENU MANAGEMENT</span>
        <h1>Menu & Products</h1>
        <p>Manage the products, prices and photos shown on the cashier POS.</p>
      </div>
      <div className="heading-actions">
        <button className="outline-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
        <button className="primary" onClick={openNew}><Plus size={17} /> Add product</button>
      </div>
    </div>

    {error && !modal && <div className="error-box">{error}</div>}

    <section className="panel table-panel product-panel">
      <div className="table-toolbar">
        <div><h3>Product catalog</h3><p>{filtered.length} product{filtered.length === 1 ? '' : 's'} found</p></div>
        <div className="product-toolbar-right">
          <select className="inline-select" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
          <div className="table-search"><Search size={16} /><input placeholder="Search products..." value={query} onChange={event => setQuery(event.target.value)} /></div>
        </div>
      </div>
      {loading ? <div className="loading-state">Loading products...</div> : filtered.length === 0
        ? <div className="empty-state"><UtensilsCrossed size={28} /><b>No products found</b><span>Add a product to start building the menu.</span></div>
        : <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Availability</th><th>Added</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(product => <tr key={product.id}>
                <td><div className="product-cell">
                  <div className="product-thumb">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <Coffee size={18} />}</div>
                  <div><b>{product.name}</b><small>{product.description || 'No description'}</small></div>
                </div></td>
                <td>{product.category}</td>
                <td>{peso(product.price)}</td>
                <td><span className={`status ${Number(product.available) === 1 ? 'available' : 'archived'}`}>{Number(product.available) === 1 ? 'Available' : 'Archived'}</span></td>
                <td>{formatDateTime(product.created_at)}</td>
                <td><div className="row-actions">
                  <button className="mini-btn" onClick={() => openEdit(product)}><Pencil size={12} /> Edit</button>
                  {Number(product.available) === 1
                    ? <button className="mini-btn danger" onClick={() => archive(product)}><Archive size={12} /> Archive</button>
                    : <button className="mini-btn" onClick={() => restore(product)}>Restore</button>}
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </section>

    {modal && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setModal(false)}>
      <div className="modal product-modal">
        <div className="modal-head">
          <div><span className="eyebrow">{editing ? 'EDIT PRODUCT' : 'NEW PRODUCT'}</span><h2>{editing ? 'Update product' : 'Add a product'}</h2></div>
          <button className="icon-btn" onClick={() => setModal(false)}><X /></button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <form id="product-form" className="modal-form" onSubmit={submit}>
          <ProductField label="Product name" required><input value={form.name} onChange={event => set('name', event.target.value)} required placeholder="e.g. Cafe Latte" /></ProductField>
          <div className="form-two">
            <ProductField label="Category"><select value={form.category} onChange={event => set('category', event.target.value)}>{['Coffee', 'Non-Coffee', 'Main Course', 'Desserts', 'Pastries', 'Beverages'].map(item => <option key={item}>{item}</option>)}</select></ProductField>
            <ProductField label="Price (₱)" required><input type="number" min="0" step="0.01" value={form.price} onChange={event => set('price', event.target.value)} required /></ProductField>
          </div>
          <ProductField label="Description"><textarea rows="3" value={form.description} onChange={event => set('description', event.target.value)} placeholder="Short description shown on the POS" /></ProductField>
          <ProductField label="Product image">
            <div className="image-upload">
              <div className="image-preview">{form.image_url ? <img src={form.image_url} alt="Product preview" /> : <ImagePlus size={24} />}</div>
              <div className="image-upload-actions">
                <label className="outline-btn image-pick"><ImagePlus size={15} /> Choose image<input type="file" accept="image/*" onChange={pickImage} hidden /></label>
                {form.image_url && <button type="button" className="mini-btn subtle" onClick={() => set('image_url', '')}>Remove image</button>}
                <small>JPG, PNG or WebP. Images are resized before saving.</small>
              </div>
            </div>
          </ProductField>
          <label className="check-row"><input type="checkbox" checked={form.available} onChange={event => set('available', event.target.checked)} /><span>Available on the POS</span></label>
        </form>
        <div className="modal-actions">
          <button className="outline-btn" type="button" onClick={() => setModal(false)}>Cancel</button>
          <button className="primary" type="submit" form="product-form" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Add product'}</button>
        </div>
      </div>
    </div>}
  </>;
}
