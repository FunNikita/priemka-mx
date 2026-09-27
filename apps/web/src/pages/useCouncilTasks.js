import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCouncilTasks } from './councilApi';

export function useCouncilTasks(houseId) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    try { const result = houseId ? await loadCouncilTasks(houseId) : []; if (id === requestId.current) setTasks(result); }
    catch (failure) { if (id === requestId.current) setError(failure.message); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [houseId]);
  useEffect(() => { void Promise.resolve().then(reload); return () => { requestId.current += 1; }; }, [reload]);
  return { tasks, loading, error, reload };
}
