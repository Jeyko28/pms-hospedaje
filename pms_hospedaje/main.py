"""
main.py
Punto de entrada de la aplicación PMS Prueba.
Contiene la ventana principal con todas las pestañas.
"""

import tkinter as tk
from tkinter import ttk
import database
from views.habitaciones import HabitacionesPanel
from views.housekeeping import HousekeepingPanel
from views.reservas import ReservasPanel
from views.recepcion import RecepcionPanel
from views.reportes import ReportesPanel
from views.huespedes import HuespedesPanel
from utils import configurar_tema

class PMSApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PMS Prueba - Gestión de Hospedajes")
        self.root.geometry("1000x700")
        self.root.minsize(900, 600)

        database.crear_tablas()

        # Menú
        menubar = tk.Menu(root)
        root.config(menu=menubar)
        menu_tema = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="Tema", menu=menu_tema)
        menu_tema.add_command(label="Claro", command=lambda: self.cambiar_tema("claro"))
        menu_tema.add_command(label="Oscuro", command=lambda: self.cambiar_tema("oscuro"))

        self.notebook = ttk.Notebook(root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Pestañas
        self.tab_habitaciones = HabitacionesPanel(self.notebook)
        self.panel_habitaciones = self.tab_habitaciones

        self.tab_housekeeping = HousekeepingPanel(self.notebook, app=self)

        self.tab_reservas = ReservasPanel(self.notebook, app=self)

        self.tab_recepcion = RecepcionPanel(self.notebook, app=self)

        self.tab_reportes = ReportesPanel(self.notebook, app=self)

        self.tab_huespedes = HuespedesPanel(self.notebook, app=self)

        self.notebook.add(self.tab_habitaciones, text="🏨 Habitaciones")
        self.notebook.add(self.tab_housekeeping, text="🧹 Housekeeping")
        self.notebook.add(self.tab_reservas, text="📅 Reservas")
        self.notebook.add(self.tab_recepcion, text="🛎️ Recepción")
        self.notebook.add(self.tab_reportes, text="📊 Reportes")
        self.notebook.add(self.tab_huespedes, text="👥 Huéspedes")

        configurar_tema(self.root, "claro")

        self.status_bar = ttk.Label(self.root, text="PMS Prueba - Listo", relief=tk.SUNKEN, anchor=tk.W)
        self.status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    def cambiar_tema(self, modo):
        configurar_tema(self.root, modo)

    def actualizar_tabla_habitaciones(self):
        if hasattr(self.panel_habitaciones, 'cargar_habitaciones'):
            self.panel_habitaciones.cargar_habitaciones()
            self.status_bar.config(text="Lista de habitaciones actualizada")

    def refrescar_recepcion(self):
        if hasattr(self, 'tab_recepcion') and hasattr(self.tab_recepcion, 'refrescar_listas'):
            self.tab_recepcion.refrescar_listas()
            self.status_bar.config(text="Recepción actualizada")

    def refrescar_calendario_reservas(self):
        """Refresca el calendario y la lista del día en la pestaña Reservas."""
        if hasattr(self, 'tab_reservas'):
            if hasattr(self.tab_reservas, 'actualizar_calendario'):
                self.tab_reservas.actualizar_calendario()
            if hasattr(self.tab_reservas, 'mostrar_reservas_dia'):
                # Mantener el día seleccionado actual (o el día de hoy)
                dia = getattr(self.tab_reservas, 'dia_seleccionado', None)
                if dia is not None:
                    self.tab_reservas.mostrar_reservas_dia(dia)
            self.status_bar.config(text="Calendario de reservas actualizado")

    def refrescar_combos_huespedes(self):
        if hasattr(self, 'tab_reservas') and hasattr(self.tab_reservas, 'cargar_datos_iniciales'):
            self.tab_reservas.cargar_datos_iniciales()

if __name__ == "__main__":
    root = tk.Tk()
    app = PMSApp(root)
    root.mainloop()
