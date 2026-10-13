import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';

import SelectorSensores from './SelectorSensores';
import { useSeleccionSensores } from './useSeleccionSensores';

const SENSORES = [
  { id: 11, numero: 1, profundidad_cm: 20 },
  { id: 12, numero: 2, profundidad_cm: 40 },
  { id: 14, numero: 4, profundidad_cm: 20 },
];

function Banco({ parcelaId = 1, sensores = SENSORES }) {
  const seleccion = useSeleccionSensores(parcelaId, sensores);
  return (
    <>
      <SelectorSensores sensores={sensores} seleccion={seleccion} />
      <output data-testid="estado">{`${seleccion.modo}:${seleccion.ids.join(',')}`}</output>
    </>
  );
}

const estado = () => screen.getByTestId('estado').textContent;
const pulsar = (nombre) => fireEvent.click(screen.getByRole('button', { name: nombre }));

beforeEach(() => localStorage.clear());

test('por defecto estan todos encendidos y en modo Media', () => {
  render(<Banco />);
  expect(estado()).toBe('media:11,12,14');
  expect(screen.getByRole('button', { name: 'Media' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Sensor 2' })).toHaveAttribute('aria-pressed', 'true');
});

test('apagar sensores y volver a Todos los enciende otra vez', () => {
  render(<Banco />);
  pulsar('Sensor 2');
  expect(estado()).toBe('media:11,14');
  pulsar('Todos');
  expect(estado()).toBe('media:11,12,14');
});

test('no deja apagar el ultimo sensor', () => {
  render(<Banco />);
  pulsar('Sensor 1');
  pulsar('Sensor 2');
  pulsar('Sensor 4');
  expect(estado()).toBe('media:14');
});

test('Comparar cambia el modo y la seleccion se recuerda por parcela', () => {
  const { unmount } = render(<Banco />);
  pulsar('Comparar');
  pulsar('Sensor 2');
  expect(estado()).toBe('comparar:11,14');
  unmount();

  render(<Banco />);
  expect(estado()).toBe('comparar:11,14');
});

test('una seleccion guardada con sensores que ya no existen vuelve a todos', () => {
  localStorage.setItem('vinalert_sensores_1', JSON.stringify({ ids: [99], modo: 'comparar' }));
  render(<Banco />);
  expect(estado()).toBe('comparar:11,12,14');
});

test('los sensores no se diferencian por profundidad', () => {
  render(<Banco />);
  expect(screen.queryByRole('button', { name: '20 cm' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '40 cm' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sensor 1' }).textContent).toBe('S1');
});
