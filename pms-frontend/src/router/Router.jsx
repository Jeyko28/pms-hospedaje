import { createContext, useContext, useEffect, useState } from "react";

/**
 * Router minimo basado en el hash de la URL (#/reservas).
 *
 * Por que hash y no react-router: para mantener Fase 0/1 sin dependencias
 * extra y facil de entender. El hash permite navegar, recargar y compartir
 * enlaces a una seccion concreta. Mas adelante se puede cambiar a
 * react-router sin tocar las pantallas (solo este archivo y los <Link>).
 */

const RutaContext = createContext({ ruta: "dashboard", navegar: () => {} });

function leerRutaActual() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash || "dashboard";
}

export function RouterProvider({ children }) {
  const [ruta, setRuta] = useState(leerRutaActual());

  useEffect(() => {
    const alCambiar = () => setRuta(leerRutaActual());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);

  const navegar = (destino, { reemplazar = false } = {}) => {
    if (reemplazar) {
      // Reemplaza la entrada de historial (no ensucia el botón atrás) y dispara
      // hashchange, así `setRuta` se actualiza solo.
      window.location.replace(`#/${destino}`);
    } else {
      window.location.hash = `/${destino}`;
    }
  };

  return (
    <RutaContext.Provider value={{ ruta, navegar }}>
      {children}
    </RutaContext.Provider>
  );
}

export function useRuta() {
  return useContext(RutaContext);
}
