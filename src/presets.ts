export interface CityPreset {
  name: string;
  country: string;
  lat: number;
  lng: number;
  zoom: number;
  areaKm2: number;
  population: number;
  curio: string;
}

export interface PresetPair {
  id: string;
  label: string;
  left: CityPreset;
  right: CityPreset;
}

export const CITIES: Record<string, CityPreset> = {
  tokyo: {
    name: 'Tokyo',
    country: 'Japan',
    lat: 35.6762,
    lng: 139.6503,
    zoom: 12,
    areaKm2: 2194,
    population: 13960000,
    curio: 'Rail-driven sprawl: 882 train stations carry 40M trips/day.',
  },
  paris: {
    name: 'Paris',
    country: 'France',
    lat: 48.8566,
    lng: 2.3522,
    zoom: 12,
    areaKm2: 105,
    population: 2161000,
    curio: 'Haussmann era capped most buildings at ~6 storeys, freezing the skyline.',
  },
  losangeles: {
    name: 'Los Angeles',
    country: 'USA',
    lat: 34.0522,
    lng: -118.2437,
    zoom: 11,
    areaKm2: 1302,
    population: 3899000,
    curio: 'Roughly 14% of LA County land is dedicated to parking.',
  },
  london: {
    name: 'London',
    country: 'UK',
    lat: 51.5074,
    lng: -0.1278,
    zoom: 11,
    areaKm2: 1572,
    population: 8982000,
    curio: 'The Green Belt holds urban growth: ~22% of Greater London is protected open land.',
  },
  newyork: {
    name: 'New York City',
    country: 'USA',
    lat: 40.7128,
    lng: -74.006,
    zoom: 12,
    areaKm2: 783,
    population: 8336000,
    curio: 'Manhattan is only 59 km² but holds ~1.6M residents at peak density.',
  },
  singapore: {
    name: 'Singapore',
    country: 'Singapore',
    lat: 1.3521,
    lng: 103.8198,
    zoom: 12,
    areaKm2: 734,
    population: 5454000,
    curio: 'A planned city-state — ~80% of residents live in HDB public housing.',
  },
  amsterdam: {
    name: 'Amsterdam',
    country: 'Netherlands',
    lat: 52.3676,
    lng: 4.9041,
    zoom: 13,
    areaKm2: 219,
    population: 872000,
    curio: '165 canals span 100 km; the historic ring is a UNESCO site.',
  },
  cairo: {
    name: 'Cairo',
    country: 'Egypt',
    lat: 30.0444,
    lng: 31.2357,
    zoom: 12,
    areaKm2: 3085,
    population: 9540000,
    curio: 'The greater metro hugs the Nile — most growth is within ~10 km of the river.',
  },
};

export const PRESETS: PresetPair[] = [
  { id: 'sprawl', label: 'Sprawl vs Compactness: Tokyo / Paris', left: CITIES.tokyo, right: CITIES.paris },
  { id: 'dynamic', label: 'Dynamic Sprawls: Los Angeles / London', left: CITIES.losangeles, right: CITIES.london },
  { id: 'island', label: 'Island Metros: New York / Singapore', left: CITIES.newyork, right: CITIES.singapore },
  { id: 'canals', label: 'Canals vs Desert: Amsterdam / Cairo', left: CITIES.amsterdam, right: CITIES.cairo },
];
