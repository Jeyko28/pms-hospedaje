"""
views/huespedes.py
Gestión de huéspedes: listado, agregar, editar, eliminar.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from modelos import Huesped
import sqlite3

class HuespedesPanel(ttk.Frame):
    def __init__(self, parent, app=None):
        super().__init__(parent)
        self.app = app
        self.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.crear_widgets()
        self.cargar_huespedes()

    def crear_widgets(self):
        # Toolbar
        toolbar = ttk.Frame(self)
        toolbar.pack(fill=tk.X, pady=5)
        ttk.Button(toolbar, text="➕ Nuevo huésped", command=self.nuevo_huesped).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="✏️ Editar", command=self.editar_huesped).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="❌ Eliminar", command=self.eliminar_huesped).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="🔄 Refrescar", command=self.cargar_huespedes).pack(side=tk.LEFT, padx=2)

        # Treeview
        columnas = ("ID", "Nombre", "Email", "Teléfono", "Documento")
        self.tree = ttk.Treeview(self, columns=columnas, show="headings", height=15)
        for col in columnas:
            self.tree.heading(col, text=col)
            self.tree.column(col, width=80 if col=="ID" else 150)
        self.tree.pack(fill=tk.BOTH, expand=True)

        # Barra de estado
        self.status_label = ttk.Label(self, text="", anchor=tk.W)
        self.status_label.pack(fill=tk.X, pady=(5,0))

    def cargar_huespedes(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        huespedes = Huesped.obtener_todos()
        for h in huespedes:
            self.tree.insert("", tk.END, values=(
                h.id, h.nombre, h.email or "", h.telefono or "", h.documento or ""
            ))
        self.status_label.config(text=f"{len(huespedes)} huéspedes cargados")

    def obtener_seleccionado(self):
        seleccion = self.tree.selection()
        if not seleccion:
            messagebox.showwarning("Sin selección", "Seleccione un huésped")
            return None
        valores = self.tree.item(seleccion[0])['values']
        if not valores:
            return None
        return int(valores[0])  # ID

    def nuevo_huesped(self):
        self._formulario_huesped()

    def editar_huesped(self):
        h_id = self.obtener_seleccionado()
        if not h_id:
            return
        huesped = Huesped.obtener_por_id(h_id)
        if huesped:
            self._formulario_huesped(huesped)

    def eliminar_huesped(self):
        h_id = self.obtener_seleccionado()
        if not h_id:
            return
        # Verificar si el huésped tiene reservas activas (no canceladas)
        conn = sqlite3.connect("pms_prueba.db")
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM reservas WHERE huesped_id = ? AND estado != 'Cancelada'", (h_id,))
        count = cursor.fetchone()[0]
        conn.close()
        if count > 0:
            messagebox.showerror("Error", f"No se puede eliminar el huésped porque tiene {count} reserva(s) activa(s).")
            return
        if messagebox.askyesno("Confirmar", "¿Eliminar este huésped permanentemente?"):
            huesped = Huesped(id=h_id)
            huesped.eliminar()
            self.cargar_huespedes()
            messagebox.showinfo("Eliminado", "Huésped eliminado.")

    def _formulario_huesped(self, huesped=None):
        ventana = tk.Toplevel(self.master)
        ventana.title("Editar huésped" if huesped else "Nuevo huésped")
        ventana.grab_set()
        ventana.resizable(False, False)

        frame = ttk.Frame(ventana, padding=10)
        frame.pack(fill=tk.BOTH, expand=True)

        campos = [
            ("Nombre:", "nombre"),
            ("Email:", "email"),
            ("Teléfono:", "telefono"),
            ("Documento:", "documento"),
            ("Dirección:", "direccion")
        ]
        entries = {}
        for i, (label, key) in enumerate(campos):
            ttk.Label(frame, text=label).grid(row=i, column=0, sticky=tk.W, pady=5)
            entry = ttk.Entry(frame, width=30)
            entry.grid(row=i, column=1, pady=5, padx=5)
            if huesped:
                valor = getattr(huesped, key, "")
                if valor:
                    entry.insert(0, valor)
            entries[key] = entry

        def guardar():
            datos = {}
            for key, entry in entries.items():
                datos[key] = entry.get().strip()
            if not datos["nombre"]:
                messagebox.showerror("Error", "El nombre es obligatorio")
                return
            if huesped:
                huesped.nombre = datos["nombre"]
                huesped.email = datos["email"]
                huesped.telefono = datos["telefono"]
                huesped.documento = datos["documento"]
                huesped.direccion = datos["direccion"]
                huesped.guardar()
                messagebox.showinfo("Éxito", "Huésped actualizado")
            else:
                nuevo = Huesped(
                    nombre=datos["nombre"],
                    email=datos["email"],
                    telefono=datos["telefono"],
                    documento=datos["documento"],
                    direccion=datos["direccion"]
                )
                nuevo.guardar()
                messagebox.showinfo("Éxito", "Huésped creado")
            ventana.destroy()
            self.cargar_huespedes()
            # Si existe el método de refrescar combos en reservas, se podría llamar
            if self.app and hasattr(self.app, 'refrescar_combos_huespedes'):
                self.app.refrescar_combos_huespedes()

        ttk.Button(frame, text="Guardar", command=guardar).grid(row=len(campos), column=0, columnspan=2, pady=10)