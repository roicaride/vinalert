import { Component } from 'react';

import { Filigrana } from '../marca/Marca';
import { claseBoton } from '../ui/claseBoton';

/**
 * Red de seguridad de toda la aplicacion: si una pantalla falla al pintarse
 * (un dato con una forma inesperada en una grafica, por ejemplo), React
 * desmonta el arbol entero y queda una pantalla en blanco sin explicacion.
 * Esto la sustituye por un mensaje y una salida.
 *
 * Tiene que ser un componente de clase: es la unica forma que da React de
 * capturar errores de render. Va fuera del router, asi que el enlace de
 * vuelta es un <a> normal.
 */
export default class LimiteErrores extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Fallo al pintar la aplicación', error, info?.componentStack);
  }

  recargar = () => {
    (this.props.alRecargar ?? (() => window.location.reload()))();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-lousa px-6">
        <Filigrana alto={220} />
        <div role="alert" className="relative max-w-md space-y-5 text-center">
          <p className="rotulo">Error</p>
          <h1 className="font-mono text-xl font-medium text-oso">Algo ha fallado al mostrar esta pantalla.</h1>
          <p className="text-sm text-oso-2">
            Tus datos no se han perdido. Recarga la página; si vuelve a pasar, avisa al administrador indicando qué
            estabas haciendo.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={this.recargar} className={claseBoton('solido')}>
              Recargar
            </button>
            <a href="/" className={claseBoton('sutil')}>
              Volver al inicio
            </a>
          </div>
        </div>
      </div>
    );
  }
}
