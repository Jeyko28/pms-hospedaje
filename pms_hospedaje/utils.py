"""
utils.py
Funciones auxiliares: cambio de tema (app de escritorio), formateo de moneda
y generación de facturas PDF.

Nota: tkinter solo existe en la app de escritorio. En el servidor web (la API
en la nube) no está disponible, así que su importación es OPCIONAL: si falla,
las funciones de tema quedan inactivas, pero el resto (moneda, PDF) funciona.
"""

import os
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm

try:
    import tkinter as tk
    from tkinter import ttk
    _HAY_TKINTER = True
except ImportError:
    # Entorno sin interfaz gráfica (servidor). Las funciones de tema no se usan.
    tk = None
    ttk = None
    _HAY_TKINTER = False

# Paletas de colores
TEMA_CLARO = {
    "bg": "#f0f0f0",
    "fg": "#000000",
    "entry_bg": "#ffffff",
    "button_bg": "#e1e1e1",
    "frame_bg": "#f9f9f9",
    "tree_bg": "#ffffff",
    "tree_fg": "#000000",
    "select_bg": "#0078d7",
    "select_fg": "#ffffff"
}

TEMA_OSCURO = {
    "bg": "#2b2b2b",
    "fg": "#ffffff",
    "entry_bg": "#3c3f41",
    "button_bg": "#4a4a4a",
    "frame_bg": "#3a3a3a",
    "tree_bg": "#3c3f41",
    "tree_fg": "#ffffff",
    "select_bg": "#264f78",
    "select_fg": "#ffffff"
}

tema_actual = "claro"

def aplicar_tema(widget, tema_dict):
    try:
        widget.config(bg=tema_dict["bg"], fg=tema_dict["fg"])
    except:
        pass
    try:
        if hasattr(widget, "config") and "background" in widget.config():
            widget.config(background=tema_dict["entry_bg"])
        if hasattr(widget, "config") and "foreground" in widget.config():
            widget.config(foreground=tema_dict["fg"])
    except:
        pass
    for child in widget.winfo_children():
        aplicar_tema(child, tema_dict)

def configurar_tema(ventana, modo):
    global tema_actual
    tema_actual = modo
    tema = TEMA_CLARO if modo == "claro" else TEMA_OSCURO
    ventana.config(bg=tema["bg"])
    style = ttk.Style()
    style.theme_use('clam')
    style.configure("TFrame", background=tema["frame_bg"])
    style.configure("TLabel", background=tema["bg"], foreground=tema["fg"])
    style.configure("TButton", background=tema["button_bg"], foreground=tema["fg"])
    style.map("TButton", background=[("active", tema["button_bg"])])
    style.configure("Treeview", background=tema["tree_bg"], foreground=tema["tree_fg"],
                    fieldbackground=tema["tree_bg"])
    style.map("Treeview", background=[("selected", tema["select_bg"])],
              foreground=[("selected", tema["select_fg"])])
    style.configure("TEntry", fieldbackground=tema["entry_bg"], foreground=tema["fg"])
    aplicar_tema(ventana, tema)

def formatear_moneda(valor):
    """Convierte un número a formato de moneda (ej: $45.00)."""
    return f"${valor:.2f}"

