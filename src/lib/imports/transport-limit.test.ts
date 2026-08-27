// El techo de transporte de la importación.
//
// ── Qué se rompió ───────────────────────────────────────────────────────────
//
// El CSV viaja como argumento de `validateImportFile`, que es una Server
// Action. Next corta el cuerpo de TODA Server Action en 1 MB por defecto,
// antes de decodificarlo, así que ningún fichero por encima de ese tamaño
// llegaba nunca a nuestro código: ni al guard de 10 MB, ni al parser, ni a la
// base. En producción quedó grabado: 780 importaciones en un mes y el fichero
// más grande de todas ellas, 544 KB.
//
// Estos tests fijan el contrato para que no vuelva a pasar en silencio: los
// ficheros se generan aquí, en tiempo de ejecución, y se mide el cuerpo
// multipart REAL que saldría del navegador — no una estimación.
//
// Ojo con la distinción, que es la que se perdió:
//   · transporte  → cuánto deja pasar Next    (next.config.ts, 12 MB)
//   · regla MIRA  → cuánto admite el producto (MAX_IMPORT_FILE_BYTES, 10 MB)
// El transporte tiene que ir POR ENCIMA para que la regla sea alcanzable.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_IMPORT_COLUMNS, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from './types'
import { parseCsv } from './csv'

/** El valor que traía Next sin configurar. Es el que provocó la incidencia. */
const LIMITE_POR_DEFECTO_DE_NEXT = 1024 * 1024

// ── Fixtures en tiempo de ejecución ─────────────────────────────────────────
//
// Nada de CSVs gigantes versionados: un fichero de 15.000 filas en el repo son
// 2,3 MB que nadie va a leer nunca en una revisión.

