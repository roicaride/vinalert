/**
 * Las capas del mapa de sensores. Solo IGN: el PNOA y el mapa base son
 * oficiales, cubren toda España y su licencia (CC BY 4.0) permite el uso
 * comercial citando la fuente. Esri, CARTO y los servidores de OpenStreetMap
 * no lo permiten sin contrato o pueden cortar el acceso sin aviso.
 *
 * El PNOA tiene resolucion nativa hasta el zoom 19; mas cerca, Leaflet escala
 * esa tesela en vez de pedir una que no existe.
 */
const WMTS = (servicio, capa, formato) =>
  `https://www.ign.es/wmts/${servicio}?request=GetTile&service=WMTS&VERSION=1.0.0` +
  `&Layer=${capa}&Style=default&Format=${formato}&TileMatrixSet=GoogleMapsCompatible` +
  '&TileMatrix={z}&TileRow={y}&TileCol={x}';

const CITA = '<a href="https://www.ign.es">Instituto Geográfico Nacional</a>, CC BY 4.0';

export const CAPAS = {
  satelite: {
    nombre: 'Satélite',
    url: WMTS('pnoa-ma', 'OI.OrthoimageCoverage', 'image/jpeg'),
    attribution: `PNOA cedido por © ${CITA}`,
    maxNativeZoom: 19,
    maxZoom: 21,
  },
  mapa: {
    nombre: 'Mapa',
    url: WMTS('ign-base', 'IGNBaseTodo', 'image/png'),
    attribution: `Mapa base © ${CITA}`,
    maxNativeZoom: 19,
    maxZoom: 21,
  },
};
