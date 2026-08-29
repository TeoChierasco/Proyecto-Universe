/**
 * Verifica que la conexión con Supabase funcione.
 * Uso:  node scripts/test-conexion.js
 */
require('dotenv').config();
const { supabase, isConfigured, hasAdmin } = require('../config/supabase');

(async () => {
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL || '(vacío)');
  console.log('isConfigured (anon):', isConfigured, '| hasAdmin (secret):', hasAdmin);

  if (!isConfigured) {
    console.log('⚠️  Falta configurar SUPABASE_URL / SUPABASE_ANON_KEY en .env');
    return;
  }

  const { data, error } = await supabase.from('perfiles').select('id').limit(1);

  if (error) {
    if (/schema cache|does not exist|Could not find the table/i.test(error.message)) {
      console.log('✅ Conexión OK. Falta ejecutar db/schema.sql (la tabla "perfiles" aún no existe).');
    } else {
      console.log('❌ Error de conexión:', error.message);
    }
  } else {
    console.log(`✅ Conexión OK y esquema aplicado. Filas leídas en "perfiles": ${data.length}`);
  }
})();
