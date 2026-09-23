import { Typography } from '@maxhub/max-ui';

export function ListRow({ title, description, meta, icon: Icon, tone = 'blue', onClick, trailing }) {
  const content = <>
    {Icon ? <span className={`list-row__icon list-row__icon--${tone}`}><Icon width={22} height={22} /></span> : null}
    <span className="list-row__copy">
      <Typography.Body className="list-row__title">{title}</Typography.Body>
      {description ? <Typography.Label className="list-row__description">{description}</Typography.Label> : null}
    </span>
    <span className="list-row__trailing">{trailing || meta}</span>
  </>;
  return onClick ? <button className="list-row list-row--clickable" onClick={onClick}>{content}</button> : <article className="list-row">{content}</article>;
}
