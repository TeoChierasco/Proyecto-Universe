/**
 * Utilidades de consulta a Supabase.
 */

/**
 * Supabase devuelve como máximo 1000 filas por consulta: esta función
 * pide de a páginas hasta traer todo. `armar` es una función que devuelve
 * una consulta nueva (sin .range()). Con { opcional: true }, si la tabla
 * no existe (falta correr un SQL) devuelve [] en lugar de fallar.
 */
async function traerTodo(armar, { opcional = false } = {}) {
  const PAGINA = 1000;
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar().range(desde, desde + PAGINA - 1);
    if (error) {
      if (opcional) return [];
      throw error;
    }
    filas.push(...data);
    if (data.length < PAGINA) break;
  }
  return filas;
}

module.exports = { traerTodo };