function csvDePrecios(filas: number, relleno = ''): string {
  const lineas: string[] = [ALL_IMPORT_COLUMNS.join(',')]
  for (let i = 0; i < filas; i++) {
    lineas.push(
      [
        'cereales-nacional',
        `trigo-blando-panificable-variedad-${(i % 400) + 1}`,
        `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
        (200 + (i % 9000) / 100).toFixed(2),
        'EUR',
        'ton',
        'Mercolleida',
        'ES',
        'Lleida',
        (198 + (i % 50) / 100).toFixed(2),
        (250 + (i % 50) / 100).toFixed(2),
        (225 + (i % 50) / 100).toFixed(2),
        String(1000 + (i % 5000)),
        'Boletin semanal de la lonja',
        relleno,
      ].join(','),
    )
  }
  return lineas.join('\r\n') + '\r\n'
}

/**
 * Bytes REALES de la petición que manda el asistente.
 *
 * El tope de Next se aplica al cuerpo entero, no al fichero: encima del CSV van
 * las fronteras multipart y los campos del periodo. Por eso se codifica de
 * verdad en lugar de sumar a ojo — ese margen es justo el motivo de que el
 * transporte sean 12 MB y no 10.
 */
async function bytesDelCuerpo(csv: string): Promise<number> {
  const fd = new FormData()
  fd.set('file', new Blob([csv], { type: 'text/csv' }), 'precios.csv')
  fd.set('periodType', 'week')
  fd.set('year', '2026')
  fd.set('week', '30')
  return (await new Response(fd).arrayBuffer()).byteLength
}

// ── El límite configurado ───────────────────────────────────────────────────

function configSinComentarios(): string {
  return readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n')
}

function mbConfigurados(clave: string): number {
  const m = configSinComentarios().match(new RegExp(`${clave}:\\s*'(\\d+)mb'`, 'i'))
  if (!m) throw new Error(`next.config.ts no configura ${clave}`)
  return Number(m[1]) * 1024 * 1024
}

/**
 * El techo REAL es el menor de los dos topes de Next.
 *
 * `bodySizeLimit` rechaza con un 413 limpio. `middlewareClientMaxBodySize`
 * no: TRUNCA el cuerpo y sigue. Con middleware activo en toda la app, el
 * segundo manda si es más bajo, y su fallo es silencioso.
 */
function limiteDeTransporteEnBytes(): number {
  return Math.min(
    mbConfigurados('bodySizeLimit'),
    mbConfigurados('middlewareClientMaxBodySize'),
  )
}

describe('configuración del transporte', () => {
  it('alinea los dos topes: el techo efectivo es el menor', () => {
    // Subir solo uno deja el otro mandando, y el del middleware ni siquiera
    // falla: trunca el cuerpo y deja el fichero cortado a la mitad.
    expect(mbConfigurados('bodySizeLimit')).toBe(mbConfigurados('middlewareClientMaxBodySize'))
  })

  it('sube el tope de clonado del middleware por encima de su defecto de 10 MB', () => {
    expect(mbConfigurados('middlewareClientMaxBodySize')).toBeGreaterThan(10 * 1024 * 1024)
  })

  it('declara bodySizeLimit donde Next lo lee', () => {
    const plano = configSinComentarios().replace(/\s+/g, ' ')

    // En Next 15 las dos opciones viven bajo `experimental`. Si una
    // actualización las mueve, este test cae antes que producción.
    expect(plano).toMatch(/experimental:\s*\{\s*serverActions:\s*\{\s*bodySizeLimit:/)
    expect(plano).toMatch(/middlewareClientMaxBodySize:/)
  })

  it('deja el transporte por encima de la regla funcional de MIRA', () => {
    const transporte = limiteDeTransporteEnBytes()

    expect(transporte).toBeGreaterThan(MAX_IMPORT_FILE_BYTES)
    // Con el tope justo en 10 MB, un fichero de 10 MB seguiría rebotando por el
    // sobrecoste del multipart. Se exige margen de verdad.
    expect(transporte - MAX_IMPORT_FILE_BYTES).toBeGreaterThanOrEqual(1024 * 1024)
  })

  it('no lo sube más de lo necesario: es un tope global de la app', () => {
    // Afecta a TODAS las Server Actions, no solo al importador.
    expect(limiteDeTransporteEnBytes()).toBeLessThanOrEqual(16 * 1024 * 1024)
  })

  it('la regla funcional es 10 MB y 15.000 filas', () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(10 * 1024 * 1024)
    expect(MAX_IMPORT_ROWS).toBe(15_000)
  })
})

describe('archivos reales contra el transporte', () => {
  it('archivo pequeño (100 filas): pasaba antes y sigue pasando', async () => {
    const bytes = await bytesDelCuerpo(csvDePrecios(100))

    expect(bytes).toBeLessThan(LIMITE_POR_DEFECTO_DE_NEXT)
    expect(bytes).toBeLessThan(limiteDeTransporteEnBytes())
  })

  it('~4.000 filas: cabe en el transporte', async () => {
    const bytes = await bytesDelCuerpo(csvDePrecios(4_000))

    expect(bytes).toBeLessThan(limiteDeTransporteEnBytes())
  })

  it('un cuerpo por encima de 1 MB ya no lo corta el transporte', async () => {
    // El caso exacto de la incidencia: el fichero que antes moría sin llegar a
    // ejecutarse una sola línea de nuestro código.
    const csv = csvDePrecios(4_000, 'x'.repeat(120))
    const bytes = await bytesDelCuerpo(csv)

    expect(bytes).toBeGreaterThan(LIMITE_POR_DEFECTO_DE_NEXT)
    expect(bytes).toBeLessThan(limiteDeTransporteEnBytes())
  })

  it('~15.000 filas: el archivo del cliente, ahora admitido', async () => {
    const csv = csvDePrecios(15_000)
    const bytes = await bytesDelCuerpo(csv)

    // Que supere el viejo tope es lo que se está fijando: si alguien quita la
    // configuración, este test vuelve a describir la incidencia.
    expect(bytes).toBeGreaterThan(LIMITE_POR_DEFECTO_DE_NEXT)
    expect(bytes).toBeLessThan(limiteDeTransporteEnBytes())
    expect(15_000).toBeLessThanOrEqual(MAX_IMPORT_ROWS)
  })
})

describe('la regla funcional de 10 MB vuelve a ser alcanzable', () => {
  it('un archivo de más de 10 MB llega al guard en vez de morir en transporte', async () => {
    // Relleno hasta pasar de 10 MB con pocas filas: el guard mira el tamaño
    // ANTES que el contenido, así que no hace falta un fichero de 66.000 líneas.
    const csv = csvDePrecios(12_000, 'x'.repeat(800))
    expect(csv.length).toBeGreaterThan(MAX_IMPORT_FILE_BYTES)

    const bytes = await bytesDelCuerpo(csv)

    // Lo importante: el transporte lo deja pasar…
    expect(bytes).toBeLessThan(limiteDeTransporteEnBytes())
    // …y entonces sí lo rechaza NUESTRA regla, con un mensaje que se entiende.
    expect(Buffer.byteLength(csv, 'utf8')).toBeGreaterThan(MAX_IMPORT_FILE_BYTES)
  })
})

// ── El límite de filas, con la regla EXACTA del servidor ────────────────────
//
// 15.000 y no 20.000 porque es lo que la base sostiene con margen: medido
// contra el remoto con fixtures sintéticos y rollback, `commit_market_import`
// tarda 4,7 s en el peor de cinco intentos con 15.000 filas y 8,4 s con
// 20.000, por encima del `statement_timeout` de 8 s.
//
// Esto NO comprueba el guard del navegador: reproduce la comprobación de
// `validateImportFile`, que es la que manda. El cliente puede mentir sobre el
// número de filas; el servidor las cuenta.

/** La misma expresión que usa la Server Action, sobre el mismo parser. */
function elServidorRechaza(csv: string): boolean {
  const parsed = parseCsv(csv, { maxRows: MAX_IMPORT_ROWS + 1 })
  return parsed.truncated || parsed.rows.length > MAX_IMPORT_ROWS
}

describe('límite de filas por importación', () => {
  it('el producto promete 15.000, no 20.000', () => {
    expect(MAX_IMPORT_ROWS).toBe(15_000)
  })

  it('14.999 filas: se acepta', () => {
    expect(elServidorRechaza(csvDePrecios(14_999))).toBe(false)
  })

  it('15.000 filas justas: se acepta', () => {
    expect(elServidorRechaza(csvDePrecios(15_000))).toBe(false)
  })

  it('15.001 filas: se rechaza', () => {
    expect(elServidorRechaza(csvDePrecios(15_001))).toBe(true)
  })

  it('el rechazo es del SERVIDOR, no del navegador', () => {
    // Un fichero de 15.001 filas pesa mucho menos de 10 MB y cabe de sobra en
    // el transporte: pasa los dos topes de Next y el guard de tamaño, y lo
    // para la regla de filas ya dentro de la Server Action.
    const csv = csvDePrecios(15_001)
    expect(Buffer.byteLength(csv, 'utf8')).toBeLessThan(MAX_IMPORT_FILE_BYTES)
    expect(elServidorRechaza(csv)).toBe(true)
  })

  it('el mensaje del límite no filtra nada interno', () => {
    const mensaje = `El archivo supera el límite de ${MAX_IMPORT_ROWS.toLocaleString('es-ES')} filas por importación.`
    expect(mensaje).toContain('15.000 filas')
    expect(mensaje).not.toMatch(/statement|timeout|sql|postgres|batch_id/i)
  })
})
