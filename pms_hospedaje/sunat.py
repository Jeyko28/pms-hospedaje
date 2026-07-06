"""
sunat.py — Facturación electrónica (SUNAT), Fase 1: emisor MODULAR en modo
sandbox/demo, solo BOLETAS de venta.

Diseño (igual filosofía que la pasarela de pagos): una abstracción `EmisorBase`
con un adaptador `EmisorSandbox` que NO habla con SUNAT (asigna serie-correlativo,
genera una representación impresa en PDF y marca el comprobante como aceptado en
modo demo). Más adelante se añade `EmisorNubefact` (u otro OSE) implementando la
misma interfaz, sin cambiar el resto del sistema. También queda lista la base
para añadir el tipo 'factura' (requiere RUC del huésped) cuando se necesite.

La configuración SUNAT es POR HOSPEDAJE (cada uno tiene su RUC y serie) y es
OPCIONAL: un hospedaje sin RUC sigue usando el PMS normal; activa SUNAT al
formalizarse.
"""
import os
import re
import unicodedata
from datetime import datetime

from database import get_connection


def _sanitize_filename(texto: str) -> str:
    """Convierte un texto en un nombre de archivo seguro (sin path traversal)."""
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    texto = texto.lower().strip()
    texto = re.sub(r"[^a-z0-9._-]", "_", texto)
    texto = re.sub(r"_+", "_", texto).strip("_")
    return texto or "archivo"


# --------------------------------------------------------------------------- #
#  Tablas
# --------------------------------------------------------------------------- #
def crear_tablas_sunat():
    """Crea las tablas de facturación electrónica si faltan (idempotente)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Config por hospedaje (1 fila por hospedaje).
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sunat_config (
                hospedaje_id INTEGER PRIMARY KEY,
                ruc TEXT DEFAULT '',
                razon_social TEXT DEFAULT '',
                direccion TEXT DEFAULT '',
                serie_boleta TEXT DEFAULT 'B001',
                correlativo_boleta INTEGER DEFAULT 0,   -- último usado; el próximo es +1
                modo TEXT DEFAULT 'sandbox',            -- 'sandbox' | 'produccion'
                proveedor TEXT DEFAULT 'sandbox',       -- 'sandbox' | 'nubefact' | ...
                activo INTEGER DEFAULT 0,               -- emisión habilitada
                actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        # Comprobantes emitidos.
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS comprobantes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hospedaje_id INTEGER NOT NULL,
                factura_id INTEGER,
                tipo TEXT NOT NULL DEFAULT 'boleta',    -- 'boleta' | 'factura'
                serie TEXT NOT NULL,
                correlativo INTEGER NOT NULL,
                numero TEXT NOT NULL,                   -- "B001-00000001"
                fecha_emision TEXT NOT NULL,
                moneda TEXT DEFAULT 'PEN',
                cliente_tipo_doc TEXT DEFAULT 'SIN',    -- 'DNI' | 'RUC' | 'SIN'
                cliente_num_doc TEXT DEFAULT '',
                cliente_nombre TEXT DEFAULT '',
                op_gravada REAL DEFAULT 0,              -- base gravada (total sin IGV)
                igv REAL DEFAULT 0,                     -- IGV 18% (total - base)
                total REAL NOT NULL DEFAULT 0,
                estado TEXT NOT NULL DEFAULT 'aceptado',-- 'aceptado'|'rechazado'|'pendiente'|'anulado'
                modo TEXT NOT NULL DEFAULT 'sandbox',
                hash TEXT DEFAULT '',
                mensaje TEXT DEFAULT '',
                pdf_path TEXT DEFAULT '',
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()

        # --- Cambios aditivos idempotentes (BDs existentes) ---
        # IGV desglosado (comprobantes previos quedan en 0; los nuevos lo calculan).
        cols = _columnas(cursor, "comprobantes")
        if "op_gravada" not in cols:
            cursor.execute("ALTER TABLE comprobantes ADD COLUMN op_gravada REAL DEFAULT 0")
        if "igv" not in cols:
            cursor.execute("ALTER TABLE comprobantes ADD COLUMN igv REAL DEFAULT 0")
        # Unicidad del correlativo por (hospedaje, serie): evita números duplicados
        # ante concurrencia o un fallo entre INSERT y avance del correlativo.
        try:
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_comprobantes_serie_corr "
                "ON comprobantes(hospedaje_id, serie, correlativo)"
            )
        except Exception:
            # Si hubiera duplicados legados, no impedir el arranque (se limpian aparte).
            pass
        conn.commit()
    finally:
        conn.close()


def _columnas(cursor, tabla):
    """Nombres de columnas de una tabla (SQLite o PostgreSQL). Local a sunat."""
    import dbengine
    if dbengine.USA_POSTGRES:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
            (tabla,),
        )
        return {r[0] for r in cursor.fetchall()}
    cursor.execute(f"PRAGMA table_info({tabla})")
    return {r[1] for r in cursor.fetchall()}


# --------------------------------------------------------------------------- #
#  Configuración (por hospedaje)
# --------------------------------------------------------------------------- #
_CONFIG_DEFECTO = {
    "ruc": "",
    "razon_social": "",
    "direccion": "",
    "serie_boleta": "B001",
    "correlativo_boleta": 0,
    "modo": "sandbox",
    "proveedor": "sandbox",
    "activo": 0,
}


def obtener_config(hid):
    """Devuelve la config SUNAT del hospedaje (o los valores por defecto)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sunat_config WHERE hospedaje_id = ?", (hid,))
        row = cursor.fetchone()
        if not row:
            return {"hospedaje_id": hid, **_CONFIG_DEFECTO}
        return dict(row)
    finally:
        conn.close()


