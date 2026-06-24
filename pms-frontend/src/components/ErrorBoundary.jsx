import { Component } from "react";
import Button from "./Button";
import "./ErrorBoundary.css";

/**
 * ErrorBoundary — red de seguridad anti-crash.
 *
 * Si cualquier componente hijo lanza un error al renderizar, en vez de dejar
 * la pantalla en blanco (mala experiencia y sin salida), muestra un mensaje
 * claro con opciones de recuperación. Las error boundaries DEBEN ser
 * componentes de clase (React no ofrece equivalente con hooks).
 *
 * Uso en dos capas:
 *  - Envolviendo el contenido de cada página (con key=ruta): un fallo en una
 *    sección no tumba el menú; al navegar a otra, la boundary se remonta y se
 *    limpia el error.
 *  - A nivel raíz: último recurso si fallan el shell o los proveedores.
 *
 * Props:
 *   children
 *   onReset: callback opcional al pulsar "Reintentar".
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // En el futuro se podría enviar a un servicio de monitoreo (Sentry, etc.).
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary capturó un error:", error, info);
  }

  reintentar = () => {
    this.setState({ error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="errbound" role="alert">
          <div className="errbound__card">
            <div className="errbound__icon" aria-hidden="true">
              ⚠️
            </div>
            <h2 className="errbound__title">Algo salió mal</h2>
            <p className="errbound__msg">
              Tuvimos un problema al mostrar esta sección. Tus datos están a
              salvo. Puedes reintentar o recargar la página.
            </p>
            <div className="errbound__actions">
              <Button onClick={this.reintentar}>Reintentar</Button>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Recargar página
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
