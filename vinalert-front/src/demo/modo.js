/**
 * Si esta pestaña esta en la parcela de ejemplo. Va en sessionStorage, no en
 * localStorage: dura lo que la pestaña, no se mezcla con otras pestañas y no
 * toca la sesion real del usuario (que sigue en localStorage, intacta).
 */
const LLAVE = 'vinalert_demo';

export const modoDemo = {
  activo() {
    try {
      return sessionStorage.getItem(LLAVE) === '1';
    } catch {
      return false;
    }
  },
  entrar() {
    try {
      sessionStorage.setItem(LLAVE, '1');
    } catch {
      // Sin almacenamiento (navegacion privada estricta): la demo no se puede abrir.
    }
  },
  salir() {
    try {
      sessionStorage.removeItem(LLAVE);
    } catch {
      // Nada que limpiar.
    }
  },
};
