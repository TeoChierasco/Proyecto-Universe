/**
 * Verifica que la clave secreta funcione y que el esquema esté aplicado.
 * Uso:  node scripts/test-esquema.js
 */
require('dotenv').config();
const { supabaseAdmin, hasAdmin } = require('../config/supabase');

(async () => {
  console.log('hasAdmin (secret):', hasAdmin);
  if (!hasAdmin) {
    console.log('⚠️  Falta SUPABASE_SERVICE_KEY en .env');
    return;
  }

  for (const tabla of ['perfiles', 'codigos_aprobacion']) {
    const { error } = await supabaseAdmin.from(tabla).select('*').limit(1);
    if (error) {
      if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
        console.log(`❌ Tabla "${tabla}": NO existe todavía (falta ejecutar db/schema.sql).`);
      } else {
        console.log(`❌ Tabla "${tabla}": ${error.message}`);
      }
    } else {
      console.log(`✅ Tabla "${tabla}": existe y es accesible.`);
    }
  }
})();
