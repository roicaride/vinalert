import { useState } from 'react';

import { editarCuenta, eliminarCuenta, enviarRestablecer } from '../../api/admin';
import { reenviarInvitacion } from '../../api/miembros';
import MensajeError from '../../errores/MensajeError';
import Boton from '../../ui/Boton';
import { Aviso } from '../../ui/Estados';

/**
 * Lo que el superadmin puede hacer con una cuenta, desplegado bajo su fila.
 * Las reglas de verdad (no quedarse sin superadmin, no eliminar a la unica
 * gestora de una parcela...) las aplica el backend: aqui solo se ocultan las
 * acciones sobre la propia cuenta y se muestra el motivo de cada rechazo.
 */
export default function GestionCuenta({ cuenta, esPropia, onCambio, onEliminada }) {
  const [enCurso, setEnCurso] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  const hacer = async (clave, accion) => {
    setEnCurso(clave);
    setAviso(null);
    setError(null);
    try {
      await accion();
    } catch (err) {
      setError(err);
    } finally {
      setEnCurso(null);
    }
  };

  const cambiar = (clave, cambios) =>
    hacer(clave, async () => {
      onCambio(await editarCuenta(cuenta.id, cambios));
    });

  const enviarEnlace = () =>
    hacer('enlace', async () => {
      if (cuenta.pendiente) {
        await reenviarInvitacion(cuenta.id);
        setAviso(`Invitación reenviada a ${cuenta.email}.`);
      } else {
        const r = await enviarRestablecer(cuenta.id);
        setAviso(r?.detail ?? `Enlace enviado a ${cuenta.email}.`);
      }
    });

  const eliminar = () => {
    const ok = window.confirm(
      `¿Eliminar la cuenta de ${cuenta.nombre || cuenta.email}?\n\n` +
        'Se borran su nombre, email, teléfono y su acceso a las parcelas. ' +
        'Las parcelas, lecturas y tratamientos se conservan. No se puede deshacer.',
    );
    if (!ok) return;
    hacer('eliminar', async () => {
      await eliminarCuenta(cuenta.id);
      onEliminada();
    });
  };

  const ocupado = enCurso !== null;

  return (
    <section aria-label={`Gestionar ${cuenta.email}`} className="space-y-4 px-6 py-5">
      <div className="flex flex-wrap gap-2">
        {!esPropia && (
          <Boton tono="sutil" disabled={ocupado} onClick={() => cambiar('activo', { activo: !cuenta.activo })}>
            {cuenta.activo === false ? 'Reactivar cuenta' : 'Desactivar cuenta'}
          </Boton>
        )}
        {!esPropia && (
          <Boton
            tono="sutil"
            disabled={ocupado}
            onClick={() => cambiar('superadmin', { es_superadmin: !cuenta.es_superadmin })}
          >
            {cuenta.es_superadmin ? 'Quitar superadmin' : 'Nombrar superadmin'}
          </Boton>
        )}
        <Boton
          tono="sutil"
          disabled={ocupado}
          onClick={() => cambiar('total', { acceso_total: !cuenta.acceso_total })}
        >
          {cuenta.acceso_total ? 'Quitar acceso a todas las parcelas' : 'Dar acceso a todas las parcelas'}
        </Boton>
        {cuenta.activo !== false && (
          <Boton tono="sutil" disabled={ocupado} onClick={enviarEnlace}>
            {cuenta.pendiente ? 'Reenviar invitación' : 'Enviar enlace para restablecer la contraseña'}
          </Boton>
        )}
        {!esPropia && (
          <Boton tono="sutil" disabled={ocupado} onClick={eliminar} className="hover:border-sangre hover:text-sangre">
            Eliminar cuenta
          </Boton>
        )}
      </div>
      <p className="max-w-2xl text-xs text-oso-3">
        Desactivar cierra sus sesiones y le impide entrar hasta que la reactives. El acceso a todas las
        parcelas le deja entrar como gestora en cualquiera, sin ser miembro.
        {esPropia && ' Tu propia cuenta no la puedes desactivar, eliminar ni quitarle el superadmin: pídeselo a otro superadmin.'}
      </p>
      {aviso && <Aviso tono="brote" role="status">{aviso}</Aviso>}
      {error && (
        error.response?.status === 409 && typeof error.response.data?.detail === 'string' ? (
          <Aviso tono="sangre" role="alert">{error.response.data.detail}</Aviso>
        ) : (
          <MensajeError error={error} />
        )
      )}
    </section>
  );
}
