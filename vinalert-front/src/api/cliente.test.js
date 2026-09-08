import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import cliente, { LLAVE_TOKEN, MOTIVO_CADUCADA, configurarSalidaDeSesion } from './cliente';

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
});
