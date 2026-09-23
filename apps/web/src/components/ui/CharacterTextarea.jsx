import { Textarea } from '@maxhub/max-ui';

export function CharacterTextarea({ value, onChange, maxLength = 500, placeholder = 'Введите текст' }) {
  return <div className="character-textarea"><Textarea value={value} rows={4} maxLength={maxLength} placeholder={placeholder} onChange={(next) => onChange(typeof next === 'string' ? next : next.target?.value ?? '')} /><span>{value.length} / {maxLength}</span></div>;
}
