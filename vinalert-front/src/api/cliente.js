import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

export const LLAVE_TOKEN = 'access_token';
export const MOTIVO_CADUCADA = 'sesion_caducada';

export const sesion = {
  leerToken: () => localStorage.getItem(LLAVE_TOKEN),
  guardarToken: (token) => localStorage.setItem(LLAVE_TOKEN, token),
  limpiar: () => localStorage.removeItem(LLAVE_TOKEN),
};

let alPerderSesion = null;

/**
 * Quien decide que pasa al caducar la sesion. La Task 7 lo conecta a la
 * navegacion de react-router, para que volver al login sea una transicion y no
 * un recargado de pagina.
 */
export function configurarSalidaDeSesion(fn) {
  alPerderSesion = fn;
}

const cliente = axios.create({ baseURL: API_BASE });

cliente.interceptors.request.use((config) => {
  const token = sesion.leerToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// El 401 es el UNICO error que toda la aplicacion trata igual. Sin esto, al
// caducar el token la app deja navegar y todas las peticiones fallan a la vez,
// dejando pantallas vacias sin explicacion.
cliente.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    if (error.response?.status === 401) {
      sesion.limpiar();
      const destino = window.location.pathname + window.location.search;
      if (alPerderSesion) {
        alPerderSesion({ motivo: MOTIVO_CADUCADA, destino });
      } else {
        // Reserva para codigo que corre fuera de React (sin manejador
        // configurado): un recargado de pagina sigue siendo mejor que nada.
        window.location.assign(
          `/login?motivo=${MOTIVO_CADUCADA}&destino=${encodeURIComponent(destino)}`,
        );
      }
    }
    return Promise.reject(error);
  },
);

export default cliente;
