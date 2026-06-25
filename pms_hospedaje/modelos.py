"""
modelos.py
Define todas las clases del sistema.
"""

import sqlite3
from database import get_connection
from datetime import datetime

class Habitacion:
    def __init__(self, id=None, numero="", tipo="", precio_base=0.0,
                 estado_limpieza="Limpia", estado="disponible", activa=True,
                 hospedaje_id=None):
        self.id = id
        self.numero = numero
        self.tipo = tipo
        self.precio_base = precio_base
        self.estado_limpieza = estado_limpieza
        self.estado = estado          # 'disponible', 'ocupada', 'mantenimiento'
        self.activa = activa
        self.hospedaje_id = hospedaje_id

    @staticmethod
    def obtener_todas(solo_activas=True, hospedaje_id=None):
        # Multi-tenant: si se pasa hospedaje_id, solo trae las de ese hospedaje.
        # Si es None (app de escritorio), trae todas (comportamiento original).
        conn = get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM habitaciones"
        condiciones = []
        params = []
        if solo_activas:
            condiciones.append("activa = 1")
        if hospedaje_id is not None:
            condiciones.append("hospedaje_id = ?")
            params.append(hospedaje_id)
        if condiciones:
            query += " WHERE " + " AND ".join(condiciones)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        habitaciones = []
        for row in rows:
            habitaciones.append(Habitacion(
                id=row["id"],
                numero=row["numero"],
                tipo=row["tipo"],
                precio_base=row["precio_base"],
                estado_limpieza=row["estado_limpieza"],
                estado=row["estado"],
                activa=bool(row["activa"]),
                hospedaje_id=row["hospedaje_id"] if "hospedaje_id" in row.keys() else None,
            ))
        return habitaciones

    def guardar(self):
        conn = get_connection()
        cursor = conn.cursor()
        if self.id is None:
            # hospedaje_id: usa el asignado, o 1 por defecto (app de escritorio).
            hid = self.hospedaje_id if self.hospedaje_id is not None else 1
            cursor.execute('''
                INSERT INTO habitaciones (numero, tipo, precio_base, estado_limpieza, estado, activa, hospedaje_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (self.numero, self.tipo, self.precio_base, self.estado_limpieza, self.estado, self.activa, hid))
            self.id = cursor.lastrowid
            self.hospedaje_id = hid
        else:
            cursor.execute('''
                UPDATE habitaciones
                SET numero=?, tipo=?, precio_base=?, estado_limpieza=?, estado=?, activa=?
                WHERE id=?
            ''', (self.numero, self.tipo, self.precio_base, self.estado_limpieza, self.estado, self.activa, self.id))
        conn.commit()
        conn.close()

    def eliminar(self):
        if self.id is None:
            return
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM habitaciones WHERE id = ?", (self.id,))
        conn.commit()
        conn.close()
        self.id = None

    def cambiar_estado_limpieza(self, nuevo_estado):
        self.estado_limpieza = nuevo_estado
        self.guardar()

    def cambiar_estado_ocupacion(self, nuevo_estado):
        self.estado = nuevo_estado
        self.guardar()


class TareaLimpieza:
    def __init__(self, id=None, habitacion_id=None, fecha="", estado="Pendiente", asignado_a="", notas=""):
        self.id = id
        self.habitacion_id = habitacion_id
        self.fecha = fecha
        self.estado = estado
        self.asignado_a = asignado_a
        self.notas = notas

    @staticmethod
    def obtener_por_habitacion(habitacion_id):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM tareas_limpieza WHERE habitacion_id = ? ORDER BY fecha DESC
        ''', (habitacion_id,))
        rows = cursor.fetchall()
        conn.close()
        tareas = []
        for row in rows:
            tareas.append(TareaLimpieza(
                id=row["id"],
                habitacion_id=row["habitacion_id"],
                fecha=row["fecha"],
                estado=row["estado"],
                asignado_a=row["asignado_a"],
                notas=row["notas"]
            ))
        return tareas

    def guardar(self):
        conn = get_connection()
        cursor = conn.cursor()
        if self.id is None:
            cursor.execute('''
                INSERT INTO tareas_limpieza (habitacion_id, fecha, estado, asignado_a, notas)
                VALUES (?, ?, ?, ?, ?)
            ''', (self.habitacion_id, self.fecha, self.estado, self.asignado_a, self.notas))
            self.id = cursor.lastrowid
        else:
            cursor.execute('''
                UPDATE tareas_limpieza
                SET fecha=?, estado=?, asignado_a=?, notas=?
                WHERE id=?
            ''', (self.fecha, self.estado, self.asignado_a, self.notas, self.id))
        conn.commit()
        conn.close()

    def completar(self):
        self.estado = "Completada"
        self.guardar()