def generar_factura_pdf(factura, estancia, huesped, habitacion, reserva, ruta_destino=None):
    """
    Genera un PDF de factura.
    Retorna la ruta del archivo generado.
    """
    if ruta_destino is None:
        # Crear carpeta facturas si no existe
        if not os.path.exists("facturas"):
            os.makedirs("facturas")
        ruta_destino = f"facturas/factura_{factura.id}_{huesped.nombre.replace(' ', '_')}.pdf"

    c = canvas.Canvas(ruta_destino, pagesize=A4)
    width, height = A4

    # Datos del hospedaje
    hospedaje_nombre = "Mi Pequeño Hospedaje"
    hospedaje_direccion = "Calle Ejemplo 123, Ciudad"
    hospedaje_telefono = "+123 456 789"

    # Encabezado
    c.setFont("Helvetica-Bold", 16)
    c.drawString(2*cm, height - 2*cm, hospedaje_nombre)
    c.setFont("Helvetica", 10)
    c.drawString(2*cm, height - 2.5*cm, hospedaje_direccion)
    c.drawString(2*cm, height - 3*cm, f"Tel: {hospedaje_telefono}")

    c.line(2*cm, height - 3.2*cm, width - 2*cm, height - 3.2*cm)

    # Título FACTURA
    c.setFont("Helvetica-Bold", 14)
    c.drawString(2*cm, height - 4*cm, f"FACTURA Nº {factura.id}")
    c.setFont("Helvetica", 10)
    c.drawString(2*cm, height - 4.5*cm, f"Fecha de emisión: {factura.fecha_emision}")

    # Datos del cliente
    c.drawString(2*cm, height - 5.5*cm, "DATOS DEL CLIENTE")
    c.setFont("Helvetica", 10)
    c.drawString(2*cm, height - 6*cm, f"Nombre: {huesped.nombre}")
    c.drawString(2*cm, height - 6.5*cm, f"Documento: {huesped.documento or 'No especificado'}")
    c.drawString(2*cm, height - 7*cm, f"Teléfono: {huesped.telefono or 'No especificado'}")
    c.drawString(2*cm, height - 7.5*cm, f"Email: {huesped.email or 'No especificado'}")

    # Detalle de la estancia
    c.drawString(2*cm, height - 8.5*cm, "DETALLE DE LA ESTANCIA")
    c.setFont("Helvetica", 10)
    c.drawString(2*cm, height - 9*cm, f"Habitación: {habitacion.numero} ({habitacion.tipo})")
    c.drawString(2*cm, height - 9.5*cm, f"Check-in: {estancia.fecha_checkin}")
    c.drawString(2*cm, height - 10*cm, f"Check-out: {estancia.fecha_checkout_real or estancia.fecha_checkout_esperado}")
    fecha_checkout = estancia.fecha_checkout_real or estancia.fecha_checkout_esperado
    noches = (datetime.strptime(fecha_checkout, "%Y-%m-%d") - datetime.strptime(estancia.fecha_checkin, "%Y-%m-%d")).days
    c.drawString(2*cm, height - 10.5*cm, f"Noches: {noches}")

    # Línea de productos
    y = height - 11.5*cm
    c.line(2*cm, y, width - 2*cm, y)
    y -= 0.5*cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(2*cm, y, "Concepto")
    c.drawString(10*cm, y, "Precio/noche")
    c.drawString(14*cm, y, "Total")
    y -= 0.5*cm
    c.line(2*cm, y, width - 2*cm, y)
    y -= 0.5*cm
    c.setFont("Helvetica", 10)
    c.drawString(2*cm, y, f"Habitación {habitacion.numero} ({habitacion.tipo})")
    c.drawString(10*cm, y, f"{habitacion.precio_base:.2f}")
    c.drawString(14*cm, y, f"{factura.subtotal:.2f}")
    y -= 1*cm
    c.line(2*cm, y, width - 2*cm, y)
    y -= 0.5*cm
    c.drawString(12*cm, y, "SUBTOTAL:")
    c.drawString(16*cm, y, f"{factura.subtotal:.2f}")
    y -= 0.6*cm
    # Línea de descuento/cortesía (solo si se aplicó alguno).
    descuento = getattr(factura, "descuento", 0) or 0
    if descuento > 0:
        etiqueta = "DESCUENTO:"
        motivo = getattr(factura, "descuento_motivo", "") or ""
        if motivo:
            etiqueta = f"DESCUENTO ({motivo}):"
        c.drawString(12*cm, y, etiqueta)
        c.drawString(16*cm, y, f"-{descuento:.2f}")
        y -= 0.6*cm
    c.drawString(12*cm, y, "IMPUESTOS (0%):")
    c.drawString(16*cm, y, f"{factura.impuestos:.2f}")
    y -= 0.6*cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(12*cm, y, "TOTAL:")
    c.drawString(16*cm, y, f"{factura.total:.2f}")

    # Pie de página
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(2*cm, 2*cm, "Gracias por su visita. Este documento es un comprobante de pago.")

    c.save()
    return ruta_destino