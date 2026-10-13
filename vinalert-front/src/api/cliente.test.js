import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import cliente, { LLAVE_TOKEN, MOTIVO_CADUCADA, configurarSalidaDeSesion, destinoSeguro } from './cliente';

describe('cliente de API', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/p/1/estado');
  });

  afterEach(() => {
    configurarSalidaDeSesion(null);
  });

  test('adjunta el token a la peticion cuando existe', () => {
    localStorage.setItem(LLAVE_TOKEN, 'un-token');
    const config = cliente.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer un-token');
  });

  test('no adjunta nada si no hay token', () => {
    const config = cliente.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  test('un 401 limpia la sesion y llama al manejador con el motivo y el destino', async () => {
    localStorage.setItem(LLAVE_TOKEN, 'caducado');
    const espia = vi.fn();
    configurarSalidaDeSesion(espia);
    const alRechazar = cliente.interceptors.response.handlers[0].rejected;

    await expect(alRechazar({ response: { status: 401 } })).rejects.toBeTruthy();

    expect(localStorage.getItem(LLAVE_TOKEN)).toBeNull();
    expect(espia).toHaveBeenCalledWith({ motivo: MOTIVO_CADUCADA, destino: '/p/1/estado' });
  });

  test('un 403 se propaga sin tocar la sesion ni llamar al manejador', async () => {
    localStorage.setItem(LLAVE_TOKEN, 'valido');
    const espia = vi.fn();
    configurarSalidaDeSesion(espia);
    const alRechazar = cliente.interceptors.response.handlers[0].rejected;

    await expect(alRechazar({ response: { status: 403 } })).rejects.toBeTruthy();

    expect(localStorage.getItem(LLAVE_TOKEN)).toBe('valido');
    expect(espia).not.toHaveBeenCalled();
  });

  test('un error de red se propaga sin tocar la sesion ni llamar al manejador', async () => {
    localStorage.setItem(LLAVE_TOKEN, 'valido');
    const espia = vi.fn();
    configurarSalidaDeSesion(espia);
    const alRechazar = cliente.interceptors.response.handlers[0].rejected;

    await expect(alRechazar({ request: {} })).rejects.toBeTruthy();

    expect(localStorage.getItem(LLAVE_TOKEN)).toBe('valido');
    expect(espia).not.toHaveBeenCalled();
  });

  // Un 401 de las rutas de acceso (contraseña incorrecta, enlace caducado) no
  // es una sesion caducada: lo explica la propia pantalla.
  test.each(['/auth/token', '/auth/recuperar', '/auth/restablecer', '/auth/invitacion', '/auth/invitacion/aceptar'])(
    'un 401 de %s no se trata como sesion caducada',
    async (url) => {
      localStorage.setItem(LLAVE_TOKEN, 'valido');
      const espia = vi.fn();
      configurarSalidaDeSesion(espia);
      const alRechazar = cliente.interceptors.response.handlers[0].rejected;

      await expect(alRechazar({ response: { status: 401 }, config: { url } })).rejects.toBeTruthy();

      expect(localStorage.getItem(LLAVE_TOKEN)).toBe('valido');
      expect(espia).not.toHaveBeenCalled();
    },
  );

  test('sin sesion guardada, un 401 no dice que la sesion ha caducado', async () => {
    const espia = vi.fn();
    configurarSalidaDeSesion(espia);
    const alRechazar = cliente.interceptors.response.handlers[0].rejected;

    await expect(alRechazar({ response: { status: 401 }, config: { url: '/parcelas/' } })).rejects.toBeTruthy();

    expect(espia).not.toHaveBeenCalled();
  });
});

// Quien abre el enlace de "restablecer" casi siempre tiene un token viejo en
// el navegador: /auth/me da 401, y mandarle a "tu sesion ha caducado" le
// sacaria de la pantalla que necesita.
describe('un 401 estando en una pantalla de acceso', () => {
  afterEach(() => {
    configurarSalidaDeSesion(null);
  });

  test.each(['/restablecer?token=abc', '/invitacion?token=abc', '/recuperar', '/login'])(
    'en %s limpia el token pero no redirige',
    async (ruta) => {
      window.history.replaceState({}, '', ruta);
      localStorage.setItem(LLAVE_TOKEN, 'caducado');
      const espia = vi.fn();
      configurarSalidaDeSesion(espia);
      const alRechazar = cliente.interceptors.response.handlers[0].rejected;

      await expect(alRechazar({ response: { status: 401 }, config: { url: '/auth/me' } })).rejects.toBeTruthy();

      expect(localStorage.getItem(LLAVE_TOKEN)).toBeNull();
      expect(espia).not.toHaveBeenCalled();
    },
  );
});

describe('destinoSeguro', () => {
  test.each([
    ['/p/1/estado', '/p/1/estado'],
    ['/parcelas?x=1', '/parcelas?x=1'],
    ['/login', '/'],
    ['/login?motivo=sesion_caducada', '/'],
    ['//evil.com', '/'],
    ['https://evil.com', '/'],
    ['/\\evil.com', '/'],
    [null, '/'],
    ['', '/'],
  ])('%s -> %s', (entrada, salida) => {
    expect(destinoSeguro(entrada)).toBe(salida);
  });
});
