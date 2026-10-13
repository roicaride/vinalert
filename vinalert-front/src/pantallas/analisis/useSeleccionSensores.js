import { useCallback, useMemo, useState } from 'react';

/**
 * Que sensores se ven en las graficas de suelo y como (media o comparados).
 *
 * La seleccion se recuerda por parcela en localStorage como comodidad: si el
 * almacenamiento no esta o lo guardado ya no encaja con los sensores, se
 * vuelve a "todos, en media". Nunca queda vacia.
 */

const clave = (parcelaId) => `vinalert_sensores_${parcelaId}`;

function leer(parcelaId) {
  try {
    const guardado = JSON.parse(localStorage.getItem(clave(parcelaId)));
    return guardado && Array.isArray(guardado.ids) ? guardado : null;
  } catch {
    return null;
  }
}

function guardar(parcelaId, seleccion) {
  try {
    localStorage.setItem(clave(parcelaId), JSON.stringify(seleccion));
  } catch {
    // Sin almacenamiento: se recuerda solo mientras dure la visita.
  }
}

export function useSeleccionSensores(parcelaId, sensores) {
  // Lo tocado en esta visita, por parcela. Si no se ha tocado, manda lo guardado.
  const [tocado, setTocado] = useState({});
  const todos = useMemo(() => sensores.map((s) => s.id), [sensores]);

  const base = tocado[parcelaId] ?? leer(parcelaId);
  const valida = base && base.ids.length > 0 && base.ids.every((id) => todos.includes(id));
  // Clave estable de lo guardado/tocado: `leer` devuelve un array nuevo en
  // cada render aunque el contenido no cambie, y eso rompia los memos de
  // Analisis.jsx que dependen de `ids`.
  const baseIdsClave = valida ? base.ids.join(',') : '';
  // En el orden de los sensores, no en el de los clics.
  const ids = useMemo(
    () => (valida ? todos.filter((id) => base.ids.includes(id)) : todos),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseIdsClave resume el contenido de base.ids
    [todos, valida, baseIdsClave],
  );
  const modo = base?.modo === 'comparar' ? 'comparar' : 'media';

  const fijar = useCallback(
    (nueva) => {
      setTocado((prev) => ({ ...prev, [parcelaId]: nueva }));
      guardar(parcelaId, nueva);
    },
    [parcelaId],
  );

  return {
    ids,
    modo,
    alternar: (id) => {
      const siguiente = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      if (siguiente.length) fijar({ ids: siguiente, modo });
    },
    elegirTodos: () => fijar({ ids: todos, modo }),
    cambiarModo: (nuevo) => fijar({ ids, modo: nuevo }),
  };
}
