import { useEffect, useState } from 'react';

export function useSystemColorScheme() {
  const getScheme = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const [scheme, setScheme] = useState(getScheme);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const updateScheme = () => setScheme(query.matches ? 'dark' : 'light');
    updateScheme();
    query.addEventListener('change', updateScheme);
    return () => query.removeEventListener('change', updateScheme);
  }, []);

  return scheme;
}
