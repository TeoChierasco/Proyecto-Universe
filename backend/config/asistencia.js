/**
 * Reglas del cómputo de inasistencias.
 * Ajustá estos valores al régimen de asistencia del instituto.
 */

// Cuánto suma cada registro al total de inasistencias.
const VALOR = {
  presente: 0,
  tarde: 0.25,     // llegada tarde
  retirado: 0.5,   // se retiró antes de terminar la jornada
  ausente: 1,
};

// Tope anual de inasistencias (por ciclo lectivo).
const LIMITE_ANUAL = 25;

// Al llegar a cada uno de estos totales se envía un aviso automático a la familia.
const UMBRALES_AVISO = [10, 15, 20, 25];

// Desde cuántas faltas se considera "atención" y "crítico" (para colores y alertas).
const NIVEL_ATENCION = 15;
const NIVEL_CRITICO = 20;

const ESTADOS = Object.keys(VALOR);

function redondear(n) {
  return Math.round(n * 100) / 100;
}

function nivelDe(faltas) {
  if (faltas >= LIMITE_ANUAL) return 'excedido';
  if (faltas >= NIVEL_CRITICO) return 'critico';
  if (faltas >= NIVEL_ATENCION) return 'atencion';
  return 'normal';
}

/**
 * Calcula el cómputo de inasistencias de una lista de registros
 * ({ estado, justificada }). Las justificadas SUMAN al total (como en
 * la mayoría de los regímenes), pero se informan por separado.
 */
function computar(registros) {
  let faltas = 0;
  let justificadas = 0;
  const cuenta = { presente: 0, tarde: 0, retirado: 0, ausente: 0 };
  registros.forEach((r) => {
    const v = VALOR[r.estado] || 0;
    faltas += v;
    if (r.justificada) justificadas += v;
    if (cuenta[r.estado] !== undefined) cuenta[r.estado] += 1;
  });
  faltas = redondear(faltas);
  justificadas = redondear(justificadas);
  const dias = registros.length;
  return {
    faltas,
    justificadas,
    injustificadas: redondear(faltas - justificadas),
    ausencias: cuenta.ausente,
    tardes: cuenta.tarde,
    retiros: cuenta.retirado,
    presentes: cuenta.presente,
    dias,
    presentismo: dias ? Math.round(((dias - cuenta.ausente) / dias) * 1000) / 10 : null,
    limite: LIMITE_ANUAL,
    restan: redondear(Math.max(0, LIMITE_ANUAL - faltas)),
    nivel: nivelDe(faltas),
  };
}

// Rango de fechas de un ciclo lectivo (año calendario).
function rangoCiclo(ciclo) {
  return { desde: `${ciclo}-01-01`, hasta: `${ciclo}-12-31` };
}

module.exports = {
  VALOR, LIMITE_ANUAL, UMBRALES_AVISO, NIVEL_ATENCION, NIVEL_CRITICO, ESTADOS,
  computar, nivelDe, rangoCiclo,
};
