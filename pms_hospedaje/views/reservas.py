"""
views/reservas.py
Panel para gestionar reservas: calendario visual, lista de reservas, creación/edición.
Incluye selector de fechas con calendario emergente y actualización automática de Recepción.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime, timedelta, date
from modelos import Habitacion, Huesped, Reserva
from utils import formatear_moneda
import calendar
import sqlite3

class ReservasPanel(ttk.Frame):
    def __init__(self, parent, app=None, on_tema_cambiado=None):
        super().__init__(parent)
        self.app = app
        self.on_tema_cambiado = on_tema_cambiado
        self.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        hoy = date.today()
        self.current_year = hoy.year
        self.current_month = hoy.month
        self.dia_seleccionado = hoy.day
        self.dia_seleccionado_year = hoy.year
        self.dia_seleccionado_month = hoy.month

        self.reservas_dia_actual = []

        self.crear_widgets()
        self.cargar_datos_iniciales()
        self.actualizar_calendario()

    def crear_widgets(self):
        top_frame = ttk.Frame(self)
        top_frame.pack(fill=tk.X, pady=5)

        ttk.Button(top_frame, text="◀ Mes anterior", command=self.mes_anterior).pack(side=tk.LEFT, padx=2)
        self.lbl_mes_año = ttk.Label(top_frame, text="", font=('Arial', 12, 'bold'))
        self.lbl_mes_año.pack(side=tk.LEFT, expand=True)
        ttk.Button(top_frame, text="Mes siguiente ▶", command=self.mes_siguiente).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Hoy", command=self.ir_hoy).pack(side=tk.LEFT, padx=5)

        self.calendario_frame = ttk.Frame(self)
        self.calendario_frame.pack(fill=tk.BOTH, expand=True, pady=10)

        list_frame = ttk.LabelFrame(self, text="Reservas del día seleccionado")
        list_frame.pack(fill=tk.BOTH, expand=True, pady=5)

        self.lista_reservas = tk.Listbox(list_frame, height=6)
        self.lista_reservas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.lista_reservas.bind('<<ListboxSelect>>', self.on_seleccionar_reserva)

        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill=tk.X, pady=5)
        ttk.Button(btn_frame, text="➕ Nueva reserva", command=self.nueva_reserva).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="✏️ Editar reserva", command=self.editar_reserva).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="❌ Cancelar reserva", command=self.cancelar_reserva).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="🔄 Refrescar", command=self.actualizar_calendario).pack(side=tk.LEFT, padx=2)

        self.status_label = ttk.Label(self, text="Seleccione un día para ver reservas", anchor=tk.W)
        self.status_label.pack(fill=tk.X, pady=(5,0))

    def cargar_datos_iniciales(self):
        self.habitaciones = Habitacion.obtener_todas(solo_activas=True)
        self.huespedes = Huesped.obtener_todos()

    def mes_anterior(self):
        if self.current_month == 1:
            self.current_month = 12
            self.current_year -= 1
        else:
            self.current_month -= 1
        self.actualizar_calendario()

    def mes_siguiente(self):
        if self.current_month == 12:
            self.current_month = 1
            self.current_year += 1
        else:
            self.current_month += 1
        self.actualizar_calendario()

    def ir_hoy(self):
        hoy = date.today()
        self.current_year = hoy.year
        self.current_month = hoy.month
        self.dia_seleccionado = hoy.day
        self.dia_seleccionado_year = hoy.year
        self.dia_seleccionado_month = hoy.month
        self.actualizar_calendario()
        self.mostrar_reservas_dia(self.dia_seleccionado)

    def actualizar_calendario(self):
        for widget in self.calendario_frame.winfo_children():
            widget.destroy()

        nombre_mes = calendar.month_name[self.current_month]
        self.lbl_mes_año.config(text=f"{nombre_mes} {self.current_year}")

        dias_semana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        for i, dia in enumerate(dias_semana):
            lbl = ttk.Label(self.calendario_frame, text=dia, font=('Arial', 10, 'bold'))
            lbl.grid(row=0, column=i, padx=2, pady=2, sticky="nsew")

        fechas_ocupadas = self.obtener_reservas_del_mes()
        cal = calendar.monthcalendar(self.current_year, self.current_month)

        for semana_idx, semana in enumerate(cal):
            for dia_idx, dia in enumerate(semana):
                if dia == 0:
                    label = ttk.Label(self.calendario_frame, text="", relief="solid")
                    label.grid(row=semana_idx+1, column=dia_idx, sticky="nsew", padx=1, pady=1)
                else:
                    fecha_str = f"{self.current_year}-{self.current_month:02d}-{dia:02d}"
                    ocupado = fecha_str in fechas_ocupadas
                    bg_color = "#ffcccc" if ocupado else "#ccffcc"
                    hoy = date.today()
                    es_hoy = (self.current_year == hoy.year and self.current_month == hoy.month and dia == hoy.day)
                    es_seleccionado = (self.current_year == self.dia_seleccionado_year and
                                       self.current_month == self.dia_seleccionado_month and
                                       dia == self.dia_seleccionado)
                    label = tk.Label(self.calendario_frame, text=str(dia), bg=bg_color, fg="black",
                                     relief="solid" if es_hoy or es_seleccionado else "flat",
                                     borderwidth=2 if es_hoy or es_seleccionado else 1)
                    label.bind("<Button-1>", lambda e, d=dia: self.seleccionar_dia(d))
                    label.grid(row=semana_idx+1, column=dia_idx, sticky="nsew", padx=1, pady=1)

        for i in range(7):
            self.calendario_frame.columnconfigure(i, weight=1)
        for i in range(len(cal) + 1):
            self.calendario_frame.rowconfigure(i, weight=1)

    def seleccionar_dia(self, dia):
        self.dia_seleccionado = dia
        self.dia_seleccionado_year = self.current_year
        self.dia_seleccionado_month = self.current_month
        self.mostrar_reservas_dia(dia)
        self.actualizar_calendario()

    def obtener_reservas_del_mes(self):
        conn = sqlite3.connect("pms_prueba.db")
        cursor = conn.cursor()
        primer_dia = f"{self.current_year}-{self.current_month:02d}-01"
        ultimo_dia = f"{self.current_year}-{self.current_month:02d}-{calendar.monthrange(self.current_year, self.current_month)[1]}"
        cursor.execute('''
            SELECT fecha_entrada, fecha_salida FROM reservas
            WHERE estado != 'Cancelada'
            AND fecha_entrada <= ? AND fecha_salida >= ?
        ''', (ultimo_dia, primer_dia))
        rows = cursor.fetchall()
        conn.close()
        fechas_ocupadas = set()
        for entrada, salida in rows:
            start = datetime.strptime(entrada, "%Y-%m-%d")
            end = datetime.strptime(salida, "%Y-%m-%d")
            delta = end - start
            for i in range(delta.days):
                dia = start + timedelta(days=i)
                if dia.year == self.current_year and dia.month == self.current_month:
                    fechas_ocupadas.add(dia.strftime("%Y-%m-%d"))
        return fechas_ocupadas

    def mostrar_reservas_dia(self, dia):
        self.lista_reservas.delete(0, tk.END)
        self.reservas_dia_actual = []
        fecha = f"{self.current_year}-{self.current_month:02d}-{dia:02d}"
        conn = sqlite3.connect("pms_prueba.db")
        cursor = conn.cursor()
        cursor.execute('''
            SELECT r.id, h.nombre, hab.numero, r.fecha_entrada, r.fecha_salida, r.estado, r.creado_en
            FROM reservas r
            JOIN huespedes h ON r.huesped_id = h.id
            JOIN habitaciones hab ON r.habitacion_id = hab.id
            WHERE r.estado != 'Cancelada'
            AND r.fecha_entrada <= ? AND r.fecha_salida > ?
        ''', (fecha, fecha))
        rows = cursor.fetchall()
        conn.close()
        for row in rows:
            creado = row[6] if row[6] else "desconocido"
            if creado != "desconocido" and len(creado) > 10:
                creado = creado[:10]
            texto = f"Reserva #{row[0]} - {row[1]} - Hab. {row[2]} - {row[3]} a {row[4]} ({row[5]}) - Creada: {creado}"
            self.lista_reservas.insert(tk.END, texto)
            self.reservas_dia_actual.append({"id": row[0], "texto": texto})
        if rows:
            self.status_label.config(text=f"{len(rows)} reservas para el día {fecha}")
        else:
            self.status_label.config(text=f"No hay reservas para el día {fecha}")

    def on_seleccionar_reserva(self, event):
        pass

    def nueva_reserva(self):
        self._formulario_reserva()

    def editar_reserva(self):
        seleccion = self.lista_reservas.curselection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione una reserva de la lista")
            return
        idx = seleccion[0]
        if idx >= len(self.reservas_dia_actual):
            return
        reserva_id = self.reservas_dia_actual[idx]["id"]
        reserva = Reserva.obtener_por_id(reserva_id)
        if reserva:
            self._formulario_reserva(reserva)
        else:
            messagebox.showerror("Error", "Reserva no encontrada")

    def cancelar_reserva(self):
        seleccion = self.lista_reservas.curselection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione una reserva")
            return
        idx = seleccion[0]
        if idx >= len(self.reservas_dia_actual):
            return
        reserva_id = self.reservas_dia_actual[idx]["id"]
        reserva = Reserva.obtener_por_id(reserva_id)
        if reserva and reserva.estado != "Cancelada":
            if messagebox.askyesno("Cancelar reserva", f"¿Cancelar reserva #{reserva_id}?"):
                reserva.cancelar()
                self.actualizar_calendario()
                self.mostrar_reservas_dia(self.dia_seleccionado)
                # Refrescar recepción automáticamente
                if self.app and hasattr(self.app, 'refrescar_recepcion'):
                    self.app.refrescar_recepcion()
                messagebox.showinfo("Cancelada", "Reserva cancelada")
        else:
            messagebox.showinfo("Info", "La reserva ya está cancelada o no existe")

    def _selector_fecha(self, entry_destino):
        ventana_cal = tk.Toplevel(self.master)
        ventana_cal.title("Seleccionar fecha")
        ventana_cal.grab_set()
        ventana_cal.resizable(False, False)

        año_actual = date.today().year
        mes_actual = date.today().month

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

    def _formulario_reserva(self, reserva=None):
        ventana = tk.Toplevel(self.master)
        ventana.title("Nueva reserva" if reserva is None else "Editar reserva")
        ventana.grab_set()
        ventana.resizable(False, False)

        frame = ttk.Frame(ventana, padding=10)
        frame.pack(fill=tk.BOTH, expand=True)

        # Huésped
        ttk.Label(frame, text="Huésped:").grid(row=0, column=0, sticky=tk.W, pady=5)
        combo_huesped = ttk.Combobox(frame, state="readonly", width=30)
        combo_huesped.grid(row=0, column=1, pady=5)
        self.huespedes = Huesped.obtener_todos()
        huespedes_textos = [f"{h.id} - {h.nombre}" for h in self.huespedes]
        combo_huesped['values'] = huespedes_textos
        if reserva and reserva.huesped_id:
            for i, h in enumerate(self.huespedes):
                if h.id == reserva.huesped_id:
                    combo_huesped.current(i)
                    break

        def nuevo_huesped():
            ventana_huesped = tk.Toplevel(ventana)
            ventana_huesped.title("Nuevo huésped")
            ventana_huesped.grab_set()
            f2 = ttk.Frame(ventana_huesped, padding=10)
            f2.pack()
            ttk.Label(f2, text="Nombre:").grid(row=0, column=0)
            entry_nombre = ttk.Entry(f2, width=30)
            entry_nombre.grid(row=0, column=1)
            ttk.Label(f2, text="Email:").grid(row=1, column=0)
            entry_email = ttk.Entry(f2)
            entry_email.grid(row=1, column=1)
            ttk.Label(f2, text="Teléfono:").grid(row=2, column=0)
            entry_telefono = ttk.Entry(f2)
            entry_telefono.grid(row=2, column=1)
            ttk.Label(f2, text="Documento:").grid(row=3, column=0)
            entry_doc = ttk.Entry(f2)
            entry_doc.grid(row=3, column=1)
            def guardar_huesped():
                nombre = entry_nombre.get().strip()
                if not nombre:
                    messagebox.showerror("Error", "Nombre requerido")
                    return
                nuevo = Huesped(nombre=nombre, email=entry_email.get(), telefono=entry_telefono.get(),
                               documento=entry_doc.get())
                nuevo.guardar()
                self.huespedes = Huesped.obtener_todos()
                nuevos_textos = [f"{h.id} - {h.nombre}" for h in self.huespedes]
                combo_huesped['values'] = nuevos_textos
                for i, h in enumerate(self.huespedes):
                    if h.id == nuevo.id:
                        combo_huesped.current(i)
                        break
                ventana_huesped.destroy()
                messagebox.showinfo("Éxito", "Huésped creado")
            ttk.Button(f2, text="Guardar", command=guardar_huesped).grid(row=4, column=0, columnspan=2, pady=10)

        ttk.Button(frame, text="➕ Nuevo huésped", command=nuevo_huesped).grid(row=0, column=2, padx=5)

        # Habitación
        ttk.Label(frame, text="Habitación:").grid(row=1, column=0, sticky=tk.W, pady=5)
        combo_hab = ttk.Combobox(frame, state="readonly", width=20)
        combo_hab.grid(row=1, column=1, pady=5)
        habitaciones_textos = [f"{h.id} - {h.numero} ({h.tipo}) - {formatear_moneda(h.precio_base)}/noche" for h in self.habitaciones]
        combo_hab['values'] = habitaciones_textos
        if reserva:
            for i, h in enumerate(self.habitaciones):
                if h.id == reserva.habitacion_id:
                    combo_hab.current(i)
                    break

        # Fechas
        ttk.Label(frame, text="Fecha entrada (YYYY-MM-DD):").grid(row=2, column=0, sticky=tk.W, pady=5)
        entry_entrada = ttk.Entry(frame, width=15)
        entry_entrada.grid(row=2, column=1, pady=5)
        btn_cal_entrada = ttk.Button(frame, text="📅", command=lambda: self._selector_fecha(entry_entrada))
        btn_cal_entrada.grid(row=2, column=2, padx=2)

        ttk.Label(frame, text="Fecha salida (YYYY-MM-DD):").grid(row=3, column=0, sticky=tk.W, pady=5)
        entry_salida = ttk.Entry(frame, width=15)
        entry_salida.grid(row=3, column=1, pady=5)
        btn_cal_salida = ttk.Button(frame, text="📅", command=lambda: self._selector_fecha(entry_salida))
        btn_cal_salida.grid(row=3, column=2, padx=2)

        ttk.Label(frame, text="Notas:").grid(row=4, column=0, sticky=tk.W, pady=5)
        entry_notas = ttk.Entry(frame, width=40)
        entry_notas.grid(row=4, column=1, pady=5)

        if reserva:
            entry_entrada.insert(0, reserva.fecha_entrada)
            entry_salida.insert(0, reserva.fecha_salida)
            entry_notas.insert(0, reserva.notas or "")

        def guardar_reserva():
            if combo_huesped.current() == -1:
                messagebox.showerror("Error", "Seleccione un huésped")
                return
            if combo_hab.current() == -1:
                messagebox.showerror("Error", "Seleccione una habitación")
                return
            fecha_entrada = entry_entrada.get().strip()
            fecha_salida = entry_salida.get().strip()
            if not fecha_entrada or not fecha_salida:
                messagebox.showerror("Error", "Ingrese fechas")
                return
            try:
                fe = datetime.strptime(fecha_entrada, "%Y-%m-%d")
                fs = datetime.strptime(fecha_salida, "%Y-%m-%d")
                if fs <= fe:
                    messagebox.showerror("Error", "La fecha de salida debe ser posterior a la entrada")
                    return
            except ValueError:
                messagebox.showerror("Error", "Formato de fecha inválido. Use YYYY-MM-DD")
                return

            hab_id = int(habitaciones_textos[combo_hab.current()].split(" - ")[0])
            huesped_id = int(huespedes_textos[combo_huesped.current()].split(" - ")[0])

            reserva_id_excluir = reserva.id if reserva else None
            if not Reserva.verificar_disponibilidad(hab_id, fecha_entrada, fecha_salida, reserva_id_excluir):
                messagebox.showerror("Error", "La habitación no está disponible en esas fechas")
                return

            if reserva:
                reserva.huesped_id = huesped_id
                reserva.habitacion_id = hab_id
                reserva.fecha_entrada = fecha_entrada
                reserva.fecha_salida = fecha_salida
                reserva.notas = entry_notas.get()
                reserva.total = 0.0
                reserva.guardar()
                messagebox.showinfo("Éxito", "Reserva actualizada")
            else:
                nueva = Reserva(
                    huesped_id=huesped_id,
                    habitacion_id=hab_id,
                    fecha_entrada=fecha_entrada,
                    fecha_salida=fecha_salida,
                    notas=entry_notas.get(),
                    estado="Confirmada"
                )
                nueva.guardar()
                messagebox.showinfo("Éxito", f"Reserva creada. Total: {formatear_moneda(nueva.total)}")
            ventana.destroy()
            self.cargar_datos_iniciales()
            self.actualizar_calendario()
            self.mostrar_reservas_dia(self.dia_seleccionado)
            # Refrescar recepción automáticamente
            if self.app and hasattr(self.app, 'refrescar_recepcion'):
                self.app.refrescar_recepcion()

        ttk.Button(frame, text="Guardar reserva", command=guardar_reserva).grid(row=5, column=0, columnspan=3, pady=10)