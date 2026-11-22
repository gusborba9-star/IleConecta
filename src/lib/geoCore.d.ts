export type MunicipioRow = [string, string, number, number];
export interface Place { city: string; state: string }
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number;
export const MAX_KM: number;
export function nearestPlace(lat: number, lon: number, table: MunicipioRow[]): (Place & { km: number }) | null;
export const TTL_DAYS: number;
export function readPlaceNow(raw: unknown, now?: number): (Place & { at: number }) | null;
