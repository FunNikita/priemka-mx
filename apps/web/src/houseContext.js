export function activeMembership(me, houseId) {
  return me?.houses?.find((house) => String(house.id) === String(houseId) && house.status === 'ACTIVE') ?? null;
}

export function selectedHouseId(me, preferredId) {
  return activeMembership(me, preferredId)?.id ?? me?.houses?.find((house) => house.status === 'ACTIVE')?.id ?? null;
}

export function houseRole(me, houseId) {
  return activeMembership(me, houseId)?.role ?? null;
}
