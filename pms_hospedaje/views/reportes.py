"""
views/reportes.py
Panel de reportes: ocupación diaria, gráfico de barras con redimensionamiento automático.
"""

import tkinter as tk
from tkinter import ttk
import calendar
import sqlite3
from datetime import datetime, date, timedelta
from modelos import Habitacion

class ReportesPanel(ttk.Frame):
    def __init__(self, parent, app=None):
        super().__init__(parent)
        self.app = app
        self.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        hoy = date.today()
        self.current_year = hoy.year
        self.current_month = hoy.month
        self.total_habitaciones = len(Habitacion.obtener_todas(solo_activas=True))
        self.porcentajes_actuales = []  # guardar para redibujar

        self.crear_widgets()
        self.actualizar_reporte()

    def crear_widgets(self):
        # Selector de mes/año
        top_frame = ttk.Frame(self)
        top_frame.pack(fill=tk.X, pady=5)

        ttk.Label(top_frame, text="Año:").pack(side=tk.LEFT, padx=5)
        self.combo_año = ttk.Combobox(top_frame, values=list(range(2023, 2031)), state="readonly", width=6)
        self.combo_año.current(self.current_year - 2023)
        self.combo_año.pack(side=tk.LEFT, padx=5)
        self.combo_año.bind("<<ComboboxSelected>>", lambda e: self.actualizar_reporte())

        ttk.Label(top_frame, text="Mes:").pack(side=tk.LEFT, padx=5)
        meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                 "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
        self.combo_mes = ttk.Combobox(top_frame, values=meses, state="readonly", width=12)
        self.combo_mes.current(self.current_month - 1)
        self.combo_mes.pack(side=tk.LEFT, padx=5)
        self.combo_mes.bind("<<ComboboxSelected>>", lambda e: self.actualizar_reporte())

        ttk.Button(top_frame, text="Actualizar", command=self.actualizar_reporte).pack(side=tk.LEFT, padx=10)

        # Frame para gráfico (canvas con scroll si es necesario, pero mejor redibujar)
        frame_grafico = ttk.LabelFrame(self, text="Ocupación por día (porcentaje)")
        frame_grafico.pack(fill=tk.BOTH, expand=True, pady=5)

        self.canvas = tk.Canvas(frame_grafico, bg="white", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        # Vincular evento de redimensionamiento
        self.canvas.bind("<Configure>", self.on_canvas_resize)

        # Tabla de detalle
        frame_tabla = ttk.LabelFrame(self, text="Detalle diario")
        frame_tabla.pack(fill=tk.BOTH, expand=True, pady=5)

        self.tree = ttk.Treeview(frame_tabla, columns=("dia", "total_hab", "ocupadas", "porcentaje"), show="headings", height=8)
        self.tree.heading("dia", text="Día")
        self.tree.heading("total_hab", text="Total Hab.")
        self.tree.heading("ocupadas", text="Ocupadas")
        self.tree.heading("porcentaje", text="% Ocupación")
        self.tree.column("dia", width=80, anchor="center")
        self.tree.column("total_hab", width=100, anchor="center")
        self.tree.column("ocupadas", width=100, anchor="center")
        self.tree.column("porcentaje", width=100, anchor="center")
        self.tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.label_resumen = ttk.Label(self, text="", anchor=tk.CENTER)
        self.label_resumen.pack(fill=tk.X, pady=5)

    def on_canvas_resize(self, event):
        """Redibuja el gráfico cuando el canvas cambia de tamaño."""
        if self.porcentajes_actuales:
            self.dibujar_grafico(self.porcentajes_actuales)

    def actualizar_reporte(self):
        año = int(self.combo_año.get())
        mes = self.combo_mes.current() + 1
        _, num_dias = calendar.monthrange(año, mes)

        conn = sqlite3.connect("pms_prueba.db")
        cursor = conn.cursor()
        primer_dia = f"{año}-{mes:02d}-01"
        ultimo_dia = f"{año}-{mes:02d}-{num_dias}"
        cursor.execute('''
            SELECT fecha_entrada, fecha_salida, habitacion_id
            FROM reservas
            WHERE estado != 'Cancelada'
            AND fecha_entrada <= ? AND fecha_salida >= ?
        ''', (ultimo_dia, primer_dia))
        reservas = cursor.fetchall()
        conn.close()

        ocupadas_por_dia = [0] * num_dias

        for entrada, salida, hab_id in reservas:
            entrada_dt = datetime.strptime(entrada, "%Y-%m-%d")
            salida_dt = datetime.strptime(salida, "%Y-%m-%d")
            dia_actual = max(entrada_dt, datetime(año, mes, 1))
            ultimo_dia_mes = datetime(año, mes, num_dias)
            while dia_actual <= min(salida_dt - timedelta(days=1), ultimo_dia_mes):
                dia_idx = dia_actual.day - 1
                ocupadas_por_dia[dia_idx] += 1
                dia_actual += timedelta(days=1)

        porcentajes = []
        for ocupadas in ocupadas_por_dia:
            porc = (ocupadas / self.total_habitaciones) * 100 if self.total_habitaciones > 0 else 0
            porcentajes.append(porc)
        self.porcentajes_actuales = porcentajes

        # Actualizar tabla
        for row in self.tree.get_children():
            self.tree.delete(row)
        for i, porc in enumerate(porcentajes):
            dia = i + 1
            ocupadas = ocupadas_por_dia[i]
            self.tree.insert("", tk.END, values=(dia, self.total_habitaciones, ocupadas, f"{porc:.1f}%"))

        promedio = sum(porcentajes) / num_dias if num_dias > 0 else 0
        self.label_resumen.config(text=f"Promedio de ocupación del mes: {promedio:.1f}%")

        self.dibujar_grafico(porcentajes)

    def dibujar_grafico(self, porcentajes):
        """Dibuja barras verticales ajustándose al tamaño actual del canvas."""
        self.canvas.delete("all")
        if not porcentajes:
            return

        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        if w <= 1 or h <= 1:
            # Si el canvas aún no tiene tamaño, reintentar después de un breve tiempo
            self.after(50, lambda: self.dibujar_grafico(porcentajes))
            return

        num_dias = len(porcentajes)
        margen_izq = 40
        margen_der = 20
        margen_inf = 30
        margen_sup = 20
        ancho_disponible = w - margen_izq - margen_der
        alto_disponible = h - margen_sup - margen_inf

        if ancho_disponible <= 0 or alto_disponible <= 0:
            return

        bar_width = ancho_disponible / num_dias
        # Limitar ancho máximo de barra para que no se vea grotesco
        if bar_width > 30:
            bar_width = 30
            # Recalcular offset centralizado
            total_barras_ancho = bar_width * num_dias
            margen_izq = (w - total_barras_ancho) / 2
            ancho_disponible = total_barras_ancho

        base_y = h - margen_inf

        # Dibujar ejes
        self.canvas.create_line(margen_izq, base_y, w - margen_der, base_y, fill="black", width=2)
        self.canvas.create_line(margen_izq, margen_sup, margen_izq, base_y, fill="black", width=2)

        # Etiquetas de ejes
        self.canvas.create_text(margen_izq - 5, margen_sup + (alto_disponible//2), text="%", angle=90, anchor="center", font=("Arial", 9))
        self.canvas.create_text(w//2, base_y + 15, text="Día del mes", anchor="center", font=("Arial", 9))

        # Dibujar barras
        max_bar_height = alto_disponible
        for i, porc in enumerate(porcentajes):
            bar_height = (porc / 100) * max_bar_height
            x0 = margen_izq + i * bar_width
            x1 = x0 + bar_width - 1
            y0 = base_y - bar_height
            y1 = base_y
            if porc < 50:
                color = "#66cc66"
            elif porc < 80:
                color = "#ffaa33"
            else:
                color = "#ff6666"
            self.canvas.create_rectangle(x0, y0, x1, y1, fill=color, outline="black")
            # Mostrar número del día cada 3 días si hay muchos, sino todos
            if num_dias <= 31 and bar_width >= 8:
                self.canvas.create_text(x0 + bar_width/2, base_y + 3, text=str(i+1), font=("Arial", 7), anchor="n")

        # Líneas de referencia
        for ref, y_rel in [(25, 0.25), (50, 0.5), (75, 0.75)]:
            y = base_y - (y_rel * max_bar_height)
            if y > margen_sup:
                self.canvas.create_line(margen_izq, y, w - margen_der, y, fill="#cccccc", dash=(4,2))
                self.canvas.create_text(margen_izq - 3, y, text=f"{ref}%", anchor="e", font=("Arial", 8))