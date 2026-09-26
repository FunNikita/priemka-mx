import { CalendarDemo } from '../ui/CalendarDemo';

// Окно календаря повторяет отдельный cafeteria-modal из прежнего frontend:
// это не общий диалог с заголовком и футером.
export function CafeteriaCalendar({ onClose, onSelect, minDate, maxDate }) {
  return <div className="cafeteria-calendar-overlay" role="presentation" onMouseDown={onClose}>
    <section className="cafeteria-calendar-shell" role="dialog" aria-label="Выбор даты" onMouseDown={(event) => event.stopPropagation()}>
      <CalendarDemo minDate={minDate} maxDate={maxDate} onSelect={onSelect} />
    </section>
  </div>;
}