class Huesped:
    def __init__(self, id=None, nombre="", email="", telefono="", documento="", direccion="",
                 hospedaje_id=None, creado_en=None, tipo_documento="DNI"):
        # creado_en se acepta por compatibilidad con Huesped(**row); puede ignorarse.
        self.id = id
        self.nombre = nombre
        self.email = email
        self.telefono = telefono
        self.documento = documento
        self.direccion = direccion
        self.hospedaje_id = hospedaje_id
        self.tipo_documento = tipo_documento or "DNI"

    @staticmethod
    def obtener_todos(hospedaje_id=None):
        conn = get_connection()
        cursor = conn.cursor()
        if hospedaje_id is not None:
            cursor.execute("SELECT * FROM huespedes WHERE hospedaje_id = ? ORDER BY id", (hospedaje_id,))
        else:
            cursor.execute("SELECT * FROM huespedes ORDER BY id")
        rows = cursor.fetchall()
        conn.close()
        return [Huesped(**dict(row)) for row in rows]

    @staticmethod
    def obtener_por_id(id, hospedaje_id=None):
        conn = get_connection()
        cursor = conn.cursor()
        if hospedaje_id is not None:
            cursor.execute("SELECT * FROM huespedes WHERE id = ? AND hospedaje_id = ?", (id, hospedaje_id))
        else:
            cursor.execute("SELECT * FROM huespedes WHERE id = ?", (id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return Huesped(**dict(row))
        return None

    def guardar(self):
        conn = get_connection()
        cursor = conn.cursor()
        if self.id is None:
            hid = self.hospedaje_id if self.hospedaje_id is not None else 1
            cursor.execute('''
                INSERT INTO huespedes (nombre, email, telefono, documento, direccion, hospedaje_id, tipo_documento)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (self.nombre, self.email, self.telefono, self.documento, self.direccion, hid,
                  self.tipo_documento or "DNI"))
            self.id = cursor.lastrowid
            self.hospedaje_id = hid
        else:
            cursor.execute('''
                UPDATE huespedes
                SET nombre=?, email=?, telefono=?, documento=?, direccion=?, tipo_documento=?
                WHERE id=?
            ''', (self.nombre, self.email, self.telefono, self.documento, self.direccion,
                  self.tipo_documento or "DNI", self.id))
        conn.commit()
        conn.close()

    def eliminar(self):
        if self.id is None:
            return
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM huespedes WHERE id = ?", (self.id,))
        conn.commit()
        conn.close()


class Reserva:
    def __init__(self, id=None, huesped_id=None, habitacion_id=None, fecha_entrada="", fecha_salida="",
                 estado="Confirmada", total=0.0, notas="", creado_en=None, hospedaje_id=None,
                 origen="manual", grupo_id=None):
        self.id = id
        self.huesped_id = huesped_id
        self.habitacion_id = habitacion_id
        self.fecha_entrada = fecha_entrada
        self.fecha_salida = fecha_salida
        self.estado = estado
        self.total = total
        self.notas = notas
        self.creado_en = creado_en
        self.hospedaje_id = hospedaje_id
        self.origen = origen
        # grupo_id: identifica una reserva de grupo (varias habitaciones creadas
        # juntas). NULL en reservas individuales.
        self.grupo_id = grupo_id

    @staticmethod
    def obtener_todas(estado=None):
        conn = get_connection()
        cursor = conn.cursor()
        query = "SELECT * FROM reservas"
        params = []
        if estado:
            query += " WHERE estado = ?"
            params.append(estado)
        query += " ORDER BY fecha_entrada DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        reservas = []
        for row in rows:
            reservas.append(Reserva(
                id=row["id"],
                huesped_id=row["huesped_id"],
                habitacion_id=row["habitacion_id"],
                fecha_entrada=row["fecha_entrada"],
                fecha_salida=row["fecha_salida"],
                estado=row["estado"],
                total=row["total"],
                notas=row["notas"],
                creado_en=row["creado_en"],
                origen=row["origen"] if "origen" in row.keys() else "manual",
                grupo_id=row["grupo_id"] if "grupo_id" in row.keys() else None,
            ))
        return reservas

    @staticmethod
    def obtener_por_id(id, hospedaje_id=None):
        conn = get_connection()
        cursor = conn.cursor()
        if hospedaje_id is not None:
            cursor.execute("SELECT * FROM reservas WHERE id = ? AND hospedaje_id = ?", (id, hospedaje_id))
        else:
            cursor.execute("SELECT * FROM reservas WHERE id = ?", (id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return Reserva(
                id=row["id"],
                huesped_id=row["huesped_id"],
                habitacion_id=row["habitacion_id"],
                fecha_entrada=row["fecha_entrada"],
                fecha_salida=row["fecha_salida"],
                estado=row["estado"],
                total=row["total"],
                notas=row["notas"],
                creado_en=row["creado_en"],
                hospedaje_id=row["hospedaje_id"] if "hospedaje_id" in row.keys() else None,
                origen=row["origen"] if "origen" in row.keys() else "manual",
                grupo_id=row["grupo_id"] if "grupo_id" in row.keys() else None,
            )
        return None

    def guardar(self):
        if self.total == 0.0 and self.habitacion_id:
            habs = Habitacion.obtener_todas(solo_activas=True, hospedaje_id=self.hospedaje_id)
            hab = next((h for h in habs if h.id == self.habitacion_id), None)
            if hab:
                entrada = datetime.strptime(self.fecha_entrada, "%Y-%m-%d")
                salida = datetime.strptime(self.fecha_salida, "%Y-%m-%d")
                noches = (salida - entrada).days
                self.total = noches * hab.precio_base
        conn = get_connection()
        cursor = conn.cursor()
        if self.id is None:
            hid = self.hospedaje_id if self.hospedaje_id is not None else 1
            cursor.execute('''
                INSERT INTO reservas (huesped_id, habitacion_id, fecha_entrada, fecha_salida, estado, total, notas, hospedaje_id, origen, grupo_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (self.huesped_id, self.habitacion_id, self.fecha_entrada, self.fecha_salida, self.estado, self.total, self.notas, hid, self.origen or "manual", self.grupo_id))
            self.id = cursor.lastrowid
            self.hospedaje_id = hid
        else:
            cursor.execute('''
                UPDATE reservas
                SET huesped_id=?, habitacion_id=?, fecha_entrada=?, fecha_salida=?, estado=?, total=?, notas=?
                WHERE id=?
            ''', (self.huesped_id, self.habitacion_id, self.fecha_entrada, self.fecha_salida, self.estado, self.total, self.notas, self.id))
        conn.commit()
        conn.close()

    def cancelar(self):
        self.estado = "Cancelada"
        self.guardar()

    @staticmethod
    def verificar_disponibilidad(habitacion_id, fecha_entrada, fecha_salida, reserva_id_excluir=None):
        """Una habitacion esta libre en [entrada, salida) si NO hay:
          1) una reserva VIGENTE que se solape (Pendiente/Confirmada/Check-in;
             se excluyen Cancelada y Check-out: esas estadias ya terminaron y
             sus noches pueden re-venderse), NI
          2) una estancia ACTIVA que se solape (ocupacion fisica real).
        El (2) cubre el caso de un check-in adelantado o una estadia
        extendida, donde las fechas reales difieren de las de la reserva:
        si el huesped ya esta dentro, la habitacion no debe ofrecerse libre
        aunque su reserva diga otras fechas."""
        conn = get_connection()
        cursor = conn.cursor()

        # 1) Reservas vigentes que se solapan (no canceladas ni con check-out).
        query = '''
            SELECT COUNT(*) FROM reservas
            WHERE habitacion_id = ?
            AND estado NOT IN ('Cancelada', 'Check-out')
            AND fecha_entrada < ? AND fecha_salida > ?
        '''
        params = [habitacion_id, fecha_salida, fecha_entrada]
        if reserva_id_excluir:
            query += " AND id != ?"
            params.append(reserva_id_excluir)
        cursor.execute(query, params)
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False

        # 2) Estancias activas que se solapan (ocupacion fisica).
        query2 = '''
            SELECT COUNT(*) FROM estancias
            WHERE habitacion_id = ?
            AND estado = 'activa'
            AND fecha_checkin < ? AND fecha_checkout_esperado > ?
        '''
        params2 = [habitacion_id, fecha_salida, fecha_entrada]
        if reserva_id_excluir:
            query2 += " AND reserva_id != ?"
            params2.append(reserva_id_excluir)
        cursor.execute(query2, params2)
        if cursor.fetchone()[0] > 0:
            conn.close()
            return False

        # 3) Bloqueos (mantenimiento / uso propio) que se solapan. La tabla puede
        #    no existir en bases muy antiguas (pre-migración): si falla, se ignora.
        try:
            cursor.execute('''
                SELECT COUNT(*) FROM bloqueos
                WHERE habitacion_id = ?
                AND fecha_inicio < ? AND fecha_fin > ?
            ''', [habitacion_id, fecha_salida, fecha_entrada])
            bloqueada = cursor.fetchone()[0] > 0
        except Exception:
            bloqueada = False
        conn.close()
        return not bloqueada


# NUEVAS CLASES

class Estancia:
    def __init__(self, id=None, reserva_id=None, huesped_id=None, habitacion_id=None,
                 fecha_checkin="", fecha_checkout_esperado="", fecha_checkout_real=None, estado="activa",
                 hospedaje_id=None, usuario_checkin_id=None, usuario_checkout_id=None):
        self.id = id
        self.reserva_id = reserva_id
        self.huesped_id = huesped_id
        self.habitacion_id = habitacion_id
        self.fecha_checkin = fecha_checkin
        self.fecha_checkout_esperado = fecha_checkout_esperado
        self.fecha_checkout_real = fecha_checkout_real
        self.estado = estado
        self.hospedaje_id = hospedaje_id
        # Auditoría: quién registró el check-in y el check-out.
        self.usuario_checkin_id = usuario_checkin_id
        self.usuario_checkout_id = usuario_checkout_id

    @staticmethod
    def obtener_activa_por_habitacion(habitacion_id):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM estancias
            WHERE habitacion_id = ? AND estado = 'activa'
        ''', (habitacion_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return Estancia(**dict(row))
        return None

    @staticmethod
    def obtener_activas():
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM estancias WHERE estado = 'activa'
        ''')
        rows = cursor.fetchall()
        conn.close()
        return [Estancia(**dict(row)) for row in rows]

    def guardar(self):
        conn = get_connection()
        cursor = conn.cursor()
        if self.id is None:
            hid = self.hospedaje_id if self.hospedaje_id is not None else 1
            cursor.execute('''
                INSERT INTO estancias (reserva_id, huesped_id, habitacion_id, fecha_checkin, fecha_checkout_esperado, estado, hospedaje_id, usuario_checkin_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (self.reserva_id, self.huesped_id, self.habitacion_id,
                  self.fecha_checkin, self.fecha_checkout_esperado, self.estado, hid,
                  self.usuario_checkin_id))
            self.id = cursor.lastrowid
            self.hospedaje_id = hid
        else:
            cursor.execute('''
                UPDATE estancias
                SET reserva_id=?, huesped_id=?, habitacion_id=?, fecha_checkin=?,
                    fecha_checkout_esperado=?, fecha_checkout_real=?, estado=?,
                    usuario_checkin_id=?, usuario_checkout_id=?
                WHERE id=?
            ''', (self.reserva_id, self.huesped_id, self.habitacion_id,
                  self.fecha_checkin, self.fecha_checkout_esperado,
                  self.fecha_checkout_real, self.estado,
                  self.usuario_checkin_id, self.usuario_checkout_id, self.id))
        conn.commit()
        conn.close()

    def finalizar(self, fecha_checkout_real=None):
        if fecha_checkout_real is None:
            fecha_checkout_real = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.fecha_checkout_real = fecha_checkout_real
        self.estado = "finalizada"
        self.guardar()


class Factura:
    def __init__(self, id=None, estancia_id=None, huesped_id=None, fecha_emision="",
                 subtotal=0.0, impuestos=0.0, total=0.0, estado="pendiente", pdf_generado=0,
                 hospedaje_id=None, descuento=0.0, descuento_motivo=""):
        self.id = id
        self.estancia_id = estancia_id
        self.huesped_id = huesped_id
        self.fecha_emision = fecha_emision
        self.subtotal = subtotal
        self.impuestos = impuestos
        self.total = total
        self.estado = estado
        self.pdf_generado = pdf_generado
        self.hospedaje_id = hospedaje_id
        # Descuento/cortesía aplicado al cobro (total = subtotal - descuento).
        self.descuento = descuento or 0.0
        self.descuento_motivo = descuento_motivo or ""

    @staticmethod
    def obtener_por_estancia(estancia_id):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM facturas WHERE estancia_id = ?", (estancia_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return Factura(**dict(row))
        return None

    def guardar(self):
        conn = get_connection()
        cursor = conn.cursor()
        if self.id is None:
            hid = self.hospedaje_id if self.hospedaje_id is not None else 1
            cursor.execute('''
                INSERT INTO facturas (estancia_id, huesped_id, fecha_emision, subtotal, impuestos, total, estado, pdf_generado, hospedaje_id, descuento, descuento_motivo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (self.estancia_id, self.huesped_id, self.fecha_emision,
                  self.subtotal, self.impuestos, self.total, self.estado, self.pdf_generado, hid,
                  self.descuento or 0.0, self.descuento_motivo or ""))
            self.id = cursor.lastrowid
            self.hospedaje_id = hid
        else:
            cursor.execute('''
                UPDATE facturas
                SET subtotal=?, impuestos=?, total=?, estado=?, pdf_generado=?, descuento=?, descuento_motivo=?
                WHERE id=?
            ''', (self.subtotal, self.impuestos, self.total, self.estado, self.pdf_generado,
                  self.descuento or 0.0, self.descuento_motivo or "", self.id))
        conn.commit()
        conn.close()


class Pago:
    def __init__(self, id=None, factura_id=None, monto=0.0, metodo="efectivo", fecha="", referencia="",
                 hospedaje_id=None, usuario_id=None):
        self.id = id
        self.factura_id = factura_id
        self.monto = monto
        self.metodo = metodo
        self.fecha = fecha
        self.referencia = referencia
        self.hospedaje_id = hospedaje_id
        self.usuario_id = usuario_id  # auditoría: quién registró el pago

    def guardar(self):
        conn = get_connection()
        cursor = conn.cursor()
        if self.id is None:
            hid = self.hospedaje_id if self.hospedaje_id is not None else 1
            cursor.execute('''
                INSERT INTO pagos (factura_id, monto, metodo, fecha, referencia, hospedaje_id, usuario_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (self.factura_id, self.monto, self.metodo, self.fecha, self.referencia, hid, self.usuario_id))
            self.id = cursor.lastrowid
            self.hospedaje_id = hid
        else:
            cursor.execute('''
                UPDATE pagos
                SET monto=?, metodo=?, referencia=?
                WHERE id=?
            ''', (self.monto, self.metodo, self.referencia, self.id))
        conn.commit()
        conn.close()