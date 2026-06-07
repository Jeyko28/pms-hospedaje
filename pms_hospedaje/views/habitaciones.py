"""
views/habitaciones.py
Módulo que contiene el frame para administrar habitaciones.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from modelos import Habitacion
from utils import formatear_moneda

class HabitacionesPanel(ttk.Frame):
    def __init__(self, parent, on_tema_cambiado=None):
        super().__init__(parent)
        self.on_tema_cambiado = on_tema_cambiado
        self.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.crear_widgets()
        self.cargar_habitaciones()

    def crear_widgets(self):
        toolbar = ttk.Frame(self)
        toolbar.pack(fill=tk.X, pady=5)
        ttk.Button(toolbar, text="➕ Nueva habitación", command=self.abrir_formulario).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="✏️ Editar", command=self.editar_habitacion).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="❌ Eliminar", command=self.eliminar_habitacion).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="🔄 Refrescar", command=self.cargar_habitaciones).pack(side=tk.LEFT, padx=2)

        # Columnas: añadimos "Estado Ocupación"
        columnas = ("ID", "Número", "Tipo", "Precio", "Estado Limpieza", "Estado Ocupación")
        self.tree = ttk.Treeview(self, columns=columnas, show="headings", height=15)
        for col in columnas:
            self.tree.heading(col, text=col)
            self.tree.column(col, width=80 if col == "ID" else 100)
        self.tree.column("Precio", width=80)
        self.tree.column("Estado Ocupación", width=120)
        self.tree.pack(fill=tk.BOTH, expand=True)

        # Frame para cambiar estado de limpieza
        frame_estado = ttk.Frame(self)
        frame_estado.pack(fill=tk.X, pady=5)
        ttk.Label(frame_estado, text="Cambiar estado de limpieza de la habitación seleccionada:").pack(side=tk.LEFT, padx=5)
        self.estado_var = tk.StringVar()
        combo_estados = ttk.Combobox(frame_estado, textvariable=self.estado_var, values=["Limpia", "Sucia", "Revisión"], state="readonly")
        combo_estados.pack(side=tk.LEFT, padx=5)
        ttk.Button(frame_estado, text="Aplicar", command=self.cambiar_estado_limpieza).pack(side=tk.LEFT, padx=5)

        self.status_label = ttk.Label(self, text="Listo", anchor=tk.W)
        self.status_label.pack(fill=tk.X, pady=(5,0))

    def cargar_habitaciones(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        habitaciones = Habitacion.obtener_todas(solo_activas=True)
        for hab in habitaciones:
            self.tree.insert("", tk.END, values=(
                hab.id, hab.numero, hab.tipo, formatear_moneda(hab.precio_base),
                hab.estado_limpieza, hab.estado   # nuevo campo
            ))
        self.status_label.config(text=f"{len(habitaciones)} habitaciones cargadas")

    def obtener_habitacion_seleccionada(self):
        seleccion = self.tree.selection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Por favor seleccione una habitación.")
            return None
        valores = self.tree.item(seleccion[0])['values']
        if not valores:
            return None
        return int(valores[0])

    def abrir_formulario(self, habitacion=None):
        ventana = tk.Toplevel(self.master)
        ventana.title("Editar habitación" if habitacion else "Nueva habitación")
        ventana.grab_set()
        ventana.resizable(False, False)

        frame = ttk.Frame(ventana, padding=10)
        frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frame, text="Número:").grid(row=0, column=0, sticky=tk.W, pady=5)
        entry_numero = ttk.Entry(frame, width=20)
        entry_numero.grid(row=0, column=1, pady=5)

        ttk.Label(frame, text="Tipo:").grid(row=1, column=0, sticky=tk.W, pady=5)
        entry_tipo = ttk.Entry(frame, width=20)
        entry_tipo.grid(row=1, column=1, pady=5)

        ttk.Label(frame, text="Precio base:").grid(row=2, column=0, sticky=tk.W, pady=5)
        entry_precio = ttk.Entry(frame, width=20)
        entry_precio.grid(row=2, column=1, pady=5)

        ttk.Label(frame, text="Estado limpieza:").grid(row=3, column=0, sticky=tk.W, pady=5)
        combo_estado = ttk.Combobox(frame, values=["Limpia", "Sucia", "Revisión"], state="readonly")
        combo_estado.grid(row=3, column=1, pady=5)

        ttk.Label(frame, text="Estado ocupación:").grid(row=4, column=0, sticky=tk.W, pady=5)
        combo_ocupacion = ttk.Combobox(frame, values=["disponible", "ocupada", "mantenimiento"], state="readonly")
        combo_ocupacion.grid(row=4, column=1, pady=5)

        if habitacion:
            entry_numero.insert(0, habitacion.numero)
            entry_tipo.insert(0, habitacion.tipo)
            entry_precio.insert(0, str(habitacion.precio_base))
            combo_estado.set(habitacion.estado_limpieza)
            combo_ocupacion.set(habitacion.estado)
        else:
            combo_estado.set("Limpia")
            combo_ocupacion.set("disponible")

        def guardar():
            numero = entry_numero.get().strip()
            tipo = entry_tipo.get().strip()
            try:
                precio = float(entry_precio.get())
            except ValueError:
                messagebox.showerror("Error", "El precio debe ser un número válido")
                return
            if not numero or not tipo:
                messagebox.showerror("Error", "Número y tipo son obligatorios")
                return
            estado_limpieza = combo_estado.get()
            estado_ocupacion = combo_ocupacion.get()
            if habitacion:
                habitacion.numero = numero
                habitacion.tipo = tipo
                habitacion.precio_base = precio
                habitacion.estado_limpieza = estado_limpieza
                habitacion.estado = estado_ocupacion
                habitacion.guardar()
                messagebox.showinfo("Éxito", "Habitación actualizada")
            else:
                nueva = Habitacion(numero=numero, tipo=tipo, precio_base=precio,
                                   estado_limpieza=estado_limpieza, estado=estado_ocupacion)
                nueva.guardar()
                messagebox.showinfo("Éxito", "Habitación creada")
            ventana.destroy()
            self.cargar_habitaciones()

        ttk.Button(frame, text="Guardar", command=guardar).grid(row=5, column=0, columnspan=2, pady=10)

    def editar_habitacion(self):
        hab_id = self.obtener_habitacion_seleccionada()
        if not hab_id:
            return
        hab = next((h for h in Habitacion.obtener_todas(solo_activas=True) if h.id == hab_id), None)
        if hab:
            self.abrir_formulario(hab)
        else:
            messagebox.showerror("Error", "No se encontró la habitación")

    def eliminar_habitacion(self):
        hab_id = self.obtener_habitacion_seleccionada()
        if not hab_id:
            return
        if messagebox.askyesno("Confirmar", "¿Eliminar esta habitación? Se perderán sus datos."):
            hab = Habitacion(id=hab_id)
            hab.eliminar()
            self.cargar_habitaciones()
            messagebox.showinfo("Eliminado", "Habitación eliminada")

    def cambiar_estado_limpieza(self):
        hab_id = self.obtener_habitacion_seleccionada()
        if not hab_id:
            return
        nuevo_estado = self.estado_var.get()
        if not nuevo_estado:
            messagebox.showwarning("Advertencia", "Seleccione un estado")
            return
        hab = next((h for h in Habitacion.obtener_todas(solo_activas=True) if h.id == hab_id), None)
        if hab:
            hab.cambiar_estado_limpieza(nuevo_estado)
            self.cargar_habitaciones()
            self.status_label.config(text=f"Estado de limpieza cambiado a {nuevo_estado}")