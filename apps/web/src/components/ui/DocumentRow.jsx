import { Icon20DocumentOutline } from '@vkontakte/icons';
import { useState } from 'react';
import { callMaxBridge } from '../../utils/maxFeedback';
import './DocumentRow.css';

export function DocumentRow({ document, action }) {
  const title = document.fileName ?? document.title ?? 'Документ';
  const fileName = document.fileName ?? `${document.title ?? 'Документ'}.pdf`;
  const [error, setError] = useState('');
  const download = (event) => {
    const bridge = window.WebApp;
    if (!bridge?.initData || typeof bridge.downloadFile !== 'function') return;
    event.preventDefault();
    setError('');
    try {
      const url = new URL(document.fileUrl, window.location.href);
      if (url.protocol !== 'https:') throw new Error('Для скачивания в MAX нужна HTTPS-ссылка.');
      callMaxBridge('downloadFile', () => bridge.downloadFile(url.href, fileName), true, () => setError('Не удалось скачать документ. Повторите попытку.'));
    } catch (failure) {
      setError(failure.message || 'Не удалось скачать документ. Повторите попытку.');
    }
  };
  return <div className="document-row"><a className="document-row__link" href={document.fileUrl} target="_blank" rel="noreferrer" aria-label={`Открыть документ ${title}`}><span className="document-row__format"><Icon20DocumentOutline width={22} height={22} /></span><span className="document-row__name"><span>{title}</span></span></a><a className="document-row__download" href={document.fileUrl} download={fileName} onClick={download} aria-label={`Скачать документ ${title}`} title="Скачать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></a>{action ? <span className="document-row__action">{action}</span> : null}{error ? <span className="document-row__error" role="alert">{error}</span> : null}</div>;
}
