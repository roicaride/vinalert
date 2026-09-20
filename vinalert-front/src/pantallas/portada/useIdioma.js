import { useEffect, useState } from 'react';

import { TEXTOS } from './textos';

const CLAVE = 'vinalert_idioma';

/**
 * El idioma de partida: lo que la persona eligio la ultima vez y, si nunca
 * eligio, el de su navegador cuando lo tenemos. Si no, castellano.
 *
 * localStorage puede no estar (ventana privada, datos bloqueados), y entonces
 * la portada tiene que seguir funcionando: por eso cada acceso va en try.
 */
function idiomaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado && TEXTOS[guardado]) return guardado;
  } catch {
    // sin almacenamiento: se decide por el navegador
  }
  const delNavegador = (navigator.language || '').slice(0, 2).toLowerCase();
  return TEXTOS[delNavegador] ? delNavegador : 'es';
}

/**
 * Devuelve `[codigo, textos, cambiar]`. Mientras la portada esta montada, el
 * `lang` del documento y el titulo de la pestana siguen al idioma elegido
 * —los lectores de pantalla pronuncian segun `lang`— y al salir se devuelven
 * como estaban, porque la aplicacion es solo en castellano.
 */
export function useIdioma() {
  const [codigo, setCodigo] = useState(idiomaInicial);
  const textos = TEXTOS[codigo];

  useEffect(() => {
    const lang = document.documentElement.lang;
    const titulo = document.title;
    document.documentElement.lang = codigo;
    document.title = `Viñalert — ${textos.portada.titulo}`;
    return () => {
      document.documentElement.lang = lang || 'es';
      document.title = titulo;
    };
  }, [codigo, textos]);

  const cambiar = (nuevo) => {
    setCodigo(nuevo);
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch {
      // se recuerda solo mientras dure la visita
    }
  };

  return [codigo, textos, cambiar];
}
