"""
views/recepcion.py
Panel para realizar check-in, check-out, extender estancias y gestionar pagos parciales.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime
from modelos import (Reserva, Estancia, Factura, Pago, Habitacion, Huesped)
from utils import formatear_moneda, generar_factura_pdf
from database import get_connection
import re
import calendar

class RecepcionPanel(ttk.Frame):
    def __init__(self, parent, app=None):
        super().__init__(parent)
        self.app = app
        self.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.crear_widgets()
        self.refrescar_listas()

    def crear_widgets(self):
        # Frame izquierdo: Reservas confirmadas
        frame_reservas = ttk.LabelFrame(self, text="Reservas Confirmadas (para Check-in)")
        frame_reservas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)

        self.lista_reservas = tk.Listbox(frame_reservas, height=20)
        self.lista_reservas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        ttk.Button(frame_reservas, text="🛎️ Hacer Check-in", command=self.hacer_checkin).pack(pady=5)

        # Frame derecho: Estancias activas
        frame_estancias = ttk.LabelFrame(self, text="Estancias Activas (Check-out pendiente)")
        frame_estancias.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=5)

        self.lista_estancias = tk.Listbox(frame_estancias, height=15)
        self.lista_estancias.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        btn_frame = ttk.Frame(frame_estancias)
        btn_frame.pack(pady=5)
        ttk.Button(btn_frame, text="🧾 Hacer Check-out", command=self.hacer_checkout).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="📅 Extender estancia", command=self.extender_estancia).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="💰 Pagos", command=self.gestionar_pagos).pack(side=tk.LEFT, padx=5)

        self.status_label = ttk.Label(self, text="Listo", anchor=tk.W)
        self.status_label.pack(side=tk.BOTTOM, fill=tk.X, pady=5)

    # ---------- Métodos auxiliares ----------
    def refrescar_listas(self):
        self.lista_reservas.delete(0, tk.END)
        self.lista_estancias.delete(0, tk.END)

        conn = get_connection()
        cursor = conn.cursor()

        # Reservas sin estancia activa
        cursor.execute('''
            SELECT r.id, h.nombre, hab.numero, r.fecha_entrada, r.fecha_salida, r.total
            FROM reservas r
            JOIN huespedes h ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.estado = 'Confirmada'
            AND NOT EXISTS (SELECT 1 FROM estancias e WHERE e.reserva_id = r.id)
            ORDER BY r.fecha_entrada
        ''')
        for row in cursor.fetchall():
            texto = f"Reserva #{row['id']} - {row['nombre']} - Hab.{row['numero']} - {row['fecha_entrada']} a {row['fecha_salida']} - Total: {formatear_moneda(row['total'])}"
            self.lista_reservas.insert(tk.END, texto)

        # Estancias activas con total actualizado (de la factura)
        cursor.execute('''
            SELECT e.id, h.nombre, hab.numero, e.fecha_checkin, e.fecha_checkout_esperado, 
                   COALESCE(f.total, 0) as total_actual
            FROM estancias e
            JOIN huespedes h ON e.huesped_id = h.id
            JOIN habitaciones hab ON e.habitacion_id = hab.id
            LEFT JOIN facturas f ON f.estancia_id = e.id
            WHERE e.estado = 'activa'
        ''')
        for row in cursor.fetchall():
            total = row['total_actual']
            texto = f"Estancia #{row['id']} - {row['nombre']} - Hab.{row['numero']} - Check-in: {row['fecha_checkin']} - Salida esp: {row['fecha_checkout_esperado']} - Total: {formatear_moneda(total)}"
            self.lista_estancias.insert(tk.END, texto)

        conn.close()
        self.status_label.config(text=f"Listo. {self.lista_reservas.size()} reservas pendientes, {self.lista_estancias.size()} estancias activas.")

    def obtener_estancia_seleccionada(self):
        seleccion = self.lista_estancias.curselection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione una estancia activa")
            return None
        linea = self.lista_estancias.get(seleccion[0])
        match = re.search(r'Estancia #(\d+)', linea)
        if not match:
            return None
        estancia_id = int(match.group(1))
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM estancias WHERE id = ?", (estancia_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return Estancia(
            id=row["id"], reserva_id=row["reserva_id"], huesped_id=row["huesped_id"],
            habitacion_id=row["habitacion_id"], fecha_checkin=row["fecha_checkin"],
            fecha_checkout_esperado=row["fecha_checkout_esperado"],
            fecha_checkout_real=row["fecha_checkout_real"], estado=row["estado"]
        )

    # ---------- Check-in ----------
    def hacer_checkin(self):
        seleccion = self.lista_reservas.curselection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione una reserva")
            return
        linea = self.lista_reservas.get(seleccion[0])
        match = re.search(r'Reserva #(\d+)', linea)
        if not match:
            return
        reserva_id = int(match.group(1))
        reserva = Reserva.obtener_por_id(reserva_id)
        if not reserva:
            messagebox.showerror("Error", "Reserva no encontrada")
            return

        hab = next((h for h in Habitacion.obtener_todas() if h.id == reserva.habitacion_id), None)
        if not hab or hab.estado == "ocupada":
            messagebox.showerror("Error", "La habitación ya está ocupada.")
            return

        hoy = datetime.now().strftime("%Y-%m-%d")
        estancia = Estancia(
            reserva_id=reserva.id,
            huesped_id=reserva.huesped_id,
            habitacion_id=reserva.habitacion_id,
            fecha_checkin=hoy,
            fecha_checkout_esperado=reserva.fecha_salida,
            estado="activa"
        )
        estancia.guardar()

        # Crear factura inicial (total aún no definitivo, se recalculará en checkout o extensiones)
        factura = Factura(
            estancia_id=estancia.id,
            huesped_id=reserva.huesped_id,
            fecha_emision=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            subtotal=reserva.total,
            impuestos=0.0,
            total=reserva.total,
            estado="pendiente",
            pdf_generado=0
        )
        factura.guardar()

        hab.cambiar_estado_ocupacion("ocupada")
        reserva.estado = "Check-in"
        reserva.guardar()

        messagebox.showinfo("Check-in realizado", f"Check-in de {hab.numero} completado.")
        self.refrescar_listas()
        if self.app:
            if hasattr(self.app, 'actualizar_tabla_habitaciones'):
                self.app.actualizar_tabla_habitaciones()
            if hasattr(self.app, 'refrescar_calendario_reservas'):
                self.app.refrescar_calendario_reservas()

    # ---------- Extender estancia ----------
    def extender_estancia(self):
        estancia = self.obtener_estancia_seleccionada()
        if not estancia:
            return

        reserva = Reserva.obtener_por_id(estancia.reserva_id)
        habitacion = next((h for h in Habitacion.obtener_todas() if h.id == estancia.habitacion_id), None)
        if not reserva or not habitacion:
            messagebox.showerror("Error", "No se pudieron recuperar los datos relacionados")
            return

        ventana = tk.Toplevel(self.master)
        ventana.title("Extender estancia")
        ventana.grab_set()
        ventana.resizable(False, False)

        frame = ttk.Frame(ventana, padding=10)
        frame.pack()

        ttk.Label(frame, text=f"Habitación: {habitacion.numero}").grid(row=0, column=0, columnspan=3, pady=5)
        ttk.Label(frame, text=f"Check-in actual: {estancia.fecha_checkin}").grid(row=1, column=0, columnspan=3, pady=5)
        ttk.Label(frame, text="Nueva fecha de salida:").grid(row=2, column=0, sticky=tk.W, pady=5)
        entry_fecha = ttk.Entry(frame, width=15)
        entry_fecha.grid(row=2, column=1, pady=5)
        ttk.Button(frame, text="📅", command=lambda: self._selector_fecha(entry_fecha)).grid(row=2, column=2, padx=5)

        def guardar_extension():
            nueva_salida = entry_fecha.get().strip()
            if not nueva_salida:
                messagebox.showerror("Error", "Seleccione una fecha")
                return
            try:
                nueva_fecha = datetime.strptime(nueva_salida, "%Y-%m-%d")
                checkin = datetime.strptime(estancia.fecha_checkin, "%Y-%m-%d")
                if nueva_fecha <= checkin:
                    messagebox.showerror("Error", "La nueva fecha de salida debe ser posterior al check-in")
                    return
            except ValueError:
                messagebox.showerror("Error", "Formato de fecha inválido. Use YYYY-MM-DD")
                return

            noches = (nueva_fecha - checkin).days
            if noches <= 0:
                noches = 1
            nuevo_total = noches * habitacion.precio_base

            # Actualizar estancia
            estancia.fecha_checkout_esperado = nueva_salida
            estancia.guardar()

            # Actualizar reserva
            reserva.fecha_salida = nueva_salida
            reserva.total = nuevo_total
            reserva.guardar()

            # Actualizar factura
            factura = Factura.obtener_por_estancia(estancia.id)
            if factura:
                factura.subtotal = nuevo_total
                factura.total = nuevo_total
                factura.guardar()
            else:
                factura = Factura(
                    estancia_id=estancia.id,
                    huesped_id=estancia.huesped_id,
                    fecha_emision=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    subtotal=nuevo_total,
                    impuestos=0.0,
                    total=nuevo_total,
                    estado="pendiente",
                    pdf_generado=0
                )
                factura.guardar()

            messagebox.showinfo("Extensión realizada", f"Estancia extendida hasta {nueva_salida}. Nuevo total: {formatear_moneda(nuevo_total)}")
            ventana.destroy()
            self.refrescar_listas()
            if self.app:
                if hasattr(self.app, 'actualizar_tabla_habitaciones'):
                    self.app.actualizar_tabla_habitaciones()
                if hasattr(self.app, 'refrescar_recepcion'):
                    self.app.refrescar_recepcion()
                if hasattr(self.app, 'refrescar_calendario_reservas'):
                    self.app.refrescar_calendario_reservas()

        ttk.Button(frame, text="Extender", command=guardar_extension).grid(row=3, column=0, columnspan=3, pady=10)

    # ---------- Gestión de pagos (nuevo) ----------
    def gestionar_pagos(self):
        estancia = self.obtener_estancia_seleccionada()
        if not estancia:
            return

        # Obtener factura asociada
        factura = Factura.obtener_por_estancia(estancia.id)
        if not factura:
            messagebox.showerror("Error", "No se encontró factura para esta estancia.")
            return

        # Obtener pagos ya registrados
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pagos WHERE factura_id = ? ORDER BY fecha", (factura.id,))
        pagos = cursor.fetchall()
        conn.close()

        total_pagado = sum(p['monto'] for p in pagos)
        saldo_pendiente = factura.total - total_pagado

        # Ventana de gestión
        ventana = tk.Toplevel(self.master)
        ventana.title(f"Gestión de Pagos - Estancia #{estancia.id}")
        ventana.grab_set()
        ventana.geometry("500x450")
        ventana.resizable(False, False)

        frame = ttk.Frame(ventana, padding=10)
        frame.pack(fill=tk.BOTH, expand=True)

        # Información de la estancia
        ttk.Label(frame, text=f"Estancia #{estancia.id}", font=('Arial', 12, 'bold')).grid(row=0, column=0, columnspan=2, pady=5)
        ttk.Label(frame, text=f"Total factura: {formatear_moneda(factura.total)}").grid(row=1, column=0, sticky=tk.W)
        ttk.Label(frame, text=f"Pagado: {formatear_moneda(total_pagado)}").grid(row=2, column=0, sticky=tk.W)
        ttk.Label(frame, text=f"Saldo pendiente: {formatear_moneda(saldo_pendiente)}").grid(row=3, column=0, sticky=tk.W)

        # Lista de pagos realizados
        ttk.Label(frame, text="Historial de pagos:", font=('Arial', 10, 'bold')).grid(row=4, column=0, columnspan=2, sticky=tk.W, pady=(10,0))
        tree_pagos = ttk.Treeview(frame, columns=("fecha", "monto", "metodo", "ref"), show="headings", height=5)
        tree_pagos.heading("fecha", text="Fecha")
        tree_pagos.heading("monto", text="Monto")
        tree_pagos.heading("metodo", text="Método")
        tree_pagos.heading("ref", text="Referencia")
        tree_pagos.column("fecha", width=120)
        tree_pagos.column("monto", width=80)
        tree_pagos.column("metodo", width=80)
        tree_pagos.column("ref", width=100)
        tree_pagos.grid(row=5, column=0, columnspan=2, pady=5, sticky="nsew")

        for p in pagos:
            tree_pagos.insert("", tk.END, values=(p['fecha'][:16], formatear_moneda(p['monto']), p['metodo'], p['referencia'] or ""))

        # Frame para nuevo pago
        ttk.Label(frame, text="Registrar nuevo pago:", font=('Arial', 10, 'bold')).grid(row=6, column=0, columnspan=2, sticky=tk.W, pady=(10,0))
        ttk.Label(frame, text="Monto:").grid(row=7, column=0, sticky=tk.W, pady=5)
        entry_monto = ttk.Entry(frame, width=15)
        entry_monto.grid(row=7, column=1, sticky=tk.W, padx=5)
        entry_monto.insert(0, str(saldo_pendiente) if saldo_pendiente > 0 else "0")

        ttk.Label(frame, text="Método:").grid(row=8, column=0, sticky=tk.W, pady=5)
        combo_metodo = ttk.Combobox(frame, values=["efectivo", "tarjeta", "transferencia", "yape", "plin"], state="readonly")
        combo_metodo.current(0)
        combo_metodo.grid(row=8, column=1, sticky=tk.W, padx=5)

        ttk.Label(frame, text="Referencia (opcional):").grid(row=9, column=0, sticky=tk.W, pady=5)
        entry_ref = ttk.Entry(frame, width=20)
        entry_ref.grid(row=9, column=1, sticky=tk.W, padx=5)

        def actualizar_interfaz():
            # Recargar pagos y actualizar ventana
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM pagos WHERE factura_id = ? ORDER BY fecha", (factura.id,))
            nuevos_pagos = cursor.fetchall()
            conn.close()
            total_pagado = sum(p['monto'] for p in nuevos_pagos)
            saldo = factura.total - total_pagado
            # Actualizar etiquetas
            for widget in frame.grid_slaves():
                if int(widget.grid_info()["row"]) == 2:
                    widget.config(text=f"Pagado: {formatear_moneda(total_pagado)}")
                if int(widget.grid_info()["row"]) == 3:
                    widget.config(text=f"Saldo pendiente: {formatear_moneda(saldo)}")
            # Refrescar tree
            for item in tree_pagos.get_children():
                tree_pagos.delete(item)
            for p in nuevos_pagos:
                tree_pagos.insert("", tk.END, values=(p['fecha'][:16], formatear_moneda(p['monto']), p['metodo'], p['referencia'] or ""))
            entry_monto.delete(0, tk.END)
            entry_monto.insert(0, str(saldo) if saldo > 0 else "0")
            # Actualizar estado de la factura si está pagada
            if saldo <= 0 and factura.estado != "pagada":
                factura.estado = "pagada"
                factura.guardar()
                messagebox.showinfo("Pagado", "La factura ha sido pagada completamente.")
                ventana.destroy()  # Cerramos ventana porque ya no hay saldo
            else:
                # Si hay saldo positivo y factura estaba pagada, volver a pendiente
                if saldo > 0 and factura.estado == "pagada":
                    factura.estado = "pendiente"
                    factura.guardar()

        def registrar_pago():
            try:
                monto = float(entry_monto.get())
            except ValueError:
                messagebox.showerror("Error", "Monto inválido")
                return
            if monto <= 0:
                messagebox.showerror("Error", "El monto debe ser mayor a cero")
                return
            metodo = combo_metodo.get()
            ref = entry_ref.get().strip()
            pago = Pago(
                factura_id=factura.id,
                monto=monto,
                metodo=metodo,
                fecha=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                referencia=ref
            )
            pago.guardar()
            actualizar_interfaz()
            # Refrescar lista de estancias en recepción (para actualizar el total mostrado)
            self.refrescar_listas()
            if self.app and hasattr(self.app, 'refrescar_recepcion'):
                self.app.refrescar_recepcion()

        ttk.Button(frame, text="Registrar pago", command=registrar_pago).grid(row=10, column=0, columnspan=2, pady=10)

        # Botón para cerrar
        ttk.Button(frame, text="Cerrar", command=ventana.destroy).grid(row=11, column=0, columnspan=2, pady=5)

        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(5, weight=1)

    # ---------- Check-out (modificado para verificar saldo) ----------
    def hacer_checkout(self):
        seleccion = self.lista_estancias.curselection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione una estancia activa")
            return
        linea = self.lista_estancias.get(seleccion[0])
        match = re.search(r'Estancia #(\d+)', linea)
        if not match:
            return
        estancia_id = int(match.group(1))

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM estancias WHERE id = ?", (estancia_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            messagebox.showerror("Error", "Estancia no encontrada")
            return

        estancia = Estancia(
            id=row["id"], reserva_id=row["reserva_id"], huesped_id=row["huesped_id"],
            habitacion_id=row["habitacion_id"], fecha_checkin=row["fecha_checkin"],
            fecha_checkout_esperado=row["fecha_checkout_esperado"],
            fecha_checkout_real=row["fecha_checkout_real"], estado=row["estado"]
        )

        reserva = Reserva.obtener_por_id(estancia.reserva_id)
        hab = next((h for h in Habitacion.obtener_todas() if h.id == estancia.habitacion_id), None)
        huesped = Huesped.obtener_por_id(estancia.huesped_id)
        if not hab or not huesped:
            messagebox.showerror("Error", "No se encontraron datos relacionados")
            return

        # Obtener factura y calcular saldo pendiente
        factura = Factura.obtener_por_estancia(estancia.id)
        if not factura:
            messagebox.showerror("Error", "No se encontró factura para esta estancia.")
            return

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(monto) as total FROM pagos WHERE factura_id = ?", (factura.id,))
        total_pagado = cursor.fetchone()['total'] or 0
        conn.close()
        saldo = factura.total - total_pagado

        if saldo > 0:
            # Preguntar si desea registrar el pago restante ahora
            if messagebox.askyesno("Saldo pendiente", f"El saldo pendiente es {formatear_moneda(saldo)}.\n¿Desea registrar el pago ahora?"):
                self.registrar_pago_rapido(factura, saldo, estancia, hab, huesped, reserva)
            else:
                # Cancelar checkout
                messagebox.showinfo("Check-out cancelado", "Primero debe registrar el pago pendiente.")
                return
        else:
            # Ya está pagado, proceder con checkout
            self.finalizar_checkout(estancia, hab, reserva, factura)

    def registrar_pago_rapido(self, factura, saldo, estancia, hab, huesped, reserva):
        """Ventana para registrar el pago restante antes de finalizar checkout."""
        ventana = tk.Toplevel(self.master)
        ventana.title("Registrar pago pendiente")
        ventana.grab_set()
        ventana.resizable(False, False)

        frame = ttk.Frame(ventana, padding=10)
        frame.pack()

        ttk.Label(frame, text=f"Saldo pendiente: {formatear_moneda(saldo)}").grid(row=0, column=0, columnspan=2, pady=5)
        ttk.Label(frame, text="Monto a pagar:").grid(row=1, column=0, sticky=tk.W)
        entry_monto = ttk.Entry(frame, width=15)
        entry_monto.grid(row=1, column=1, pady=5)
        entry_monto.insert(0, str(saldo))

        ttk.Label(frame, text="Método de pago:").grid(row=2, column=0, sticky=tk.W)
        combo_metodo = ttk.Combobox(frame, values=["efectivo", "tarjeta", "transferencia", "yape", "plin"], state="readonly")
        combo_metodo.current(0)
        combo_metodo.grid(row=2, column=1, pady=5)

        ttk.Label(frame, text="Referencia:").grid(row=3, column=0, sticky=tk.W)
        entry_ref = ttk.Entry(frame, width=20)
        entry_ref.grid(row=3, column=1, pady=5)

        def guardar_y_checkout():
            try:
                monto = float(entry_monto.get())
            except ValueError:
                messagebox.showerror("Error", "Monto inválido")
                return
            if monto <= 0 or monto > saldo:
                messagebox.showerror("Error", f"Monto debe ser entre 0 y {saldo}")
                return
            metodo = combo_metodo.get()
            ref = entry_ref.get().strip()
            pago = Pago(
                factura_id=factura.id,
                monto=monto,
                metodo=metodo,
                fecha=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                referencia=ref
            )
            pago.guardar()
            ventana.destroy()
            # Verificar si aún hay saldo (pago parcial)
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT SUM(monto) as total FROM pagos WHERE factura_id = ?", (factura.id,))
            total_pagado = cursor.fetchone()['total'] or 0
            conn.close()
            if total_pagado >= factura.total:
                factura.estado = "pagada"
                factura.guardar()
                self.finalizar_checkout(estancia, hab, reserva, factura)
            else:
                messagebox.showinfo("Pago registrado", f"Se registró {formatear_moneda(monto)}. Aún queda saldo pendiente.")
                # No finalizar checkout

        ttk.Button(frame, text="Pagar y continuar", command=guardar_y_checkout).grid(row=4, column=0, columnspan=2, pady=10)

    def finalizar_checkout(self, estancia, habitacion, reserva, factura):
        """Finaliza la estancia, libera habitación y genera factura PDF."""
        fecha_checkout_real = datetime.now().strftime("%Y-%m-%d")
        estancia.finalizar(fecha_checkout_real)
        habitacion.cambiar_estado_ocupacion("disponible")
        habitacion.cambiar_estado_limpieza("Sucia")
        reserva.estado = "Check-out"
        reserva.guardar()

        # Generar PDF final (si no se había generado o se quiere actualizar)
        huesped = Huesped.obtener_por_id(estancia.huesped_id)
        ruta_pdf = generar_factura_pdf(factura, estancia, huesped, habitacion, reserva)
        factura.pdf_generado = 1
        factura.guardar()

        messagebox.showinfo("Check-out completado", f"Check-out realizado.\nFactura final: {ruta_pdf}")
        self.refrescar_listas()
        if self.app:
            if hasattr(self.app, 'actualizar_tabla_habitaciones'):
                self.app.actualizar_tabla_habitaciones()
            if hasattr(self.app, 'refrescar_calendario_reservas'):
                self.app.refrescar_calendario_reservas()

    # ---------- Selector de fecha (calendario) ----------
    def _selector_fecha(self, entry_destino):
        ventana_cal = tk.Toplevel(self.master)
        ventana_cal.title("Seleccionar fecha")
        ventana_cal.grab_set()
        ventana_cal.resizable(False, False)

        año_actual = datetime.now().year
        mes_actual = datetime.now().month
        año_var = tk.IntVar(value=año_actual)
        mes_var = tk.IntVar(value=mes_actual)

        def actualizar_calendario():
            for widget in frame_cal.winfo_children():
                widget.destroy()
            ttk.Label(frame_cal, text=f"{calendar.month_name[mes_var.get()]} {año_var.get()}", font=('Arial', 10, 'bold')).grid(row=0, column=0, columnspan=7)
            dias = ["L", "M", "M", "J", "V", "S", "D"]
            for i, d in enumerate(dias):
                ttk.Label(frame_cal, text=d).grid(row=1, column=i)
            cal = calendar.monthcalendar(año_var.get(), mes_var.get())
            for r, semana in enumerate(cal):
                for c, dia in enumerate(semana):
                    if dia == 0:
                        lbl = ttk.Label(frame_cal, text="")
                    else:
                        lbl = tk.Label(frame_cal, text=str(dia), bg="white", relief="raised", borderwidth=1)
                        lbl.bind("<Button-1>", lambda e, d=dia: seleccionar_fecha(d))
                    lbl.grid(row=r+2, column=c, sticky="nsew", padx=1, pady=1)

        def seleccionar_fecha(dia):
            fecha_str = f"{año_var.get()}-{mes_var.get():02d}-{dia:02d}"
            entry_destino.delete(0, tk.END)
            entry_destino.insert(0, fecha_str)
            ventana_cal.destroy()

        def mes_anterior():
            if mes_var.get() == 1:
                mes_var.set(12)
                año_var.set(año_var.get() - 1)
            else:
                mes_var.set(mes_var.get() - 1)
            actualizar_calendario()

        def mes_siguiente():
            if mes_var.get() == 12:
                mes_var.set(1)
                año_var.set(año_var.get() + 1)
            else:
                mes_var.set(mes_var.get() + 1)
            actualizar_calendario()

        toolbar = ttk.Frame(ventana_cal)
        toolbar.pack(fill=tk.X, pady=5)
        ttk.Button(toolbar, text="◀", command=mes_anterior).pack(side=tk.LEFT, padx=5)
        ttk.Button(toolbar, text="▶", command=mes_siguiente).pack(side=tk.LEFT, padx=5)

        frame_cal = ttk.Frame(ventana_cal)
        frame_cal.pack(padx=10, pady=10)
        actualizar_calendario()