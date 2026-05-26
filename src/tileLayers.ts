import L from 'leaflet';

export type MapStyle = 'roadmap' | 'satellite';

export const STYLE_LABELS: Record<MapStyle, string> = {
  roadmap: 'Roadmap',
  satellite: 'Satellite',
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
    case 'roadmap':
    default:
      // CartoDB Voyager: minimal-borders basemap with stronger road/feature contrast.
      return L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 20,
          subdomains: 'abcd',
          attribution:
            '© OpenStreetMap contributors © <a href="https://carto.com/attributions">CARTO</a>',
        }
      );
  }
}
