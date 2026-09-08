import * as XLSX from 'xlsx';

/**
 * Genera y descarga un archivo Excel (.xlsx) nativo con una o múltiples pestañas/hojas.
 * @param {string} nombreArchivo - Nombre del archivo (sin extensión).
 * @param {Array<{ nombre: string, cabeceras: string[], filas: any[][] }>} pestanas - Lista de hojas a incluir.
 */
export function exportarExcelMultilibro(nombreArchivo, pestanas) {
  const wb = XLSX.utils.book_new();

  pestanas.forEach((p) => {
    if (!p.cabeceras || !p.filas) return;
    const datosHoja = [p.cabeceras, ...p.filas];
    const ws = XLSX.utils.aoa_to_sheet(datosHoja);

    // Ajuste automático de ancho de columnas
    const anchos = p.cabeceras.map((cab, idx) => {
      let maxLen = String(cab).length;
      p.filas.slice(0, 100).forEach((f) => {
        const valLen = f[idx] != null ? String(f[idx]).length : 0;
        if (valLen > maxLen) maxLen = valLen;
      });
      return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
    });
    ws['!cols'] = anchos;

    // Nombre de pestaña (máximo 31 caracteres permitido por Excel)
    const nombreHoja = (p.nombre || 'Datos').replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  });

  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}

/**
 * Utilidad para descargar datos en formato CSV compatible con Microsoft Excel (UTF-8 BOM y separador punto y coma).
 */
export function descargarCsv(nombreArchivo, cabeceras, filas) {
  const lineas = [
    cabeceras.join(';'),
    ...filas.map((fila) =>
      fila
        .map((valor) => {
          if (valor == null) return '';
          const str = String(valor).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(';'),
    ),
  ];

  const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.setAttribute('href', url);
  enlace.setAttribute('download', `${nombreArchivo}.csv`);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
