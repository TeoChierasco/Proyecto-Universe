/**
 * Grilla horaria del instituto (turno mañana).
 * Ajustá los módulos a los horarios reales; el número de módulo es lo que
 * se guarda en la base, así que si cambiás las horas no hace falta migrar.
 */
const DIAS = [
  { id: 1, nombre: 'Lunes', corto: 'Lun' },
  { id: 2, nombre: 'Martes', corto: 'Mar' },
  { id: 3, nombre: 'Miércoles', corto: 'Mié' },
  { id: 4, nombre: 'Jueves', corto: 'Jue' },
  { id: 5, nombre: 'Viernes', corto: 'Vie' },
];

const MODULOS = [
  { id: 1, inicio: '07:30', fin: '08:10' },
  { id: 2, inicio: '08:10', fin: '08:50' },
  { id: 3, inicio: '09:00', fin: '09:40' },
  { id: 4, inicio: '09:40', fin: '10:20' },
  { id: 5, inicio: '10:30', fin: '11:10' },
  { id: 6, inicio: '11:10', fin: '11:50' },
  { id: 7, inicio: '12:00', fin: '12:40' },
  { id: 8, inicio: '12:40', fin: '13:20' },
];

// Recreos que se muestran entre módulos (después del módulo indicado).
const RECREOS = [
  { despuesDe: 2, texto: 'Recreo 08:50 – 09:00' },
  { despuesDe: 4, texto: 'Recreo 10:20 – 10:30' },
  { despuesDe: 6, texto: 'Recreo 11:50 – 12:00' },
];

module.exports = { DIAS, MODULOS, RECREOS };
