import { useCallback, useEffect, useState } from "react";

/**
 * useApi — hook para cargar datos de la API gestionando los 3 estados:
 * cargando, error y datos. Asi cada pantalla los maneja igual y nunca
 * deja al usuario sin saber que pasa.
 *
 * Uso simple:
 *   const { data, loading, error, recargar } = useApi(api.habitaciones);
 *
 * Uso con dependencias (recarga cuando cambian, ej. fechas del calendario):
 *   const datos = useApi(() => api.reservasCalendario(desde, hasta), [desde, hasta]);
 *
 * @param {Function} fetcher  funcion que devuelve una promesa
 * @param {Array}    deps     dependencias que disparan recarga al cambiar
 */
export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // El fetcher se memoiza por las deps explicitas (no por su identidad), para
  // permitir pasar arrow functions inline sin causar bucles de recarga.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { data, loading, error, recargar: cargar };
}
