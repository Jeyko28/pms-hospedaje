"""
crear_superadmin.py
Crea (o actualiza) el usuario SUPER ADMIN del SaaS: el dueño del sistema,
que puede gestionar todos los hospedajes.

Uso:
    python crear_superadmin.py <usuario> <nombre> <password>

Ejemplo:
    python crear_superadmin.py jeyko "Jeyko Galan" MiClaveSegura123

En producción (Render), se puede ejecutar como un "one-off job" con la
variable DATABASE_URL apuntando a Neon. En local crea el superadmin en SQLite.
El superadmin no pertenece a ningún hospedaje (hospedaje_id = NULL).
"""

import sys
import database
import auth


def crear_superadmin(usuario, nombre, password):
    auth.crear_tabla_usuarios()  # asegura que la tabla exista
    if len(password) < 6:
        print("ERROR: la contraseña debe tener al menos 6 caracteres.")
        return
    conn = database.get_connection()
    try:
        cursor = conn.cursor()
        existente = auth.buscar_por_usuario(usuario)
        ph = auth.hashear_password(password)
        if existente:
            cursor.execute(
                "UPDATE usuarios SET nombre=?, password_hash=?, rol='superadmin', activo=1, hospedaje_id=NULL WHERE usuario=?",
                (nombre, ph, usuario),
            )
            print(f"Usuario '{usuario}' actualizado a superadmin.")
        else:
            cursor.execute(
                "INSERT INTO usuarios (usuario, nombre, password_hash, rol, hospedaje_id) VALUES (?, ?, ?, 'superadmin', NULL)",
                (usuario, nombre, ph),
            )
            print(f"Superadmin '{usuario}' creado.")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Uso: python crear_superadmin.py <usuario> <nombre> <password>")
        sys.exit(1)
    crear_superadmin(sys.argv[1], sys.argv[2], sys.argv[3])
