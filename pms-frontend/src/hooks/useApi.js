import { useCallback, useEffect, useState } from "react";

/**
 * useApi — hook para cargar datos de la API gestionando los 3 estados:
 * cargando, error y datos. Asi cada pantalla los maneja igual y nunca
 * deja al usuario sin saber que pasa.
 *
 * Uso:
 *   const { data, loading, error, recargar } = useApi(api.habitaciones);
 *
 * @param {Function} fetcher  funcion que devuelve una promesa (ej. api.habitaciones)
 */
export function useApi(fetcher) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resultado = await fetcher();
      setData(resultado);
    } catch (e) {
      setError(e.message || "Ocurrio un error inesperado.");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { data, loading, error, recargar: cargar };
}
