import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import MensajeError from './MensajeError';

function errorHttp(status, detail) {
  return { response: { status, data: detail === undefined ? {} : { detail } } };
}

test('403 explica que es un problema de permiso', () => {
  render(<MensajeError error={errorHttp(403)} />);
  expect(screen.getByText(/permiso/i)).toBeInTheDocument();
});

test('409 muestra el mensaje que manda la API', () => {
  // Los 409 del backend traen textos escritos para el usuario.
  render(<MensajeError error={errorHttp(409, 'No puedes dejar la parcela sin ningun gestor.')} />);
  expect(screen.getByText('No puedes dejar la parcela sin ningun gestor.')).toBeInTheDocument();
});

test('404 usa el texto que le da la pantalla', () => {
  render(<MensajeError error={errorHttp(404)} textoNoEncontrado="Ese sensor ya no existe." />);
  expect(screen.getByText('Ese sensor ya no existe.')).toBeInTheDocument();
});

test('404 con detail del backend muestra ese detail cuando la pantalla opta a ello', () => {
  // Los 404 del backend (como "email no registrado") traen textos para el usuario,
  // pero solo se muestran si la pantalla pide preferirDetalle explicitamente.
  render(<MensajeError error={errorHttp(404, 'No hay ninguna cuenta con ese email. Esa persona debe registrarse primero.')} textoNoEncontrado="Fallback." preferirDetalle />);
  expect(screen.getByText('No hay ninguna cuenta con ese email. Esa persona debe registrarse primero.')).toBeInTheDocument();
});

test('404 con detail del backend pero sin preferirDetalle usa el texto de la pantalla', () => {
  // Por defecto (preferirDetalle=false) el detail del backend NO desplaza el
  // texto que cada pantalla eligio con cuidado -- este es el comportamiento
  // por defecto que evita que, por ejemplo, ParcelaContext.jsx pierda su
  // mensaje deliberado de "no existe o no tienes acceso" en favor del detail
  // generico del backend.
  render(<MensajeError error={errorHttp(404, 'No hay ninguna cuenta con ese email. Esa persona debe registrarse primero.')} textoNoEncontrado="Fallback." />);
  expect(screen.getByText('Fallback.')).toBeInTheDocument();
  expect(screen.queryByText(/no hay ninguna cuenta/i)).not.toBeInTheDocument();
});

test('422 lista los campos que fallan', () => {
  const error = {
    response: {
      status: 422,
      data: { detail: [{ loc: ['body', 'latitud'], msg: 'Input should be less than or equal to 90' }] },
    },
  };
  render(<MensajeError error={error} />);
  expect(screen.getByText(/latitud/)).toBeInTheDocument();
});

test('422 con un detail en texto plano lo muestra tal cual', () => {
  // subir_excel_foliar manda el 422 como una frase (str(exc)), no como la
  // lista de errores por campo que manda la validacion normal de Pydantic.
  const error = {
    response: {
      status: 422,
      data: { detail: 'No se pudo abrir el archivo: formato no reconocido.' },
    },
  };
  render(<MensajeError error={error} />);
  expect(screen.getByText('No se pudo abrir el archivo: formato no reconocido.')).toBeInTheDocument();
});

test('un fallo de red lo dice', () => {
  render(<MensajeError error={{ request: {} }} />);
  expect(screen.getByText(/no se pudo contactar/i)).toBeInTheDocument();
});

test('sin error no pinta nada', () => {
  const { container } = render(<MensajeError error={null} />);
  expect(container).toBeEmptyDOMElement();
});
