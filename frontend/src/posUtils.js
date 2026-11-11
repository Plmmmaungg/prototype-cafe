export const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const parseDate = value => {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = value => {
  const date = parseDate(value);
  return date ? date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
};

export const toDateTimeInput = value => {
  const date = value === undefined ? new Date() : parseDate(value);
  if (!date) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const promoStatus = promo => {
  if (!promo) return '';
  if (!promo.is_active || Number(promo.is_active) === 0) return 'Inactive';
  const now = Date.now();
  const start = parseDate(promo.starts_at);
  const end = parseDate(promo.expires_at);
  if (start && start.getTime() > now) return 'Scheduled';
  if (end && end.getTime() < now) return 'Expired';
  return 'Active';
};

export const promoDiscountLabel = promo => {
  if (!promo) return '';
  return promo.discount_type === 'Percent'
    ? `${Number(promo.discount_value)}% off`
    : `${peso(promo.discount_value)} off`;
};

export const promoAppliesTo = promo => promo?.product_name ? promo.product_name : 'All products';

export const fileToDataUrl = (file, maxDimension = 900) => new Promise((resolve, reject) => {
  if (!file) return resolve(null);
  if (!file.type?.startsWith('image/')) return reject(new Error('Please choose an image file.'));
  if (file.size > 8 * 1024 * 1024) return reject(new Error('Image must be smaller than 8 MB.'));

  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the image.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not load the image.'));
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});
