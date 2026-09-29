export function sortHistoryNewestFirst(items) {
  return [...items].sort((first, second) => {
    const firstTime = Date.parse(first.createdAt);
    const secondTime = Date.parse(second.createdAt);
    return (Number.isNaN(secondTime) ? 0 : secondTime) - (Number.isNaN(firstTime) ? 0 : firstTime);
  });
}
