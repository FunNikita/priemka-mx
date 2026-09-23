import { Icon20DocumentOutline, Icon24Attach, Icon24Dismiss } from '@vkontakte/icons';
import { Button, Typography } from '@maxhub/max-ui';
import { useRef, useState } from 'react';

export function AttachmentButton({ disabled = false, accept }) {
  const [file, setFile] = useState(null);
  const ref = useRef(null);
  return <div className="attachment"><input ref={ref} className="attachment__input" type="file" accept={accept} disabled={disabled} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button mode="secondary" appearance="neutral" stretched disabled={disabled} iconBefore={<Icon24Attach width={24} height={24} />} onClick={() => ref.current?.click()}>Добавить вложение</Button>{file ? <div className="attachment__file"><span className="attachment__file-icon"><Icon20DocumentOutline width={24} height={24} /></span><span><Typography.Body>{file.name}</Typography.Body><Typography.Label>{file.name.split('.').pop()?.toUpperCase() ?? 'ФАЙЛ'}</Typography.Label></span><button type="button" aria-label="Удалить файл" onClick={() => setFile(null)}><Icon24Dismiss /></button></div> : null}</div>;
}
