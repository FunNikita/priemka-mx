import { PanelBack } from '../components/layout/PanelBack';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';
import { useCallback, useEffect, useState } from 'react';
import { Panel, Typography } from '@maxhub/max-ui';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/LegacyButton';
import { SearchInput } from '../components/ui/SearchInput';
import { jsonRequest, queryPath, request } from './residentApi';

export function PreviewAccessPage({ onBack }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [maxUserId, setMaxUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async (signal) => {
    setLoading(true);
    try { const result = await request(queryPath('/api/admin/preview-access', { q: query.trim(), page, limit: 20 }), { signal }); if (!signal?.aborted) { setData(result); setError(''); } }
    catch (failure) { if (!signal?.aborted) setError(failure.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [query, page]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void reload(controller.signal), 250); return () => { clearTimeout(timer); controller.abort(); }; }, [reload]);
  const change = async (id, enabled) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await request(`/api/admin/preview-access/${encodeURIComponent(id)}`, jsonRequest('PUT', { enabled })); hapticSuccess(); setMaxUserId(''); await reload(); }
    catch (failure) { hapticError(); setError(failure.message); }
    finally { setBusy(false); }
  };
  return <Panel mode="primary" className="admin-panel"><PanelBack onBack={onBack} /><main className="panel-content admin-content"><div className="admin-layout"><SearchInput placeholder="Поиск MAX ID" value={query} onChange={(event) => { setQuery(typeof event === 'string' ? event : event.target.value); setPage(1); }} /><div className="admin-form"><label className="admin-form__field">Добавить MAX ID<input value={maxUserId} onChange={(event) => setMaxUserId(event.target.value)} placeholder="MAX ID" /></label><Button disabled={busy || !/^\d+$/.test(maxUserId.trim())} onClick={() => void change(maxUserId.trim(), true)}>Разрешить доступ</Button></div>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : data.items.length ? data.items.map((item) => <article key={item.maxUserId} className="admin-user-card"><Typography.Body>MAX ID: {item.maxUserId}</Typography.Body><Typography.Label>{item.enabled ? 'Доступ разрешён' : 'Доступ закрыт'}</Typography.Label><Button disabled={busy} mode="secondary" onClick={() => void change(item.maxUserId, !item.enabled)}>{item.enabled ? 'Отключить' : 'Разрешить'}</Button></article>) : <EmptyState message="Записей нет." />}{data.total > 20 ? <div className="admin-pagination"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</Button><Typography.Label>{page} / {Math.ceil(data.total / 20)}</Typography.Label><Button disabled={page * 20 >= data.total} onClick={() => setPage((value) => value + 1)}>Далее</Button></div> : null}</div></main></Panel>;
}
