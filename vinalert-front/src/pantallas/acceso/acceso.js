/** Lo que comparten las pantallas de acceso y que no es un componente. */

export const AYUDA_PASSWORD = 'Mínimo 10 caracteres. Mejor una frase que una palabra.';

/** El 400 que da el backend para cualquier enlace caducado, usado o inventado. */
export function esEnlaceInvalido(error) {
  return error?.response?.status === 400 && error.response.data?.detail?.codigo === 'enlace_invalido';
}
