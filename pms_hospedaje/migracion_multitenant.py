"""
migracion_multitenant.py
Etapa 4.1 (cimiento SaaS) — Prepara la base de datos para multi-cliente.

Qué hace (de forma SEGURA, idempotente y reversible-friendly):
  1. Crea la tabla `hospedajes` (cada cliente = un registro / "tenant").
  2. Asegura que exista el "Hospedaje #1" (el actual, datos ya existentes).
  3. Añade la columna `hospedaje_id` a las 7 tablas de datos + a `usuarios`,
     SOLO si aún no existe (usa ALTER TABLE ADD COLUMN, no recrea ni borra).
  4. Asigna todos los registros existentes (sin hospedaje) al Hospedaje #1.

Compatibilidad:
  - Funciona en SQLite (local / app de escritorio) y PostgreSQL (nube).
  - NO rompe la app de escritorio: la columna lleva DEFAULT 1, así los INSERT
    antiguos (que no envían hospedaje_id) siguen funcionando.

Esta migración es "invisible": no cambia el comportamiento de la app todavía.
Es solo el cimiento de datos. El filtrado por hospedaje vendrá en pasos
posteriores (auth + endpoints).
"""

import dbengine

# Tablas de datos que pertenecen a un hospedaje (se les añade hospedaje_id).
TABLAS_TENANT = [
    "habitaciones",
    "tareas_limpieza",
    "huespedes",
    "reservas",
    "estancias",
    "facturas",
    "pagos",
    "servicios_habitacion",
    "consumos",
]


def _columnas_de(cursor, tabla):
    """Devuelve el conjunto de nombres de columnas de una tabla,
    según el motor (SQLite usa PRAGMA; PostgreSQL usa information_schema)."""
    if dbengine.USA_POSTGRES:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
            (tabla,),
        )
        return {row[0] for row in cursor.fetchall()}
    else:
        # SQLite: PRAGMA no admite parámetros, se interpola el nombre (es interno).
        cursor.execute(f"PRAGMA table_info({tabla})")
        return {row[1] for row in cursor.fetchall()}


def _tabla_existe(cursor, tabla):
    if dbengine.USA_POSTGRES:
        cursor.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
            (tabla,),
        )
    else:
        cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
            (tabla,),
        )
    return cursor.fetchone() is not None