def guardar_config(hid, datos):
    """Crea o actualiza la config SUNAT del hospedaje (upsert manual)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT hospedaje_id FROM sunat_config WHERE hospedaje_id = ?", (hid,))
        existe = cursor.fetchone() is not None
        campos = {
            "ruc": (datos.get("ruc") or "").strip(),
            "razon_social": (datos.get("razon_social") or "").strip(),
            "direccion": (datos.get("direccion") or "").strip(),
            "serie_boleta": (datos.get("serie_boleta") or "B001").strip().upper(),
            "modo": datos.get("modo") or "sandbox",
            "activo": 1 if datos.get("activo") else 0,
        }
        if existe:
            cursor.execute(
                """
                UPDATE sunat_config SET ruc=?, razon_social=?, direccion=?,
                    serie_boleta=?, modo=?, activo=?, actualizado_en=CURRENT_TIMESTAMP
                WHERE hospedaje_id=?
                """,
                (campos["ruc"], campos["razon_social"], campos["direccion"],
                 campos["serie_boleta"], campos["modo"], campos["activo"], hid),
            )
        else:
            cursor.execute(
                """
                INSERT INTO sunat_config (hospedaje_id, ruc, razon_social, direccion,
                    serie_boleta, modo, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (hid, campos["ruc"], campos["razon_social"], campos["direccion"],
                 campos["serie_boleta"], campos["modo"], campos["activo"]),
            )
        conn.commit()
    finally:
        conn.close()
    return obtener_config(hid)


# --------------------------------------------------------------------------- #
#  Emisor modular
# --------------------------------------------------------------------------- #
class EmisorBase:
    """Interfaz de un emisor de comprobantes. Implementaciones futuras
    (Nubefact, etc.) deben respetar `emitir(...)`."""

    def emitir(self, comprobante, config):
        raise NotImplementedError


class EmisorSandbox(EmisorBase):
    """Emisor DEMO: no contacta a SUNAT. Marca el comprobante como aceptado y
    genera un hash simulado. Sirve para construir y probar todo el flujo."""

    def emitir(self, comprobante, config):
        sello = f"{comprobante['numero']}-{comprobante['total']}-{comprobante['fecha_emision']}"
        hash_demo = "DEMO" + str(abs(hash(sello)))[:12]
        return {
            "estado": "aceptado",
            "hash": hash_demo,
            "mensaje": "Aceptado en modo SANDBOX (sin valor tributario).",
        }


def obtener_emisor(config):
    """Factory: devuelve el emisor según la config. Por ahora solo sandbox."""
    # En el futuro: if config['proveedor']=='nubefact' and config['modo']=='produccion': return EmisorNubefact(...)
    return EmisorSandbox()


# --------------------------------------------------------------------------- #
#  Emisión de una boleta a partir de una factura interna
# --------------------------------------------------------------------------- #
class SunatError(Exception):
    """Error de negocio al emitir (config faltante, ya emitido, etc.)."""


