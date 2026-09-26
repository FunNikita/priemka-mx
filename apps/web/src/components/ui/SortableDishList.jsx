import { Icon24DeleteOutline, Icon24PenOutline } from '@vkontakte/icons';
import { Switch, Typography } from '@maxhub/max-ui';
import { useState } from 'react';

export function SortableDishList() {
  const [items, setItems] = useState([{ id: 1, name: 'Паста с овощами', price: '190 ₽', stop: false }, { id: 2, name: 'Суп дня', price: '130 ₽', stop: true }]);
  const [dragId, setDragId] = useState(null);
  const move = (target) => { if (!dragId || dragId === target) return; const next = [...items]; const from = next.findIndex((item) => item.id === dragId); const to = next.findIndex((item) => item.id === target); next.splice(to, 0, next.splice(from, 1)[0]); setItems(next); setDragId(null); };
  const toggle = (id) => setItems(items.map((item) => item.id === id ? { ...item, stop: !item.stop } : item));
  return <div className="sortable-list">{items.map((item) => <article key={item.id} className="sortable-card" draggable onDragStart={() => setDragId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => move(item.id)}><span className="drag-handle" aria-label="Перетащить">⠿</span><span className="dish-placeholder">П</span><div className="sortable-card__copy"><Typography.Body>{item.name}</Typography.Body><Typography.Body>{item.price}</Typography.Body></div><label className="sortable-card__switch">Стоп-лист <Switch checked={item.stop} onChange={() => toggle(item.id)} /></label><button className="sortable-card__edit" type="button" aria-label="Редактировать"><Icon24PenOutline /></button><button className="sortable-card__delete" type="button" aria-label="Удалить" onClick={() => setItems(items.filter((entry) => entry.id !== item.id))}><Icon24DeleteOutline /></button></article>)}</div>;
}
