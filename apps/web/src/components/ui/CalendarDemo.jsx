import { useMemo, useState } from 'react';
import { Icon20ChevronLeftOutline, Icon20ChevronRightOutline } from '@vkontakte/icons';

const MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const WEEKDAYS = ['пн','вт','ср','чт','пт','сб','вс'];

// Та же логика сетки и состояний, что в CafeteriaCalendar исходного frontend.
export function CalendarDemo({ onSelect, minDate = '2026-09-10', maxDate = '2026-10-10' }) {
  const parse = (value) => new Date(`${value}T12:00:00`);
  const min = parse(minDate); const max = parse(maxDate);
  const [month, setMonth] = useState(new Date(min.getFullYear(), min.getMonth(), 1));
  const [selected, setSelected] = useState(16);
  const cells = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month]);
  const selectDay = (day) => {
    setSelected(day);
    onSelect?.(`${String(day).padStart(2, '0')}.${String(month.getMonth() + 1).padStart(2, '0')}.${month.getFullYear()}`);
  };
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1); const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const canPrev = prev >= new Date(min.getFullYear(), min.getMonth(), 1); const canNext = next <= new Date(max.getFullYear(), max.getMonth(), 1);
  return <div className="calendar-demo"><div className="calendar-demo__head"><button type="button" aria-label="Предыдущий месяц" disabled={!canPrev} onClick={() => setMonth(prev)}><Icon20ChevronLeftOutline /></button><span>{MONTHS[month.getMonth()]} {month.getFullYear()}</span><button type="button" aria-label="Следующий месяц" disabled={!canNext} onClick={() => setMonth(next)}><Icon20ChevronRightOutline /></button></div><div className="calendar-demo__grid calendar-demo__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-demo__grid">{cells.map((day, index) => { const date = day ? new Date(month.getFullYear(), month.getMonth(), day, 12) : null; const disabled = date && (date < min || date > max); return day ? <button type="button" key={day} disabled={disabled} className={day === selected ? 'calendar-demo__day calendar-demo__day--selected' : 'calendar-demo__day'} onClick={() => selectDay(day)}>{day}</button> : <span key={`empty-${index}`} />; })}</div></div>;
}
