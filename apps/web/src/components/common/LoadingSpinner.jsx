// Spinner pattern from university-demos/psuti.
export function LoadingSpinner() {
  return <div className="panel-state panel-state--spinner" role="status" aria-label="Загрузка"><svg className="panel-state__spinner" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none"><path fill="currentColor" d="M16.394 5.077A8.2 8.2 0 0 0 4.58 15.49a.9.9 0 0 1-1.628.767A10 10 0 1 1 12 22a.9.9 0 0 1 0-1.8 8.2 8.2 0 0 0 4.394-15.123" /></svg></div>;
}