def migrar(conn):
    """Ejecuta la migración multi-tenant sobre una conexión abierta.
    Idempotente: se puede llamar muchas veces sin efectos duplicados."""
    cursor = conn.cursor()

    # ----- 1. Tabla hospedajes (el tenant) -----
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS hospedajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            slug TEXT,
            plan TEXT DEFAULT 'trial',          -- 'trial' | 'basico' | 'pro'
            estado TEXT DEFAULT 'activo',        -- 'prueba'|'activo'|'suspendido'|'cancelado'
            fecha_inicio TEXT DEFAULT CURRENT_TIMESTAMP,
            fecha_expira TEXT,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # ----- 2. Asegurar el Hospedaje #1 (el actual) -----
    cursor.execute("SELECT COUNT(*) FROM hospedajes")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO hospedajes (nombre, slug, plan, estado) VALUES (?, ?, ?, ?)",
            ("Mi Hospedaje", "principal", "pro", "activo"),
        )

    # ----- 3. Añadir hospedaje_id a cada tabla tenant + usuarios -----
    tablas = list(TABLAS_TENANT)
    if _tabla_existe(cursor, "usuarios"):
        tablas.append("usuarios")

    for tabla in tablas:
        if not _tabla_existe(cursor, tabla):
            continue
        cols = _columnas_de(cursor, tabla)
        if "hospedaje_id" not in cols:
            # DEFAULT 1 => los INSERT antiguos (app de escritorio) siguen valiendo,
            # y las filas existentes quedan asignadas al Hospedaje #1.
            cursor.execute(
                f"ALTER TABLE {tabla} ADD COLUMN hospedaje_id INTEGER DEFAULT 1"
            )
            # Asegurar que filas previas (por si el default no las tocó) tengan id 1.
            cursor.execute(
                f"UPDATE {tabla} SET hospedaje_id = 1 WHERE hospedaje_id IS NULL"
            )

    conn.commit()

    # ----- 4. Columna 'origen' en reservas ('manual' | 'publico') -----
    # Para reportes: distinguir reservas creadas a mano vs. por el link público.
    # Las existentes quedan 'manual' (no podemos saber su origen retroactivo).
    if _tabla_existe(cursor, "reservas"):
        cols_reservas = _columnas_de(cursor, "reservas")
        if "origen" not in cols_reservas:
            cursor.execute("ALTER TABLE reservas ADD COLUMN origen TEXT DEFAULT 'manual'")
            cursor.execute("UPDATE reservas SET origen = 'manual' WHERE origen IS NULL")
            conn.commit()

    # ----- 5. Columna 'slug_cambios' en hospedajes (contador de cambios de link) -----
    # El admin puede personalizar el slug del link público, pero con un cupo
    # limitado (el link se comparte; cambiarlo a menudo rompe enlaces ya difundidos).
    if _tabla_existe(cursor, "hospedajes"):
        cols_hosp = _columnas_de(cursor, "hospedajes")
        if "slug_cambios" not in cols_hosp:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN slug_cambios INTEGER DEFAULT 0")
            cursor.execute("UPDATE hospedajes SET slug_cambios = 0 WHERE slug_cambios IS NULL")
            conn.commit()

    # ----- 6. Tabla 'visitas' (analítica de la página pública de reservas) -----
    # Cada vez que alguien abre el link público de un hospedaje se registra una
    # visita. Alimenta el "Visitors Chart" del dashboard. Se llena solo con el
    # tráfico real del link.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS visitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 7. Columnas 'descuento' y 'descuento_motivo' en facturas -----
    # Permiten aplicar un descuento/cortesía al cobro (total = subtotal - descuento)
    # sin tocar el precio base de la habitación. Las facturas previas quedan con 0.
    if _tabla_existe(cursor, "facturas"):
        cols_fact = _columnas_de(cursor, "facturas")
        if "descuento" not in cols_fact:
            cursor.execute("ALTER TABLE facturas ADD COLUMN descuento REAL DEFAULT 0")
            cursor.execute("UPDATE facturas SET descuento = 0 WHERE descuento IS NULL")
        if "descuento_motivo" not in cols_fact:
            cursor.execute("ALTER TABLE facturas ADD COLUMN descuento_motivo TEXT DEFAULT ''")
        conn.commit()

    # ----- 8. Auditoría por usuario: quién cobró / hizo check-in / check-out -----
    if _tabla_existe(cursor, "pagos"):
        if "usuario_id" not in _columnas_de(cursor, "pagos"):
            cursor.execute("ALTER TABLE pagos ADD COLUMN usuario_id INTEGER")
            conn.commit()
    if _tabla_existe(cursor, "estancias"):
        cols_est = _columnas_de(cursor, "estancias")
        if "usuario_checkin_id" not in cols_est:
            cursor.execute("ALTER TABLE estancias ADD COLUMN usuario_checkin_id INTEGER")
        if "usuario_checkout_id" not in cols_est:
            cursor.execute("ALTER TABLE estancias ADD COLUMN usuario_checkout_id INTEGER")
        conn.commit()

    # ----- 9. Tabla 'bloqueos' (habitación fuera de servicio por rango de fechas) -----
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bloqueos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            habitacion_id INTEGER NOT NULL,
            fecha_inicio TEXT NOT NULL,
            fecha_fin TEXT NOT NULL,
            motivo TEXT DEFAULT '',
            creado_por INTEGER,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 10. Columna 'tipo_documento' en huespedes (DNI/CE/Pasaporte) -----
    if _tabla_existe(cursor, "huespedes"):
        if "tipo_documento" not in _columnas_de(cursor, "huespedes"):
            cursor.execute("ALTER TABLE huespedes ADD COLUMN tipo_documento TEXT DEFAULT 'DNI'")
            conn.commit()

    # ----- 11. Identidad del negocio en hospedajes (para la factura/comprobante) -----
    # Datos reales de cada hospedaje que antes estaban "quemados" en el PDF.
    # 'hospedajes' es la fuente de verdad; estos campos pre-llenan la config SUNAT.
    if _tabla_existe(cursor, "hospedajes"):
        cols_hosp_id = _columnas_de(cursor, "hospedajes")
        for col in ("ruc", "razon_social", "direccion", "telefono", "email_contacto"):
            if col not in cols_hosp_id:
                cursor.execute(f"ALTER TABLE hospedajes ADD COLUMN {col} TEXT DEFAULT ''")
        conn.commit()

    # ----- 13. Tabla 'cierres_turno' (arqueo firmado de caja por turno/día) -----
    # Snapshot de lo cobrado al cerrar el turno: total y desglose por método,
    # efectivo esperado vs contado y diferencia, con quién y cuándo. NO bloquea
    # pagos (un cobro tardío legítimo debe poder registrarse igual).
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cierres_turno (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            usuario_id INTEGER,
            usuario_nombre TEXT DEFAULT '',
            fecha TEXT NOT NULL,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
            total_sistema REAL DEFAULT 0,
            efectivo_sistema REAL DEFAULT 0,
            efectivo_contado REAL,
            diferencia REAL,
            num_pagos INTEGER DEFAULT 0,
            por_metodo TEXT DEFAULT '[]',
            notas TEXT DEFAULT ''
        )
        """
    )
    conn.commit()

    # ----- 14. Columna 'grupo_id' en reservas (reserva multi-habitación/grupo) -----
    # Una reserva de grupo crea N reservas (una por habitación) que comparten
    # huésped+fechas y este grupo_id. Las reservas individuales lo dejan NULL
    # (retrocompatible). Cada habitación conserva su propio folio/lifecycle.
    if _tabla_existe(cursor, "reservas"):
        if "grupo_id" not in _columnas_de(cursor, "reservas"):
            cursor.execute("ALTER TABLE reservas ADD COLUMN grupo_id TEXT")
            conn.commit()

    # ----- 15. Columna 'subcategoria' en servicios_habitacion -----
    # Permite organizar el catálogo: Bebidas > Agua, Gaseosa; Snacks > Doritos, etc.
    if _tabla_existe(cursor, "servicios_habitacion"):
        if "subcategoria" not in _columnas_de(cursor, "servicios_habitacion"):
            cursor.execute("ALTER TABLE servicios_habitacion ADD COLUMN subcategoria TEXT DEFAULT ''")
            conn.commit()

    # ----- 17. Columna 'tipo' en servicios_habitacion (Producto | Servicio) -----
    # Distingue productos consumibles (bebidas, snacks…) de servicios (limpieza,
    # lavandería…). Backfill: por categoría se infiere 'servicio' a los obvios.
    if _tabla_existe(cursor, "servicios_habitacion"):
        if "tipo" not in _columnas_de(cursor, "servicios_habitacion"):
            cursor.execute("ALTER TABLE servicios_habitacion ADD COLUMN tipo TEXT DEFAULT 'producto'")
            cursor.execute(
                "UPDATE servicios_habitacion SET tipo = 'servicio' "
                "WHERE categoria IN ('servicio', 'limpieza', 'mantenimiento')"
            )
            conn.commit()

    # ----- 16. Tabla 'tarifas' (precios por temporada / fin de semana) -----
    # Reglas de precio que aplican a una noche según rango de fechas y/o días de
    # la semana, por habitación o globales. Si no hay regla, se usa precio_base.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tarifas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            nombre TEXT DEFAULT '',
            fecha_inicio TEXT,
            fecha_fin TEXT,
            dias_semana TEXT,
            habitacion_id INTEGER,
            precio REAL,
            ajuste_pct REAL,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 18. Suscripciones del SaaS: pagos + precio pactado -----
    # Registro de los pagos de suscripción (Yape/transferencia) que cada
    # hospedaje-cliente hace al dueño del SaaS. Registrar un pago ACTIVA y
    # EXTIENDE al cliente automáticamente (ver POST /api/hospedajes/{id}/pagos).
    # 'precio_pactado' recuerda el precio fundador (S/99 vitalicio) por cliente.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS pagos_suscripcion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER NOT NULL,
            monto REAL NOT NULL,
            moneda TEXT DEFAULT 'PEN',
            metodo TEXT DEFAULT 'yape',          -- yape|transferencia|efectivo|otro
            periodo TEXT DEFAULT 'mensual',      -- mensual|anual
            plan TEXT DEFAULT 'inicia',          -- inicia|crece|pro
            fecha_pago TEXT DEFAULT CURRENT_TIMESTAMP,
            cubre_desde TEXT,
            cubre_hasta TEXT,
            nota TEXT DEFAULT '',
            registrado_por INTEGER,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    if _tabla_existe(cursor, "hospedajes"):
        if "precio_pactado" not in _columnas_de(cursor, "hospedajes"):
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN precio_pactado REAL")
    conn.commit()

    # ----- 19. Tabla 'contactos' (leads del formulario de la landing) -----
    # El formulario de contacto de la web pública guarda aquí el mensaje, en vez
    # de exponer un correo. El super-admin los revisa como lista de prospectos.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS contactos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT DEFAULT '',
            contacto TEXT DEFAULT '',
            mensaje TEXT DEFAULT '',
            origen TEXT DEFAULT 'landing',
            atendido INTEGER DEFAULT 0,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 20. Caja por TURNO: ventana temporal del cierre -----
    # La caja deja de ser "por día calendario" y pasa a acumular por turno (desde
    # el último cierre hasta el siguiente). Guardamos la ventana [periodo_desde,
    # periodo_hasta] con el MISMO reloj que pagos.fecha (datetime.now local), para
    # no chocar con el CURRENT_TIMESTAMP (UTC) de creado_en. Backfill de filas
    # viejas: su límite = fin del día que cerraron.
    if _tabla_existe(cursor, "cierres_turno"):
        cols_ct = _columnas_de(cursor, "cierres_turno")
        if "periodo_desde" not in cols_ct:
            cursor.execute("ALTER TABLE cierres_turno ADD COLUMN periodo_desde TEXT")
        if "periodo_hasta" not in cols_ct:
            cursor.execute("ALTER TABLE cierres_turno ADD COLUMN periodo_hasta TEXT")
            cursor.execute(
                "UPDATE cierres_turno SET periodo_hasta = fecha || ' 23:59:59' "
                "WHERE periodo_hasta IS NULL AND fecha IS NOT NULL"
            )
        conn.commit()

    # ----- 21. Huéspedes: archivar en vez de borrar (soft-delete) -----
    # En un PMS real no se elimina un huésped (rompe historial/estadísticas y la
    # trazabilidad de sus reservas). Se archiva: queda oculto del listado por
    # defecto pero conserva todo su historial.
    if _tabla_existe(cursor, "huespedes"):
        if "archivado" not in _columnas_de(cursor, "huespedes"):
            cursor.execute("ALTER TABLE huespedes ADD COLUMN archivado INTEGER DEFAULT 0")
            cursor.execute("UPDATE huespedes SET archivado = 0 WHERE archivado IS NULL")
            conn.commit()

    # ----- 22. Inventario (módulo escalable): items + movimientos -----
    # Base para gestionar existencias (Cocina/Minimarket/Limpieza/Operación):
    # stock, mínimo, costo, proveedor y un historial de movimientos (entradas,
    # salidas, ajustes) que es la fuente de verdad del stock.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS inventario_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            nombre TEXT NOT NULL,
            categoria TEXT DEFAULT 'Operación',
            unidad TEXT DEFAULT 'unidad',
            stock REAL DEFAULT 0,
            stock_minimo REAL DEFAULT 0,
            costo_unitario REAL DEFAULT 0,
            proveedor TEXT DEFAULT '',
            activo INTEGER DEFAULT 1,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS inventario_movimientos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER,
            item_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,           -- entrada | salida | ajuste
            cantidad REAL NOT NULL,
            stock_resultante REAL,
            motivo TEXT DEFAULT '',
            costo_unitario REAL,
            usuario_id INTEGER,
            usuario_nombre TEXT DEFAULT '',
            fecha TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # Enlace opcional para integrar el catálogo de servicios/productos con el
    # inventario (vender un producto podrá descontar stock). Se prepara la columna.
    if _tabla_existe(cursor, "servicios_habitacion"):
        if "inventario_item_id" not in _columnas_de(cursor, "servicios_habitacion"):
            cursor.execute("ALTER TABLE servicios_habitacion ADD COLUMN inventario_item_id INTEGER")
    conn.commit()

    # ----- 23. Inventario: presentación de compra (ej. "saco" = N kg) -----
    # Permite comprar a granel por presentación y que el stock (en unidad base)
    # suba por el factor. presentacion_factor = unidades base por 1 presentación;
    # 0/'' = producto sin presentación (comportamiento normal). El factor lo
    # define el dueño por producto (no hay valores fijos).
    if _tabla_existe(cursor, "inventario_items"):
        cols_inv = _columnas_de(cursor, "inventario_items")
        if "presentacion" not in cols_inv:
            cursor.execute("ALTER TABLE inventario_items ADD COLUMN presentacion TEXT DEFAULT ''")
        if "presentacion_factor" not in cols_inv:
            cursor.execute("ALTER TABLE inventario_items ADD COLUMN presentacion_factor REAL DEFAULT 0")
        conn.commit()

    # ----- 24. Adelanto (Yape) en el motor de reservas -----
    # El hospedaje puede pedir un ADELANTO por Yape/transferencia al reservar por
    # el link público (convierte una "solicitud" en reserva con compromiso). El
    # dueño configura: si está activo, su número/titular Yape y la política del
    # adelanto (1ª noche | % del total | monto fijo). La reserva guarda el monto
    # calculado, el código de operación que pega el huésped y el estado de
    # verificación. Todo opcional: si no se activa, el flujo actual no cambia.
    if _tabla_existe(cursor, "hospedajes"):
        cols_h_ad = _columnas_de(cursor, "hospedajes")
        if "adelanto_activo" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN adelanto_activo INTEGER DEFAULT 0")
        if "adelanto_tipo" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN adelanto_tipo TEXT DEFAULT 'noche'")  # noche|porcentaje|monto
        if "adelanto_valor" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN adelanto_valor REAL DEFAULT 0")
        if "yape_numero" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN yape_numero TEXT DEFAULT ''")
        if "yape_titular" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN yape_titular TEXT DEFAULT ''")
        # Transferencia bancaria (opcional): banco + número de cuenta + CCI.
        if "cuenta_banco" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN cuenta_banco TEXT DEFAULT ''")
        if "cuenta_numero" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN cuenta_numero TEXT DEFAULT ''")
        if "cuenta_cci" not in cols_h_ad:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN cuenta_cci TEXT DEFAULT ''")
        conn.commit()
    if _tabla_existe(cursor, "reservas"):
        cols_r_ad = _columnas_de(cursor, "reservas")
        if "adelanto_monto" not in cols_r_ad:
            cursor.execute("ALTER TABLE reservas ADD COLUMN adelanto_monto REAL DEFAULT 0")
        if "adelanto_codigo" not in cols_r_ad:
            cursor.execute("ALTER TABLE reservas ADD COLUMN adelanto_codigo TEXT DEFAULT ''")
        if "adelanto_estado" not in cols_r_ad:
            # '' = sin adelanto | por_verificar | verificado | rechazado
            cursor.execute("ALTER TABLE reservas ADD COLUMN adelanto_estado TEXT DEFAULT ''")
        conn.commit()

    # ----- 25. Moneda del hospedaje (multi-moneda, Fase 1) -----
    # Cada hospedaje opera en una moneda (código ISO: 'PEN', 'USD', …). Todos sus
    # montos se interpretan y muestran en ella. Aditivo; default 'PEN' conserva el
    # comportamiento actual.
    if _tabla_existe(cursor, "hospedajes"):
        if "moneda" not in _columnas_de(cursor, "hospedajes"):
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN moneda TEXT DEFAULT 'PEN'")
            cursor.execute("UPDATE hospedajes SET moneda = 'PEN' WHERE moneda IS NULL")
            conn.commit()

    # ----- 26. Multi-moneda Fase 2: tipos de cambio + monedas aceptadas -----
    # Caché GLOBAL de tipos de cambio (PEN↔USD es igual para todos): tasa = cuántas
    # unidades de `moneda_base` equivale 1 de `moneda` (p. ej. PEN por 1 USD ≈ 3.75).
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tipos_cambio (
            moneda_base TEXT NOT NULL,
            moneda TEXT NOT NULL,
            tasa REAL NOT NULL,
            fuente TEXT DEFAULT '',
            actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (moneda_base, moneda)
        )
        """
    )
    # Por hospedaje: monedas que acepta además de la base (CSV ISO, p. ej. "USD")
    # y margen % opcional sobre el tipo oficial.
    if _tabla_existe(cursor, "hospedajes"):
        cols_h_m = _columnas_de(cursor, "hospedajes")
        if "monedas_aceptadas" not in cols_h_m:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN monedas_aceptadas TEXT DEFAULT ''")
        if "margen_cambio" not in cols_h_m:
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN margen_cambio REAL DEFAULT 0")
    conn.commit()

    # ----- 27. Pagos: moneda recibida (efectivo en USD) -----
    # El `monto` sigue en la moneda BASE (liquida el saldo). Se añade la moneda
    # física recibida + el monto recibido + el tipo de cambio usado (auditoría).
    # Existentes: moneda_recibida=base implícita, tipo_cambio=1 → sin cambios.
    if _tabla_existe(cursor, "pagos"):
        cols_pg = _columnas_de(cursor, "pagos")
        if "moneda_recibida" not in cols_pg:
            cursor.execute("ALTER TABLE pagos ADD COLUMN moneda_recibida TEXT DEFAULT ''")
        if "monto_recibido" not in cols_pg:
            cursor.execute("ALTER TABLE pagos ADD COLUMN monto_recibido REAL")
        if "tipo_cambio" not in cols_pg:
            cursor.execute("ALTER TABLE pagos ADD COLUMN tipo_cambio REAL DEFAULT 1")
        conn.commit()

    # ----- 28. Contratación: aceptación de términos + plan elegido -----
    # Registro profesional: se guarda cuándo el usuario aceptó los términos y el
    # plan que eligió en Precios (informativo; la activación real es por pago).
    if _tabla_existe(cursor, "usuarios"):
        cols_u = _columnas_de(cursor, "usuarios")
        if "acepto_terminos_en" not in cols_u:
            cursor.execute("ALTER TABLE usuarios ADD COLUMN acepto_terminos_en TEXT")
        if "email_verificado_en" not in cols_u:
            cursor.execute("ALTER TABLE usuarios ADD COLUMN email_verificado_en TEXT")
        # Recuperación de contraseña: hash del token de reseteo + su vencimiento.
        if "reset_token_hash" not in cols_u:
            cursor.execute("ALTER TABLE usuarios ADD COLUMN reset_token_hash TEXT")
        if "reset_expira" not in cols_u:
            cursor.execute("ALTER TABLE usuarios ADD COLUMN reset_expira TEXT")
        conn.commit()
    if _tabla_existe(cursor, "hospedajes"):
        if "plan_deseado" not in _columnas_de(cursor, "hospedajes"):
            cursor.execute("ALTER TABLE hospedajes ADD COLUMN plan_deseado TEXT DEFAULT ''")
            conn.commit()

    # ----- 29. Pagos online: config de pasarela por hospedaje -----
    # Proveedor de pagos por hospedaje (sandbox por defecto; credenciales aquí).
    # En Fase 1 solo se usa 'sandbox' (sin cuenta real ni DNI).
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS pasarela_config (
            hospedaje_id INTEGER PRIMARY KEY,
            proveedor TEXT DEFAULT 'sandbox',
            modo TEXT DEFAULT 'sandbox',
            activo INTEGER DEFAULT 0,
            public_key TEXT DEFAULT '',
            access_token TEXT DEFAULT '',
            actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # ----- 30. Pagos online: intentos / transacciones -----
    # Cada intento de pago online. El pago CONFIRMADO se refleja además en las tablas
    # de negocio (reservas.adelanto_estado, pagos, pagos_suscripcion).
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS pagos_online (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospedaje_id INTEGER NOT NULL,
            tipo TEXT NOT NULL DEFAULT 'reserva',
            referencia_id INTEGER,
            proveedor TEXT DEFAULT 'sandbox',
            external_id TEXT,
            monto REAL DEFAULT 0,
            moneda TEXT DEFAULT 'PEN',
            estado TEXT NOT NULL DEFAULT 'pendiente',
            descripcion TEXT DEFAULT '',
            payload TEXT DEFAULT '',
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 31. Habitaciones: detalles para el motor público -----
    # Descripción, capacidad (nº huéspedes) y amenidades (CSV de etiquetas), para
    # que el huésped vea qué reserva. Aditivo: existentes quedan con valores vacíos.
    if _tabla_existe(cursor, "habitaciones"):
        cols_hab = _columnas_de(cursor, "habitaciones")
        if "descripcion" not in cols_hab:
            cursor.execute("ALTER TABLE habitaciones ADD COLUMN descripcion TEXT DEFAULT ''")
        if "capacidad" not in cols_hab:
            cursor.execute("ALTER TABLE habitaciones ADD COLUMN capacidad INTEGER DEFAULT 0")
        if "amenidades" not in cols_hab:
            cursor.execute("ALTER TABLE habitaciones ADD COLUMN amenidades TEXT DEFAULT ''")
        conn.commit()

    # ----- 32. Fotos referenciales de habitación -----
    # Imagen guardada como data URL base64 (comprimida en el cliente). Storage MVP
    # sin cuentas externas; evolucionable a object storage (Cloudinary/Blob) luego.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS habitacion_fotos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habitacion_id INTEGER NOT NULL,
            hospedaje_id INTEGER NOT NULL,
            imagen TEXT NOT NULL,
            orden INTEGER DEFAULT 0,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()

    # ----- 33. Fotos en Supabase Storage: ruta del objeto (para poder borrarlo).
    # '' = la imagen está en base64 en la columna `imagen` (fallback / legado).
    if _tabla_existe(cursor, "habitacion_fotos"):
        if "storage_path" not in _columnas_de(cursor, "habitacion_fotos"):
            cursor.execute("ALTER TABLE habitacion_fotos ADD COLUMN storage_path TEXT DEFAULT ''")
            conn.commit()

    # ----- 12. Índices para rendimiento multi-tenant -----
    # Casi todas las consultas filtran por hospedaje_id y por las FK de relación
    # (habitacion_id, factura_id, etc.). Sin índices, cada lectura es un full-scan
    # que se degrada al crecer los datos. Idempotente (CREATE INDEX IF NOT EXISTS,
    # válido en SQLite y PostgreSQL) y barato.
    _crear_indices(cursor, conn)

    # Quitar la restriccion UNIQUE global de habitaciones.numero (de antes del
    # multi-tenant). En un SaaS, dos hospedajes distintos pueden tener su propia
    # habitacion "101"; la unicidad correcta es POR hospedaje (validada en la API).
    _quitar_unique_numero_habitaciones(cursor, conn)


# Índices: (nombre, tabla, columna). Cubren el filtro de tenant (hospedaje_id),
# las FK usadas en JOINs y los campos de filtrado más frecuentes.
_INDICES = [
    ("idx_habitaciones_hosp", "habitaciones", "hospedaje_id"),
    ("idx_huespedes_hosp", "huespedes", "hospedaje_id"),
    ("idx_reservas_hosp", "reservas", "hospedaje_id"),
    ("idx_reservas_hab", "reservas", "habitacion_id"),
    ("idx_reservas_estado", "reservas", "estado"),
    ("idx_estancias_hab", "estancias", "habitacion_id"),
    ("idx_estancias_reserva", "estancias", "reserva_id"),
    ("idx_estancias_estado", "estancias", "estado"),
    ("idx_facturas_hosp", "facturas", "hospedaje_id"),
    ("idx_facturas_estancia", "facturas", "estancia_id"),
    ("idx_facturas_huesped", "facturas", "huesped_id"),
    ("idx_pagos_factura", "pagos", "factura_id"),
    ("idx_pagos_hosp", "pagos", "hospedaje_id"),
    ("idx_bloqueos_hab", "bloqueos", "habitacion_id"),
    ("idx_bloqueos_hosp", "bloqueos", "hospedaje_id"),
    ("idx_tareas_hosp", "tareas_limpieza", "hospedaje_id"),
    ("idx_tareas_hab", "tareas_limpieza", "habitacion_id"),
    ("idx_visitas_hosp", "visitas", "hospedaje_id"),
    ("idx_usuarios_usuario", "usuarios", "usuario"),
    ("idx_usuarios_hosp", "usuarios", "hospedaje_id"),
    ("idx_comprobantes_hosp", "comprobantes", "hospedaje_id"),
    ("idx_cierres_hosp", "cierres_turno", "hospedaje_id"),
    ("idx_reservas_grupo", "reservas", "grupo_id"),
    ("idx_tarifas_hosp", "tarifas", "hospedaje_id"),
    ("idx_pagos_susc_hosp", "pagos_suscripcion", "hospedaje_id"),
    ("idx_inv_items_hosp", "inventario_items", "hospedaje_id"),
    ("idx_inv_mov_item", "inventario_movimientos", "item_id"),
    ("idx_pagos_online_hosp", "pagos_online", "hospedaje_id"),
    ("idx_pagos_online_ext", "pagos_online", "external_id"),
    ("idx_hab_fotos_hab", "habitacion_fotos", "habitacion_id"),
    ("idx_hospedajes_slug", "hospedajes", "slug"),
]


def _crear_indices(cursor, conn):
    """Crea los índices de rendimiento de forma idempotente y segura.
    Verifica que la tabla y la columna existan antes (algunas tablas, como
    comprobantes, se crean en otro módulo). Nunca rompe el arranque."""
    creados = 0
    for nombre, tabla, columna in _INDICES:
        if not _tabla_existe(cursor, tabla):
            continue
        if columna not in _columnas_de(cursor, tabla):
            continue
        try:
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {nombre} ON {tabla} ({columna})"
            )
            creados += 1
        except Exception:
            # Un índice que falla no debe impedir el arranque de la app.
            pass
    conn.commit()
    return creados


def _quitar_unique_numero_habitaciones(cursor, conn):
    """Elimina el UNIQUE global de habitaciones.numero si todavia existe.
    Idempotente y compatible con SQLite y PostgreSQL."""
    if not _tabla_existe(cursor, "habitaciones"):
        return

    if dbengine.USA_POSTGRES:
        # En Postgres, buscar y eliminar cualquier constraint UNIQUE sobre 'numero'.
        cursor.execute(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
            WHERE tc.table_name = 'habitaciones'
              AND tc.constraint_type = 'UNIQUE'
              AND ccu.column_name = 'numero'
            """
        )
        for row in cursor.fetchall():
            nombre = row[0]
            try:
                cursor.execute(f'ALTER TABLE habitaciones DROP CONSTRAINT "{nombre}"')
            except Exception:
                pass
        conn.commit()
        return

    # SQLite: no permite DROP CONSTRAINT. Si la definicion tiene UNIQUE en numero,
    # recreamos la tabla sin esa restriccion, preservando los datos.
    fila = cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='habitaciones'"
    ).fetchone()
    if not fila:
        return
    definicion = fila[0] if not hasattr(fila, "keys") else fila["sql"]
    if "UNIQUE" not in (definicion or "").upper():
        return  # ya esta limpia

    cursor.executescript(
        """
        PRAGMA foreign_keys=OFF;
        CREATE TABLE habitaciones_nueva (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL,
            tipo TEXT NOT NULL,
            precio_base REAL NOT NULL,
            estado_limpieza TEXT DEFAULT 'Limpia',
            estado TEXT DEFAULT 'disponible',
            activa INTEGER DEFAULT 1,
            hospedaje_id INTEGER DEFAULT 1
        );
        INSERT INTO habitaciones_nueva (id, numero, tipo, precio_base, estado_limpieza, estado, activa, hospedaje_id)
            SELECT id, numero, tipo, precio_base, estado_limpieza, estado, activa,
                   COALESCE(hospedaje_id, 1)
            FROM habitaciones;
        DROP TABLE habitaciones;
        ALTER TABLE habitaciones_nueva RENAME TO habitaciones;
        PRAGMA foreign_keys=ON;
        """
    )
    conn.commit()


if __name__ == "__main__":
    # Permite correr la migración a mano:  python migracion_multitenant.py
    import database
    c = database.get_connection()
    migrar(c)
    c.close()
    print("Migración multi-tenant aplicada.")
