import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { Marbete } from '../ui/Estados';

/**
 * El campo, visto desde arriba.
 *
 * Dos marcadores distintos porque son dos cosas distintas: la PARCELA es el
 * cuadrado de marca —uno solo, el sitio— y cada NODO es un cuadrado numerado.
 * Poner el logo tambien en los nodos taparia el numero, que es justo el dato
 * por el que se mira un mapa de sensores.
 *
 * BROTE para el nodo que reporta, gris para el que esta caido: el mismo codigo
 * de tinta que en el resto de la aplicacion.
 */

const LOUSA = '#222a2e';
const OSO = '#efede6';
const BROTE = '#8fc93a';
const APAGADO = '#565e60';
const LINEA = '#3b4144';

const CAPAS = {
  satelite: {
    nombre: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, IGN',
    maxZoom: 20,
  },
  oscuro: {
    nombre: 'Oscuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  callejero: {
    nombre: 'Callejero',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
  },
};

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

function iconoNodo(numero, activo) {
  const tinta = activo ? BROTE : APAGADO;
  const texto = activo ? LOUSA : OSO;
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;
      background:${tinta};color:${texto};border:1px solid ${LOUSA};
      font-family:${MONO};font-weight:600;font-size:11px;line-height:1;cursor:pointer;">${numero}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

/** La marca, calada en LOUSA sobre un cuadrado OSO. La parcela, no un nodo. */
function iconoParcela() {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:${OSO};">
      <span style="display:block;width:11px;height:17px;background:${LOUSA};
        -webkit-mask:url(/marca/marca.png) center/contain no-repeat;
        mask:url(/marca/marca.png) center/contain no-repeat;"></span>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
  });
}

function fichaNodo(s) {
  const linea = (etiqueta, valor) =>
    `<tr><td style="padding:2px 12px 2px 0;color:#9d9f9c;font-size:9px;letter-spacing:.14em;text-transform:uppercase;">${etiqueta}</td>
      <td style="padding:2px 0;color:${OSO};text-align:right;">${valor}</td></tr>`;

  return `<div style="font-family:${MONO};font-size:11px;color:${OSO};min-width:180px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:6px;border-bottom:1px solid ${LINEA};">
      <span style="font-weight:600;">${s.etiqueta || `Sensor ${s.numero}`}</span>
      <span style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${s.activo ? BROTE : '#9d9f9c'};">
        ${s.activo ? 'Activo' : 'Inactivo'}
      </span>
    </div>
    <table style="width:100%;margin-top:6px;border-collapse:collapse;">
      ${linea('Nº', s.numero)}
      ${s.profundidad_cm ? linea('Profundidad', `${s.profundidad_cm} cm`) : ''}
      ${s.modelo ? linea('Modelo', s.modelo) : ''}
      ${linea('Coordenadas', `${s.latitud.toFixed(5)}, ${s.longitud.toFixed(5)}`)}
    </table>
  </div>`;
}

export default function MapaSensores({ parcela, sensores = [] }) {
  const contenedorRef = useRef(null);
  const mapaRef = useRef(null);
  const [tipoCapa, setTipoCapa] = useState('satelite');

  const conCoord = (sensores || []).filter(
    (s) =>
      typeof s.latitud === 'number' &&
      typeof s.longitud === 'number' &&
      !isNaN(s.latitud) &&
      !isNaN(s.longitud),
  );

  const parcelaTieneCoord =
    typeof parcela?.latitud === 'number' &&
    typeof parcela?.longitud === 'number' &&
    !isNaN(parcela.latitud) &&
    !isNaN(parcela.longitud);

  const hayUbicaciones = conCoord.length > 0 || parcelaTieneCoord;

  useEffect(() => {
    if (!contenedorRef.current || !hayUbicaciones) return;

    if (mapaRef.current) {
      mapaRef.current.remove();
      mapaRef.current = null;
    }

    const centro = conCoord.length
      ? [conCoord[0].latitud, conCoord[0].longitud]
      : [parcela.latitud, parcela.longitud];

    const mapa = L.map(contenedorRef.current, { center: centro, zoom: 18, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);

    const capa = CAPAS[tipoCapa] || CAPAS.satelite;
    L.tileLayer(capa.url, { attribution: capa.attribution, maxZoom: capa.maxZoom }).addTo(mapa);

    const limites = L.latLngBounds();

    if (parcelaTieneCoord) {
      L.marker([parcela.latitud, parcela.longitud], { icon: iconoParcela(), zIndexOffset: -100 })
        .addTo(mapa)
        .bindTooltip(parcela.nombre, { direction: 'top', offset: [0, -14] });
    }

    conCoord.forEach((s) => {
      L.marker([s.latitud, s.longitud], { icon: iconoNodo(s.numero, s.activo) })
        .addTo(mapa)
        .bindTooltip(`${s.etiqueta || `Sensor ${s.numero}`}`, { direction: 'top', offset: [0, -14] })
        .bindPopup(fichaNodo(s));
      limites.extend([s.latitud, s.longitud]);
    });

    if (conCoord.length === 1) {
      mapa.setView([conCoord[0].latitud, conCoord[0].longitud], 19);
    } else if (conCoord.length > 1 && limites.isValid()) {
      mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 20 });
    } else if (parcelaTieneCoord) {
      mapa.setView([parcela.latitud, parcela.longitud], 18);
    }

    mapaRef.current = mapa;
    const t = setTimeout(() => mapa.invalidateSize(), 150);

    return () => {
      clearTimeout(t);
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
    // `conCoord` y `parcelaTieneCoord` se derivan en cada render, asi que
    // incluirlas aqui volveria a montar el mapa en bucle. Las fuentes reales de
    // las dos —`sensores` y `parcela`— si estan en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensores, parcela, tipoCapa, hayUbicaciones]);

  if (!hayUbicaciones) {
    return (
      <div className="border-b border-dashed border-linea px-6 py-10 text-center">
        <p className="rotulo">Sin coordenadas</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-oso-3">
          Añade la latitud y la longitud de cada sensor en la tabla de abajo y el mapa aparece aquí.
        </p>
      </div>
    );
  }

  return (
    <section className="border-b border-linea">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-6 py-3">
        <div className="flex items-center gap-3">
          <h3 className="rotulo">Distribución en campo</h3>
          <Marbete tono={conCoord.length ? 'brote' : 'neutro'}>
            {conCoord.length} de {sensores.length} geolocalizados
          </Marbete>
        </div>

        <div className="flex border border-linea">
          {Object.entries(CAPAS).map(([clave, config]) => (
            <button
              key={clave}
              type="button"
              onClick={() => setTipoCapa(clave)}
              className={`border-r border-linea px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.16em] uppercase transition-colors last:border-r-0 ${
                tipoCapa === clave
                  ? 'bg-brote text-lousa'
                  : 'text-oso-3 hover:bg-alza hover:text-oso'
              }`}
            >
              {config.nombre}
            </button>
          ))}
        </div>
      </header>

      <div ref={contenedorRef} className="z-0 h-[320px] w-full sm:h-[400px]" />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-linea px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="rotulo flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 bg-brote" /> Nodo activo
          </span>
          <span className="rotulo flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 bg-linea-viva" /> Nodo inactivo
          </span>
          <span className="rotulo flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 bg-oso" /> Centro de la parcela
          </span>
        </div>
        <p className="text-xs text-oso-4">Pulsa un nodo para ver su ficha.</p>
      </div>
    </section>
  );
}
