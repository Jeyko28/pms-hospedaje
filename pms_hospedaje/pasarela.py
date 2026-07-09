"""
pasarela.py — pasarela de pagos, modular (patrón adaptador, como sunat.py).

Estrategia igual que el resto del sistema: un PROVEEDOR intercambiable detrás de una
interfaz común, elegido por configuración del hospedaje. En Fase 1 solo existe el
proveedor SANDBOX (simulado, sin cuenta real ni credenciales): permite construir y
probar todo el flujo (crear pago → checkout → webhook → confirmación) end-to-end sin
DNI. `PasarelaMercadoPago` queda como stub documentado para la Fase 2 (real).

Interfaz:
    crear_pago(monto, moneda, referencia, descripcion) -> {external_id, url_checkout, estado}
    verificar_webhook(headers, body, params)          -> {valido, external_id, estado}

Añadir un proveedor real = otra subclase + una rama en `obtener_pasarela`, sin tocar
el resto del sistema (endpoints, BD, frontend).
"""
import json
import os
import uuid


def _app_url() -> str:
    return (os.environ.get("APP_URL") or "http://localhost:5174").rstrip("/")


class PasarelaBase:
    """Interfaz común de una pasarela de pago."""

    proveedor = "base"

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def crear_pago(self, monto: float, moneda: str, referencia, descripcion: str = "") -> dict:
        raise NotImplementedError

    def verificar_webhook(self, headers: dict, body, params: dict) -> dict:
        raise NotImplementedError


class PasarelaSandbox(PasarelaBase):
    """Proveedor SIMULADO para desarrollo. No mueve dinero real.

    `crear_pago` genera un id externo y una URL de checkout apuntando a una página
    del propio frontend que simula el pago. `verificar_webhook` confía en el payload
    (en producción, cada proveedor verifica la FIRMA real de la notificación)."""

    proveedor = "sandbox"

    def crear_pago(self, monto, moneda, referencia, descripcion=""):
        external_id = "SBX-" + uuid.uuid4().hex[:16]
        url = f"{_app_url()}/#/pago?ext={external_id}&ref={referencia}"
        return {"external_id": external_id, "url_checkout": url, "estado": "pendiente"}

    def verificar_webhook(self, headers, body, params):
        # En sandbox no hay firma que verificar: se acepta el payload tal cual.
        data = {}
        if isinstance(body, (bytes, bytearray)):
            body = body.decode("utf-8", "ignore")
        if isinstance(body, str) and body.strip():
            try:
                data = json.loads(body)
            except ValueError:
                data = {}
        elif isinstance(body, dict):
            data = body
        external_id = data.get("external_id") or (params or {}).get("ext")
        estado = (data.get("estado") or (params or {}).get("estado") or "aprobado").lower()
        return {"valido": True, "external_id": external_id, "estado": estado}


class PasarelaMercadoPago(PasarelaBase):
    """STUB para la Fase 2 (real). Requiere SDK + credenciales de Mercado Pago
    (Checkout Pro) y verificación de firma del webhook. Aún no implementado a
    propósito: la salida a producción está condicionada al KYC (DNI + cuenta)."""

    proveedor = "mercadopago"

    def crear_pago(self, monto, moneda, referencia, descripcion=""):
        raise NotImplementedError(
            "Mercado Pago real llega en la Fase 2 (requiere credenciales y cuenta verificada)."
        )

    def verificar_webhook(self, headers, body, params):
        raise NotImplementedError(
            "Mercado Pago real llega en la Fase 2 (verificación de firma pendiente)."
        )


def obtener_pasarela(config: dict | None = None) -> PasarelaBase:
    """Factory: devuelve la pasarela según la config del hospedaje.
    Default SEGURO = sandbox (nunca intenta cobrar de verdad sin config explícita)."""
    config = config or {}
    proveedor = (config.get("proveedor") or "sandbox").lower()
    modo = (config.get("modo") or "sandbox").lower()
    if proveedor == "mercadopago" and modo == "produccion":
        return PasarelaMercadoPago(config)
    return PasarelaSandbox(config)
