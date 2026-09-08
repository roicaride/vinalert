import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { LECTURA_FOLIAR, PARCELA_GESTOR, PARCELA_LECTURA } from '../test/respuestas';
import { ProveedorParcela } from '../parcela/ParcelaContext';
import Foliar from './Foliar';

vi.mock('../api/parcelas', () => ({ obtenerParcela: vi.fn() }));
vi.mock('../api/foliar', () => ({ listarFoliar: vi.fn(), subirFoliar: vi.fn() }));
import { obtenerParcela } from '../api/parcelas';
import { listarFoliar, subirFoliar } from '../api/foliar';

function montar(parcela) {
  obtenerParcela.mockResolvedValue(parcela);
  return render(
    <ProveedorParcela parcelaId={parcela.id}><Foliar /></ProveedorParcela>,
  );
}

beforeEach(() => vi.clearAllMocks());

test('se ven las lecturas agrupadas por fecha', async () => {
  listarFoliar.mockResolvedValue([LECTURA_FOLIAR]);
  montar(PARCELA_GESTOR);

  expect(await screen.findByText('15/8/2026')).toBeInTheDocument();
  expect(screen.getByText(/32.4/)).toBeInTheDocument();
});

test('un lector no ve la zona de subida', async () => {
  listarFoliar.mockResolvedValue([]);
  montar(PARCELA_LECTURA);

  await screen.findByText(/todav[ií]a no hay lecturas/i);
  expect(screen.queryByLabelText('Archivo Excel del medidor foliar')).not.toBeInTheDocument();
});

test('subir un excel valido anade las lecturas nuevas', async () => {
  listarFoliar.mockResolvedValue([]);
  const nueva = { ...LECTURA_FOLIAR, id: 2 };
  subirFoliar.mockResolvedValue([nueva]);
  montar(PARCELA_GESTOR);

  await screen.findByText(/todav[ií]a no hay lecturas/i);
  const archivo = new File(['contenido'], 'foliar.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await userEvent.upload(screen.getByLabelText('Archivo Excel del medidor foliar'), archivo);
  await userEvent.click(screen.getByRole('button', { name: 'Subir' }));

  expect(subirFoliar).toHaveBeenCalledWith(1, archivo);
  expect(await screen.findByText('15/8/2026')).toBeInTheDocument();
});

test('un archivo con formato invalido se traduce con MensajeError', async () => {
  listarFoliar.mockResolvedValue([]);
  subirFoliar.mockRejectedValue({
    response: { status: 422, data: { detail: 'No se pudo abrir el archivo: formato no reconocido.' } },
  });
  montar(PARCELA_GESTOR);

  await screen.findByText(/todav[ií]a no hay lecturas/i);
  const archivo = new File(['contenido'], 'roto.xlsx', { type: 'application/octet-stream' });
  await userEvent.upload(screen.getByLabelText('Archivo Excel del medidor foliar'), archivo);
  await userEvent.click(screen.getByRole('button', { name: 'Subir' }));

  expect(await screen.findByText(/formato no reconocido/i)).toBeInTheDocument();
});
