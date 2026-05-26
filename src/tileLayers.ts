import L from 'leaflet';

export type MapStyle = 'roadmap' | 'satellite' | 'terrain';

export const STYLE_LABELS: Record<MapStyle, string> = {
  roadmap: 'Roadmap',
  satellite: 'Satellite',
  terrain: 'Terrain',
};

export function createTileLayer(style: MapStyle): L.TileLayer {
  switch (style) {
    case 'satellite':
      return L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          attribution: 'Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics',
        }
      );
    case 'terrain':
      return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution:
          'Map data: © OpenStreetMap contributors, SRTM | Tiles: © OpenTopoMap (CC-BY-SA)',
      });
    case 'roadmap':
    default:
      return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      });
  }
}
