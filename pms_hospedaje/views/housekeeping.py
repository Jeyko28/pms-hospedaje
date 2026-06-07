"""
views/housekeeping.py
Panel para gestionar tareas de limpieza por habitación.
Permite crear tareas, marcarlas como completadas, ver historial.
Cuando se crea una tarea pendiente, la habitación pasa a estado "Sucia".
Cuando se completa una tarea, la habitación pasa a estado "Limpia".
"""

import tkinter as tk
from tkinter import ttk, messagebox
import sqlite3
from modelos import TareaLimpieza, Habitacion
from datetime import date

class HousekeepingPanel(ttk.Frame):
    def __init__(self, parent, app=None, on_tema_cambiado=None):
        """
        parent: widget padre (normalmente el Notebook)
        app: referencia a la aplicación principal (PMSApp) para refrescar habitaciones
        """
        super().__init__(parent)
        self.app = app
        self.on_tema_cambiado = on_tema_cambiado
        self.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.crear_widgets()
        self.cargar_habitaciones_combo()
        self.mostrar_tareas_habitacion_actual()

    def crear_widgets(self):
        # Selección de habitación
        frame_hab = ttk.Frame(self)
        frame_hab.pack(fill=tk.X, pady=5)
        ttk.Label(frame_hab, text="Habitación:").pack(side=tk.LEFT, padx=5)
        self.combo_habitaciones = ttk.Combobox(frame_hab, state="readonly", width=15)
        self.combo_habitaciones.pack(side=tk.LEFT, padx=5)
        self.combo_habitaciones.bind("<<ComboboxSelected>>", lambda e: self.mostrar_tareas_habitacion_actual())

        # Botón para nueva tarea
        ttk.Button(frame_hab, text="📋 Nueva tarea de limpieza", command=self.nueva_tarea).pack(side=tk.LEFT, padx=10)

        # Treeview para tareas de la habitación seleccionada
        columnas = ("ID", "Fecha", "Estado", "Asignado a", "Notas")
        self.tree_tareas = ttk.Treeview(self, columns=columnas, show="headings", height=10)
        for col in columnas:
            self.tree_tareas.heading(col, text=col)
            self.tree_tareas.column(col, width=80 if col=="ID" else 120)
        self.tree_tareas.pack(fill=tk.BOTH, expand=True, pady=5)

        # Botones de acciones
        btn_frame = ttk.Frame(self)
        btn_frame.pack(fill=tk.X)
        ttk.Button(btn_frame, text="✅ Marcar tarea seleccionada como completada", command=self.completar_tarea).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="🗑️ Eliminar tarea", command=self.eliminar_tarea).pack(side=tk.LEFT, padx=5)

    def cargar_habitaciones_combo(self):
        """Carga el combo con las habitaciones activas."""
        habitaciones = Habitacion.obtener_todas(solo_activas=True)
        self.habitaciones_list = habitaciones
        self.combo_habitaciones['values'] = [f"{h.numero} - {h.tipo}" for h in habitaciones]
        if habitaciones:
            self.combo_habitaciones.current(0)

    def obtener_habitacion_seleccionada(self):
        """Retorna el objeto Habitacion seleccionado en el combo."""
        idx = self.combo_habitaciones.current()
        if idx >= 0 and idx < len(self.habitaciones_list):
            return self.habitaciones_list[idx]
        return None

    def mostrar_tareas_habitacion_actual(self):
        """Carga las tareas de la habitación seleccionada en el Treeview."""
        for item in self.tree_tareas.get_children():
            self.tree_tareas.delete(item)
        hab = self.obtener_habitacion_seleccionada()
        if not hab:
            return
        tareas = TareaLimpieza.obtener_por_habitacion(hab.id)
        for t in tareas:
            self.tree_tareas.insert("", tk.END, values=(
                t.id, t.fecha, t.estado, t.asignado_a, t.notas
            ))

    def nueva_tarea(self):
        """Crea una nueva tarea de limpieza para la habitación actual y pone la habitación como Sucia."""
        hab = self.obtener_habitacion_seleccionada()
        if not hab:
            messagebox.showwarning("Sin habitación", "Seleccione una habitación")
            return
        ventana = tk.Toplevel(self.master)
        ventana.title("Nueva tarea de limpieza")
        ventana.grab_set()
        ventana.resizable(False, False)
        frame = ttk.Frame(ventana, padding=10)
        frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frame, text=f"Habitación: {hab.numero}").grid(row=0, column=0, columnspan=2, pady=5)

        ttk.Label(frame, text="Fecha (YYYY-MM-DD):").grid(row=1, column=0, sticky=tk.W, pady=5)
        entry_fecha = ttk.Entry(frame, width=15)
        entry_fecha.insert(0, str(date.today()))
        entry_fecha.grid(row=1, column=1, pady=5)

        ttk.Label(frame, text="Asignado a:").grid(row=2, column=0, sticky=tk.W, pady=5)
        entry_asignado = ttk.Entry(frame, width=20)
        entry_asignado.grid(row=2, column=1, pady=5)

        ttk.Label(frame, text="Notas:").grid(row=3, column=0, sticky=tk.W, pady=5)
        entry_notas = ttk.Entry(frame, width=30)
        entry_notas.grid(row=3, column=1, pady=5)

        def guardar():
            fecha = entry_fecha.get().strip()
            if not fecha:
                messagebox.showerror("Error", "Fecha requerida")
                return
            # Crear y guardar la tarea
            tarea = TareaLimpieza(
                habitacion_id=hab.id,
                fecha=fecha,
                estado="Pendiente",
                asignado_a=entry_asignado.get(),
                notas=entry_notas.get()
            )
            tarea.guardar()
            # Cambiar estado de limpieza de la habitación a "Sucia"
            hab.cambiar_estado_limpieza("Sucia")
            # Refrescar la tabla de habitaciones en la pestaña principal
            if self.app and hasattr(self.app, 'actualizar_tabla_habitaciones'):
                self.app.actualizar_tabla_habitaciones()
            ventana.destroy()
            self.mostrar_tareas_habitacion_actual()
            messagebox.showinfo("Creado", "Tarea de limpieza agregada.\nLa habitación ahora está 'Sucia'.")

        ttk.Button(frame, text="Guardar", command=guardar).grid(row=4, column=0, columnspan=2, pady=10)

    def completar_tarea(self):
        """Marca la tarea seleccionada como completada y pone la habitación como Limpia."""
        seleccion = self.tree_tareas.selection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione una tarea")
            return
        valores = self.tree_tareas.item(seleccion[0])['values']
        tarea_id = valores[0]
        hab = self.obtener_habitacion_seleccionada()
        if not hab:
            return
        tareas = TareaLimpieza.obtener_por_habitacion(hab.id)
        tarea = next((t for t in tareas if t.id == tarea_id), None)
        if tarea:
            tarea.completar()
            # Cambiar estado de la habitación a "Limpia"
            hab.cambiar_estado_limpieza("Limpia")
            # Refrescar la pestaña de habitaciones
            if self.app and hasattr(self.app, 'actualizar_tabla_habitaciones'):
                self.app.actualizar_tabla_habitaciones()
            self.mostrar_tareas_habitacion_actual()
            messagebox.showinfo("Completada", "Tarea completada.\nLa habitación ahora está 'Limpia'.")

    def eliminar_tarea(self):
        """Elimina la tarea seleccionada (sin cambiar el estado de limpieza de la habitación)."""
        seleccion = self.tree_tareas.selection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione una tarea")
            return
        if not messagebox.askyesno("Confirmar", "¿Eliminar esta tarea permanentemente?"):
            return
        valores = self.tree_tareas.item(seleccion[0])['values']
        tarea_id = valores[0]
        conn = sqlite3.connect("pms_prueba.db")
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tareas_limpieza WHERE id = ?", (tarea_id,))
        conn.commit()
        conn.close()
        self.mostrar_tareas_habitacion_actual()
        messagebox.showinfo("Eliminada", "Tarea eliminada")