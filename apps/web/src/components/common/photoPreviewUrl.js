export function photoPreviewUrl(photo) {
  const url = typeof photo === 'string' ? photo : photo?.url;
  if (typeof url !== 'string') return url;
  const parsed = new URL(url, 'http://localhost');
  if (!/^\/photo\/[a-z0-9]+$/.test(parsed.pathname)) return url;

  const width = Number(photo?.width);
  const height = Number(photo?.height);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    const scale = Math.min(1, 200 / Math.max(width, height));
    parsed.searchParams.set('w', String(Math.max(32, Math.round(width * scale))));
    parsed.searchParams.set('h', String(Math.max(32, Math.round(height * scale))));
  } else {
    parsed.searchParams.set('w', '200');
    parsed.searchParams.set('h', '200');
  }
  parsed.searchParams.set('fit', 'contain');
  return /^https?:\/\//i.test(url) ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
