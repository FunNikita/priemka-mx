export function groupHouses(houses) {
  return [
    ['Ваши дома', houses.filter((house) => house.access.status === 'ACTIVE')],
    ['Ваши заявки', houses.filter((house) => house.access.status === 'PENDING')],
    ['Другие дома', houses.filter((house) => !['ACTIVE', 'PENDING'].includes(house.access.status))],
  ].filter(([, items]) => items.length);
}
