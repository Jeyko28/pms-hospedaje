import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useTheme } from "../../hooks/useTheme";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Field from "../../components/Field";
import StateMessage from "../../components/StateMessage";
import { MONEDAS, setMonedaActual } from "../../utils/moneda";
import "./Configuracion.css";

// Opciones de apariencia (tema claro / oscuro / seguir el sistema).
const TEMAS = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Oscuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

// Número de WhatsApp de soporte del SaaS (mismo que la página de precios).
const SOPORTE_WHATSAPP = "51981487284";

const VACIO = {
  nombre: "",
  telefono: "",
  email_contacto: "",
  moneda: "PEN",
  monedas_aceptadas: "",
  margen_cambio: 0,
};

// Etiqueta amable para el plan y el estado.
const PLAN_LABEL = { trial: "Prueba", basico: "Inicia / Crece", pro: "Pro" };
const ESTADO_TONO = {
  activo: "success",
  prueba: "warning",
  suspendido: "danger",
  cancelado: "danger",
};

export default function Configuracion() {
  const info = useApi(api.miHospedaje);
  const tc = useApi(api.tipoCambio);
  const { modo, setModo } = useTheme();

  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  // Cargar los datos existentes en el formulario.
  useEffect(() => {
    if (info.data) {
      setForm({
        nombre: info.data.nombre || "",
        telefono: info.data.telefono || "",
        email_contacto: info.data.email_contacto || "",
        moneda: info.data.moneda || "PEN",
        monedas_aceptadas: info.data.monedas_aceptadas || "",
        margen_cambio: info.data.margen_cambio ?? 0,
      });
    }
  }, [info.data]);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar(ev) {
    ev.preventDefault();
    setError(null);
    setOk(false);
    if (!form.nombre.trim()) {
      setError("El nombre del negocio es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      await api.guardarMiHospedaje({
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        email_contacto: form.email_contacto.trim(),
        moneda: form.moneda,
        monedas_aceptadas: form.monedas_aceptadas,
        margen_cambio: Number(form.margen_cambio) || 0,
      });
      // Aplica la moneda al instante para el formateo de dinero de la app.
      setMonedaActual(form.moneda);
      setOk(true);
      info.recargar();
      tc.recargar();
      setTimeout(() => setOk(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  // --- Adelanto (Yape) del motor de reservas ---
  const adel = useApi(api.adelantoConfig);
  const [adForm, setAdForm] = useState({
    activo: false, tipo: "noche", valor: 0, yape_numero: "", yape_titular: "",
  });
  const [adGuardando, setAdGuardando] = useState(false);
  const [adError, setAdError] = useState(null);
  const [adOk, setAdOk] = useState(false);

  useEffect(() => {
    if (adel.data) {
      setAdForm({
        activo: !!adel.data.activo,
        tipo: adel.data.tipo || "noche",
        valor: adel.data.valor || 0,
        yape_numero: adel.data.yape_numero || "",
        yape_titular: adel.data.yape_titular || "",
      });
    }
  }, [adel.data]);

  const setAd = (campo) => (e) =>
    setAdForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardarAdelanto(ev) {
    ev.preventDefault();
    setAdError(null);
    setAdOk(false);
    if (adForm.activo) {
      if (!adForm.yape_numero.trim()) {
        setAdError("Indica el número de Yape/transferencia para recibir el adelanto.");
        return;
      }
      if (adForm.tipo === "porcentaje" && !(Number(adForm.valor) > 0 && Number(adForm.valor) <= 100)) {
        setAdError("El porcentaje debe estar entre 1 y 100.");
        return;
      }
      if (adForm.tipo === "monto" && !(Number(adForm.valor) > 0)) {
        setAdError("Indica el monto del adelanto en soles.");
        return;
      }
    }
    setAdGuardando(true);
    try {
      await api.guardarAdelantoConfig({
        activo: adForm.activo,
        tipo: adForm.tipo,
        valor: Number(adForm.valor) || 0,
        yape_numero: adForm.yape_numero.trim(),
        yape_titular: adForm.yape_titular.trim(),
      });
      setAdOk(true);
      adel.recargar();
      setTimeout(() => setAdOk(false), 3000);
    } catch (e) {
      setAdError(e.message);
    } finally {
      setAdGuardando(false);
    }
  }

  // --- Pagos online (pasarela) ---
  const pas = useApi(api.pasarelaConfig);
  const [pasActivo, setPasActivo] = useState(false);
  const [pasGuardando, setPasGuardando] = useState(false);
  const [pasError, setPasError] = useState(null);
  const [pasOk, setPasOk] = useState(false);

  useEffect(() => {
    if (pas.data) setPasActivo(!!pas.data.activo);
  }, [pas.data]);

  async function guardarPasarela(ev) {
    ev.preventDefault();
    setPasError(null);
    setPasOk(false);
    setPasGuardando(true);
    try {
      await api.guardarPasarelaConfig({ proveedor: "sandbox", modo: "sandbox", activo: pasActivo });
      setPasOk(true);
      pas.recargar();
      setTimeout(() => setPasOk(false), 3000);
    } catch (e) {
      setPasError(e.message);
    } finally {
      setPasGuardando(false);
    }
  }

  // --- Estado de la suscripción ---
  const plan = info.data?.plan || "—";
  const estado = info.data?.estado || "—";
  const dias = info.data?.dias_restantes;

  // Mensaje del vencimiento (y si urge renovar).
  let vencimiento = null;
  let urge = false;
  if (typeof dias === "number") {
    if (dias < 0) {
      vencimiento = `Venció hace ${Math.abs(dias)} día(s).`;
      urge = true;
    } else if (dias === 0) {
      vencimiento = "Vence hoy.";
      urge = true;
    } else {
      vencimiento = `Vence en ${dias} día(s).`;
      urge = dias <= 7;
    }
  }

  const waTexto = `Hola, soy ${form.nombre || "un hospedaje"} (plan ${plan}). Quiero activar/renovar mi suscripción del PMS.`;
  const waUrl = `https://wa.me/${SOPORTE_WHATSAPP}?text=${encodeURIComponent(waTexto)}`;

  return (
    <div className="cfg">
      <header className="cfg__head" />

      {/* ---------- Datos del negocio ---------- */}
      <Card>
        <h2 className="cfg__card-title">Datos del negocio</h2>
        {info.loading && !info.data ? (
          <StateMessage variant="loading" title="Cargando datos…" />
        ) : (
          <form className="cfg__form" onSubmit={guardar} noValidate>
            <Field id="nombre" label="Nombre comercial" required>
              <input
                id="nombre"
                type="text"
                value={form.nombre}
                onChange={set("nombre")}
                placeholder="Ej. Casa de Rex"
              />
            </Field>

            <Field id="moneda" label="Moneda" hint="Todos los montos se muestran en esta moneda.">
              <select id="moneda" value={form.moneda} onChange={set("moneda")}>
                {Object.values(MONEDAS).map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
                ))}
              </select>
            </Field>

            {form.moneda !== "USD" && (
              <>
                <label className="cfg__check">
                  <input
                    type="checkbox"
                    checked={form.monedas_aceptadas.includes("USD")}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, monedas_aceptadas: e.target.checked ? "USD" : "" }))
                    }
                  />
                  Mostrar el precio referencial en dólares (USD) a huéspedes extranjeros
                </label>

                {form.monedas_aceptadas.includes("USD") && (
                  <div className="cfg__fila">
                    <Field id="margen" label="Margen sobre el tipo oficial (%)" hint="0 = tipo oficial. Tu spread opcional.">
                      <input
                        id="margen"
                        type="number"
                        step="0.1"
                        value={form.margen_cambio}
                        onChange={set("margen_cambio")}
                      />
                    </Field>
                    <Field id="tc-vigente" label="Tipo de cambio vigente">
                      <input
                        id="tc-vigente"
                        type="text"
                        readOnly
                        value={
                          tc.data && tc.data.tasa
                            ? `1 USD = ${MONEDAS[form.moneda]?.simbolo || ""} ${Number(tc.data.tasa).toFixed(3)}`
                            : "—"
                        }
                      />
                    </Field>
                  </div>
                )}
              </>
            )}

            <p className="cfg__nota">
              Los datos fiscales (RUC, razón social y domicilio fiscal) se editan en{" "}
              <strong>Comprobantes → Datos del emisor</strong>, para que sean la única
              fuente de tus boletas y facturas.
            </p>

            <div className="cfg__fila">
              <Field id="telefono" label="Teléfono (opcional)">
                <input
                  id="telefono"
                  type="tel"
                  value={form.telefono}
                  onChange={set("telefono")}
                  placeholder="Ej. 987 654 321"
                />
              </Field>
              <Field id="email_contacto" label="Email de contacto (opcional)">
                <input
                  id="email_contacto"
                  type="email"
                  value={form.email_contacto}
                  onChange={set("email_contacto")}
                  placeholder="reservas@tunegocio.pe"
                />
              </Field>
            </div>

            {error && <p className="cfg__error" role="alert">{error}</p>}
            {ok && <p className="cfg__ok">Datos guardados.</p>}

            <div className="cfg__acciones">
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* ---------- Apariencia (tema) ---------- */}
      <Card>
        <h2 className="cfg__card-title">Apariencia</h2>
        <p className="cfg__sub">
          Elige cómo se ve el sistema. Se aplica al instante y se recuerda en este dispositivo.
        </p>
        <div className="cfg__tema" role="radiogroup" aria-label="Tema de la interfaz">
          {TEMAS.map((t) => {
            const activo = modo === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={activo}
                className={`cfg__tema-opt ${activo ? "is-active" : ""}`}
                onClick={() => setModo(t.id)}
              >
                <t.icon size={20} aria-hidden="true" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ---------- Adelanto en reservas (Yape) ---------- */}
      <Card>
        <h2 className="cfg__card-title">Adelanto en reservas (Yape)</h2>
        <p className="cfg__sub">
          Pide un adelanto por Yape/transferencia al reservar por tu link público. Convierte
          una simple solicitud en una reserva con compromiso. Al huésped se le muestra tu
          número y deja su código de operación; tú lo verificas aquí.
        </p>
        {adel.loading && !adel.data ? (
          <StateMessage variant="loading" title="Cargando…" />
        ) : (
          <form className="cfg__form" onSubmit={guardarAdelanto} noValidate>
            <label className="cfg__check">
              <input
                type="checkbox"
                checked={adForm.activo}
                onChange={(e) => setAdForm((f) => ({ ...f, activo: e.target.checked }))}
              />
              Pedir adelanto en el link de reservas
            </label>

            {adForm.activo && (
              <>
                <div className="cfg__fila">
                  <Field id="ad-tipo" label="¿Cuánto adelanto?">
                    <select id="ad-tipo" value={adForm.tipo} onChange={setAd("tipo")}>
                      <option value="noche">El precio de 1 noche</option>
                      <option value="porcentaje">Un % del total</option>
                      <option value="monto">Un monto fijo (S/)</option>
                    </select>
                  </Field>
                  {adForm.tipo === "porcentaje" && (
                    <Field id="ad-valor" label="Porcentaje (%)">
                      <input id="ad-valor" type="number" min="1" max="100" step="1"
                        value={adForm.valor} onChange={setAd("valor")} placeholder="Ej. 30" />
                    </Field>
                  )}
                  {adForm.tipo === "monto" && (
                    <Field id="ad-valor" label="Monto (S/)">
                      <input id="ad-valor" type="number" min="0" step="0.01"
                        value={adForm.valor} onChange={setAd("valor")} placeholder="Ej. 50" />
                    </Field>
                  )}
                </div>
                <div className="cfg__fila">
                  <Field id="ad-numero" label="Número de Yape / transferencia" required>
                    <input id="ad-numero" type="tel" value={adForm.yape_numero}
                      onChange={setAd("yape_numero")} placeholder="Ej. 987 654 321" />
                  </Field>
                  <Field id="ad-titular" label="Titular (opcional)">
                    <input id="ad-titular" type="text" value={adForm.yape_titular}
                      onChange={setAd("yape_titular")} placeholder="Nombre que ve el huésped" />
                  </Field>
                </div>
              </>
            )}

            {adError && <p className="cfg__error" role="alert">{adError}</p>}
            {adOk && <p className="cfg__ok">Configuración guardada.</p>}

            <div className="cfg__acciones">
              <Button type="submit" disabled={adGuardando}>
                {adGuardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* ---------- Pagos online (pasarela) ---------- */}
      <Card>
        <h2 className="cfg__card-title">Pagos online (beta)</h2>
        <p className="cfg__sub">
          Deja que el huésped pague el adelanto <strong>en línea</strong> al reservar por tu link,
          y la reserva se confirma sola. Hoy en <strong>modo prueba (sandbox)</strong>: simula el
          pago sin cobrar de verdad. La pasarela real (Mercado Pago) se conecta cuando tu cuenta
          esté lista.
        </p>
        {pas.loading && !pas.data ? (
          <StateMessage variant="loading" title="Cargando…" />
        ) : (
          <form className="cfg__form" onSubmit={guardarPasarela} noValidate>
            <label className="cfg__check">
              <input
                type="checkbox"
                checked={pasActivo}
                onChange={(e) => setPasActivo(e.target.checked)}
              />
              Activar pagos online en el link de reservas (modo prueba)
            </label>
            {pasError && <p className="cfg__error" role="alert">{pasError}</p>}
            {pasOk && <p className="cfg__ok">Configuración guardada.</p>}
            <div className="cfg__acciones">
              <Button type="submit" disabled={pasGuardando}>
                {pasGuardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* ---------- Tu plan / suscripción ---------- */}
      <Card>
        <h2 className="cfg__card-title">Tu plan</h2>
        {info.loading && !info.data ? (
          <StateMessage variant="loading" title="Cargando…" />
        ) : (
          <div className="cfg__plan">
            <div className="cfg__plan-datos">
              <div className="cfg__plan-fila">
                <span className="cfg__plan-label">Plan</span>
                <strong>{PLAN_LABEL[plan] || plan}</strong>
              </div>
              <div className="cfg__plan-fila">
                <span className="cfg__plan-label">Estado</span>
                <Badge tone={ESTADO_TONO[estado] || "neutral"}>
                  {estado}
                </Badge>
              </div>
              {vencimiento && (
                <div className="cfg__plan-fila">
                  <span className="cfg__plan-label">Vigencia</span>
                  <span className={urge ? "cfg__vence cfg__vence--urge" : "cfg__vence"}>
                    {vencimiento}
                  </span>
                </div>
              )}
            </div>
            <div className="cfg__plan-cta">
              <p className="cfg__plan-hint">
                Para activar o renovar tu suscripción, escríbenos y te ayudamos
                (pago por Yape o transferencia).
              </p>
              <Button
                variant="secondary"
                icon="💬"
                onClick={() => window.open(waUrl, "_blank", "noopener")}
              >
                Activar / Renovar por WhatsApp
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
