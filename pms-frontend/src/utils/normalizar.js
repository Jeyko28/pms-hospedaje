/**
 * Normaliza un texto eliminando acentos/diacríticos y convirtiendo a minúsculas.
 * Permite buscar "maria" y encontrar "María".
 */
export function normalizar(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
