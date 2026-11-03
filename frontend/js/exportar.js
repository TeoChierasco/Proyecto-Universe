/**
 * Instituto Universe — Exportar listados a Excel (.xlsx) y PDF.
 *
 * Sin dependencias externas:
 *   - Excel: arma un .xlsx real (zip sin compresión + XML de Office Open XML),
 *     con título, encabezado en negrita, filtros y la primera fila fija.
 *   - PDF: arma una hoja limpia con el listado y abre el diálogo de impresión
 *     del navegador, donde se elige "Guardar como PDF".
 *
 * Uso:
 *   const datos = {
 *     archivo: 'legajos-pendientes',          // nombre del archivo (sin extensión)
 *     titulo: 'Legajos con documentación pendiente',
 *     subtitulo: '1.º A · 12 alumnos',         // opcional
 *     columnas: [{ titulo: 'Alumno/a', ancho: 28 }, { titulo: 'Docs', ancho: 8, numero: true }],
 *     filas: [['Acosta, Valentina', 6], …],
 *     apaisado: false,                          // PDF horizontal
 *   };
 *   Exportar.excel(datos);  Exportar.pdf(datos);
 */
const Exportar = (() => {
  // ---------- ZIP (método "store", sin compresión) ----------
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(archivos) {
    const enc = new TextEncoder();
    const partes = [];
    const central = [];
    let offset = 0;
    archivos.forEach(({ nombre, contenido }) => {
      const nom = enc.encode(nombre);
      const datos = enc.encode(contenido);
      const crc = crc32(datos);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // nombres en UTF-8
      local.setUint16(8, 0, true);      // sin compresión
      local.setUint32(14, crc, true);
      local.setUint32(18, datos.length, true);
      local.setUint32(22, datos.length, true);
      local.setUint16(26, nom.length, true);
      partes.push(new Uint8Array(local.buffer), nom, datos);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, datos.length, true);
      cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nom.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nom);
      offset += 30 + nom.length + datos.length;
    });
    const tamCentral = central.reduce((s, p) => s + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, offset, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // ---------- XLSX ----------
  const xml = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  function columnaLetra(i) {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  function celda(ref, valor, estilo) {
    const s = estilo ? ` s="${estilo}"` : '';
    if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}"${s}><v>${valor}</v></c>`;
    if (valor == null || valor === '') return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
  }

  function nombreHoja(t) {
    return String(t || 'Listado').replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Listado';
  }

  function excel({ archivo, hoja, titulo, subtitulo, columnas, filas }) {
    const nCols = columnas.length;
    const ultima = columnaLetra(nCols - 1);
    const filasXml = [];
    let r = 1;
    filasXml.push(`<row r="${r}">${celda(`A${r}`, titulo, 2)}</row>`); r++;
    const emitido = `Instituto Universe · emitido el ${new Date().toLocaleDateString('es-AR')}`;
    filasXml.push(`<row r="${r}">${celda(`A${r}`, subtitulo ? `${subtitulo} · ${emitido}` : emitido, 3)}</row>`); r++;
    r++; // fila en blanco
    const filaEncabezado = r;
    filasXml.push(`<row r="${r}">${columnas.map((c, i) => celda(`${columnaLetra(i)}${r}`, c.titulo, 1)).join('')}</row>`); r++;
    filas.forEach((f) => {
      filasXml.push(`<row r="${r}">${f.map((v, i) => celda(`${columnaLetra(i)}${r}`, v, columnas[i] && columnas[i].numero ? 4 : 0)).join('')}</row>`);
      r++;
    });
    const ultimaFila = Math.max(filaEncabezado, r - 1);

    const cols = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 16}" customWidth="1"/>`).join('');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${filaEncabezado}" topLeftCell="A${filaEncabezado + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${filasXml.join('')}</sheetData>
${filas.length ? `<autoFilter ref="A${filaEncabezado}:${ultima}${ultimaFila}"/>` : ''}
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

    const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.##"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF5F8F10"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF6D7A63"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5F8F10"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    const blob = zip([
      { nombre: '[Content_Types].xml', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { nombre: '_rels/.rels', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { nombre: 'xl/workbook.xml', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(nombreHoja(hoja || titulo))}" sheetId="1" r:id="rId1"/></sheets>${filas.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(nombreHoja(hoja || titulo)).replace(/'/g, "''")}'!$A$${filaEncabezado}:$${ultima}$${ultimaFila}</definedName></definedNames>` : ''}</workbook>` },
      { nombre: 'xl/_rels/workbook.xml.rels', contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { nombre: 'xl/worksheets/sheet1.xml', contenido: sheet },
      { nombre: 'xl/styles.xml', contenido: estilos },
    ]);
    descargar(blob, `${limpiarNombre(archivo || titulo)}.xlsx`);
  }

  // ---------- PDF (vía impresión) ----------
  const html = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function pdf({ titulo, subtitulo, columnas, filas, apaisado }) {
    const fmt = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : html(v));
    const doc = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${html(titulo)}</title>
<style>
  @page { size: A4 ${apaisado ? 'landscape' : 'portrait'}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Inter, Arial, sans-serif; color: #2c3a26; margin: 0; font-size: 10.5pt; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #5f8f10; padding-bottom: 8px; margin-bottom: 12px; }
  header img { height: 34px; }
  h1 { font-size: 15pt; margin: 0; color: #5f8f10; }
  .sub { font-size: 9.5pt; color: #6d7a63; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #5f8f10; color: #fff; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; padding: 6px 7px; }
  td { padding: 5px 7px; border-bottom: 1px solid #dfe7d3; vertical-align: top; }
  tr:nth-child(even) td { background: #f4f6f1; }
  td.num, th.num { text-align: center; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  footer { margin-top: 10px; font-size: 8.5pt; color: #6d7a63; }
  .vacio { padding: 20px; text-align: center; color: #6d7a63; }
</style></head><body>
<header><img src="${location.origin}/assets/logo.svg" alt=""><div><h1>${html(titulo)}</h1>
<div class="sub">${subtitulo ? html(subtitulo) + ' · ' : ''}Instituto Universe · Nivel Secundario · emitido el ${new Date().toLocaleDateString('es-AR')}</div></div></header>
${filas.length ? `<table><thead><tr>${columnas.map((c) => `<th class="${c.numero ? 'num' : ''}">${html(c.titulo)}</th>`).join('')}</tr></thead>
<tbody>${filas.map((f) => `<tr>${f.map((v, i) => `<td class="${columnas[i] && columnas[i].numero ? 'num' : ''}">${fmt(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="vacio">No hay filas para mostrar con los filtros elegidos.</p>'}
<footer>${filas.length} fila${filas.length === 1 ? '' : 's'}</footer>
</body></html>`;

    // Se imprime desde un iframe oculto (no lo bloquean los bloqueadores de ventanas).
    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(marco);
    const d = marco.contentWindow.document;
    d.open(); d.write(doc); d.close();
    const imprimir = () => {
      marco.contentWindow.focus();
      marco.contentWindow.print();
      setTimeout(() => marco.remove(), 60000);
    };
    const img = d.querySelector('img');
    if (img && !img.complete) { img.onload = imprimir; img.onerror = imprimir; } else setTimeout(imprimir, 50);
  }

  // ---------- Común ----------
  function limpiarNombre(t) {
    return String(t || 'listado').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'listado';
  }

  function descargar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /**
   * Agrega los botones "Excel" y "PDF" a un contenedor.
   * obtenerDatos() se llama en cada clic y devuelve el objeto de datos (lo que se ve en pantalla).
   */
  function botones(contenedor, obtenerDatos) {
    contenedor.innerHTML = `
      <span class="exportar-etiqueta">Exportar lo que se ve:</span>
      <button type="button" class="btn-mini" data-exportar="excel">Excel</button>
      <button type="button" class="btn-mini" data-exportar="pdf">PDF</button>`;
    contenedor.querySelector('[data-exportar="excel"]').addEventListener('click', () => excel(obtenerDatos()));
    contenedor.querySelector('[data-exportar="pdf"]').addEventListener('click', () => pdf(obtenerDatos()));
  }

  return { excel, pdf, botones, _zip: zip };
})();
