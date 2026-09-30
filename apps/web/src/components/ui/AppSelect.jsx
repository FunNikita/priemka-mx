import { useEffect, useRef, useState } from 'react';
import { Icon20Check, Icon24ChevronDown } from '@vkontakte/icons';

// Переиспользуемый select: отдельная стрелка и меню, а не нативная отрисовка браузера.
export function AppSelect({ value, options, placeholder = 'Выберите вариант', onChange, ariaLabel = placeholder, disabled = false }) {
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return <div className={`app-select${isOpen ? ' app-select--open' : ''}`} ref={rootRef}>
    <button type="button" className="app-select__trigger" aria-label={ariaLabel} aria-expanded={isOpen} disabled={disabled} onClick={() => setOpen((open) => !open)}>
      <span className={selected ? '' : 'app-select__placeholder'}>{selected?.label ?? placeholder}</span><Icon24ChevronDown className="app-select__chevron" width={20} height={20} />
    </button>
    {isOpen ? <div className="app-select__menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'app-select__option app-select__option--selected' : 'app-select__option'} onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span>{option.value === value ? <span className="app-select__selected-mark" aria-hidden="true"><Icon20Check /></span> : null}</button>)}</div> : null}
  </div>;
}
