export function SegmentedControl({ items, value, onChange, label }) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === value));
  return <div className="segmented" role="radiogroup" aria-label={label} style={{ '--segment-index': activeIndex, '--segment-count': items.length }}>
    <span className="segmented__slider" aria-hidden="true" />
    {items.map((item) => <button key={item.id} className={`segmented__item${value === item.id ? ' segmented__item--active' : ''}`} role="radio" aria-checked={value === item.id} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </div>;
}
