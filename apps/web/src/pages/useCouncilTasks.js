import { useCallback, useEffect, useState } from 'react';
import { loadCouncilTasks } from './councilApi';

export function useCouncilTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setTasks(await loadCouncilTasks()); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  return { tasks, loading, error, reload };
}
