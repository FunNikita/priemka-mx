-- Перед переходом на уникальность (documentVersionId, roleSnapshot) результат должен содержать 0 строк.
SELECT
  documentVersionId,
  roleSnapshot,
  COUNT(*) AS cnt
FROM DocumentConfirmation
GROUP BY documentVersionId, roleSnapshot
HAVING COUNT(*) > 1;