def _siguiente_correlativo(cursor, hid):
    cursor.execute("SELECT correlativo_boleta FROM sunat_config WHERE hospedaje_id = ?", (hid,))
    row = cursor.fetchone()
    actual = (row["correlativo_boleta"] if row else 0) or 0
    return actual + 1


def emitir_boleta(hid, factura, huesped, descripcion):
    """Emite una BOLETA para una factura ya pagada.

    factura:     objeto/fila con id, total.
    huesped:     dict con nombre, documento (DNI) opcional.
    descripcion: texto del concepto (ej. "Hospedaje Hab. 101 - 3 noche(s)").
    """
    config = obtener_config(hid)
    if not config.get("activo"):
        raise SunatError("La facturación SUNAT no está activada. Configúrala primero.")
    if not config.get("ruc") or not config.get("razon_social"):
        raise SunatError("Faltan datos del emisor (RUC y razón social).")

    conn = get_connection()
    try:
        cursor = conn.cursor()
        # ¿Ya hay un comprobante para esta factura?
        cursor.execute(
            "SELECT id, numero FROM comprobantes WHERE factura_id = ? AND hospedaje_id = ? AND estado != 'anulado'",
            (factura["id"], hid),
        )
        ya = cursor.fetchone()
        if ya:
            raise SunatError(f"Esta factura ya tiene la boleta {ya['numero']}.")

        correlativo = _siguiente_correlativo(cursor, hid)
        serie = config["serie_boleta"]
        numero = f"{serie}-{correlativo:08d}"
        fecha = datetime.now().strftime("%Y-%m-%d")

        # Datos del cliente: usa el tipo de documento real (DNI/CE/Pasaporte); si
        # no hay número, "sin documento" (válido en boleta).
        doc = (huesped.get("documento") or "").strip()
        if doc:
            cli_tipo = (huesped.get("tipo_documento") or "DNI").strip() or "DNI"
            cli_num = doc
        else:
            cli_tipo, cli_num = "SIN", "00000000"

        # IGV desglosado. En Perú el precio al consumidor es IGV-incluido, así que
        # el total ya trae el impuesto: base = total / 1.18, IGV = total - base.
        total = round(factura["total"] or 0, 2)
        op_gravada = round(total / 1.18, 2)
        igv = round(total - op_gravada, 2)

        comp = {
            "hospedaje_id": hid,
            "factura_id": factura["id"],
            "tipo": "boleta",
            "serie": serie,
            "correlativo": correlativo,
            "numero": numero,
            "fecha_emision": fecha,
            "moneda": "PEN",
            "cliente_tipo_doc": cli_tipo,
            "cliente_num_doc": cli_num,
            "cliente_nombre": huesped.get("nombre") or "Cliente",
            "op_gravada": op_gravada,
            "igv": igv,
            "total": total,
            "modo": config["modo"],
        }

        # Emitir por el adaptador correspondiente.
        emisor = obtener_emisor(config)
        resultado = emisor.emitir(comp, config)

        # Generar la representación impresa (PDF).
        pdf_path = generar_boleta_pdf(comp, config, descripcion, resultado.get("hash", ""))

        # Guardar el comprobante.
        cursor.execute(
            """
            INSERT INTO comprobantes
                (hospedaje_id, factura_id, tipo, serie, correlativo, numero, fecha_emision,
                 moneda, cliente_tipo_doc, cliente_num_doc, cliente_nombre, op_gravada, igv,
                 total, estado, modo, hash, mensaje, pdf_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (hid, factura["id"], "boleta", serie, correlativo, numero, fecha, "PEN",
             cli_tipo, cli_num, comp["cliente_nombre"], comp["op_gravada"], comp["igv"],
             comp["total"], resultado.get("estado", "aceptado"), config["modo"],
             resultado.get("hash", ""), resultado.get("mensaje", ""), pdf_path),
        )
        nuevo_id = cursor.lastrowid
        # Avanzar el correlativo del hospedaje.
        cursor.execute(
            "UPDATE sunat_config SET correlativo_boleta = ? WHERE hospedaje_id = ?",
            (correlativo, hid),
        )
        conn.commit()
    finally:
        conn.close()

    return {**comp, "id": nuevo_id, "estado": resultado.get("estado", "aceptado"),
            "mensaje": resultado.get("mensaje", ""), "pdf_path": pdf_path}


# --------------------------------------------------------------------------- #
#  Representación impresa (PDF) de la boleta — modo sandbox
# --------------------------------------------------------------------------- #
def generar_boleta_pdf(comp, config, descripcion, hash_demo, ruta_destino=None):
    """Genera el PDF (representación impresa) de la boleta. En sandbox lleva una
    nota de DEMO sin valor tributario."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm

    if ruta_destino is None:
        if not os.path.exists("comprobantes"):
            os.makedirs("comprobantes")
        ruta_destino = f"comprobantes/{_sanitize_filename(comp['numero'])}.pdf"

    c = canvas.Canvas(ruta_destino, pagesize=A4)
    width, height = A4

    # Encabezado del emisor.
    c.setFont("Helvetica-Bold", 14)
    c.drawString(2 * cm, height - 2 * cm, config.get("razon_social") or "Hospedaje")
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, height - 2.6 * cm, f"RUC: {config.get('ruc') or '-'}")
    if config.get("direccion"):
        c.drawString(2 * cm, height - 3.1 * cm, config["direccion"])

    # Recuadro del comprobante (derecha).
    c.setFont("Helvetica-Bold", 11)
    c.rect(width - 8 * cm, height - 3.4 * cm, 6 * cm, 2.2 * cm)
    c.drawCentredString(width - 5 * cm, height - 2.1 * cm, f"RUC {config.get('ruc') or '-'}")
    c.drawCentredString(width - 5 * cm, height - 2.7 * cm, "BOLETA DE VENTA ELECTRÓNICA")
    c.drawCentredString(width - 5 * cm, height - 3.2 * cm, comp["numero"])

    c.line(2 * cm, height - 3.8 * cm, width - 2 * cm, height - 3.8 * cm)

    # Cliente.
    y = height - 4.6 * cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(2 * cm, y, "CLIENTE")
    c.setFont("Helvetica", 10)
    y -= 0.5 * cm
    c.drawString(2 * cm, y, f"Nombre: {comp['cliente_nombre']}")
    y -= 0.5 * cm
    doc_lbl = comp["cliente_tipo_doc"] if comp["cliente_tipo_doc"] != "SIN" else "Doc."
    c.drawString(2 * cm, y, f"{doc_lbl}: {comp['cliente_num_doc']}")
    y -= 0.5 * cm
    c.drawString(2 * cm, y, f"Fecha de emisión: {comp['fecha_emision']}")

    # Detalle.
    y -= 1 * cm
    c.line(2 * cm, y, width - 2 * cm, y)
    y -= 0.5 * cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(2 * cm, y, "Descripción")
    c.drawRightString(width - 2 * cm, y, "Importe")
    y -= 0.4 * cm
    c.line(2 * cm, y, width - 2 * cm, y)
    y -= 0.6 * cm
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, y, descripcion or "Servicio de hospedaje")
    c.drawRightString(width - 2 * cm, y, f"S/ {comp['total']:.2f}")

    # Desglose de impuestos (IGV 18%).
    op_gravada = comp.get("op_gravada", round((comp["total"] or 0) / 1.18, 2))
    igv = comp.get("igv", round((comp["total"] or 0) - op_gravada, 2))
    y -= 0.9 * cm
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 5.5 * cm, y, "Op. gravada:")
    c.drawRightString(width - 2 * cm, y, f"S/ {op_gravada:.2f}")
    y -= 0.5 * cm
    c.drawRightString(width - 5.5 * cm, y, "IGV (18%):")
    c.drawRightString(width - 2 * cm, y, f"S/ {igv:.2f}")

    # Total.
    y -= 0.7 * cm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - 2 * cm, y, f"TOTAL: S/ {comp['total']:.2f}")

    # Hash / pie.
    y -= 1.5 * cm
    c.setFont("Helvetica", 8)
    c.drawString(2 * cm, y, f"Código de seguridad: {hash_demo}")
    c.drawString(2 * cm, y - 0.4 * cm, "Representación impresa de la Boleta de Venta Electrónica.")

    # Marca de DEMO en sandbox.
    if comp.get("modo") != "produccion":
        c.setFont("Helvetica-Bold", 30)
        c.setFillGray(0.85)
        c.saveState()
        c.translate(width / 2, height / 2)
        c.rotate(30)
        c.drawCentredString(0, 0, "DEMO / SANDBOX")
        c.restoreState()
        c.setFillGray(0)
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(2 * cm, 2 * cm, "Documento de PRUEBA — sin valor tributario (modo sandbox).")

    c.save()
    return ruta_destino
