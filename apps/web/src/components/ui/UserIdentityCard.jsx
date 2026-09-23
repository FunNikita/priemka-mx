import { Avatar, IconButton, Typography } from '@maxhub/max-ui';
import { Icon16CopyOutline, Icon16Done } from '@vkontakte/icons';
import { useState } from 'react';

export function UserIdentityCard({ name = 'Человек Человеков', id = '214748', photoUrl }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard?.writeText(id); } finally { setCopied(true); setTimeout(() => setCopied(false), 1000); } };
  return <article className="identity-card"><Avatar.Container size={64}><Avatar.Image src={photoUrl} alt={name} fallback="ЧЧ" /></Avatar.Container><div><Typography.Headline variant="medium-strong">{name}</Typography.Headline><div className="identity-card__id"><Typography.Body>ID: {id}</Typography.Body><IconButton aria-label="Скопировать ID" mode="link" appearance="neutral" onClick={copy}>{copied ? <Icon16Done /> : <Icon16CopyOutline />}</IconButton></div></div></article>;
}
