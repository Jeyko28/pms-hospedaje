import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Field from "../../components/Field";
import StateMessage from "../../components/StateMessage";
import "./Configuracion.css";

// Número de WhatsApp de soporte del SaaS (mismo que la página de precios).
const SOPORTE_WHATSAPP = "51981487284";

const VACIO = {
  nombre: "",
  ruc: "",
  razon_social: "",
  direccion: "",
  telefono: "",
  email_contacto: "",
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

  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  // Cargar los datos existentes en el formulario.
  useEffect(() => {
    if (info.data) {
      setForm({
        nombre: info.data.nombre || "",
        ruc: info.data.ruc || "",
        razon_social: info.data.razon_social || "",
        direccion: info.data.direccion || "",
        telefono: info.data.telefono || "",
        email_contacto: info.data.email_contacto || "",
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
    if (form.ruc.trim() && !/^\d{11}$/.test(form.ruc.trim())) {
      setError("El RUC debe tener 11 dígitos.");
      return;
    }
    setGuardando(true);
    try {
      await api.guardarMiHospedaje({
        nombre: form.nombre.trim(),
        ruc: form.ruc.trim(),
        razon_social: form.razon_social.trim(),
        direccion: form.direccion.trim(),
        telefono: form.telefono.trim(),
        email_contacto: form.email_contacto.trim(),
      });
      setOk(true);
      info.recargar();
      setTimeout(() => setOk(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
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

            <div className="cfg__fila">
              <Field id="ruc" label="RUC (opcional)">
                <input
                  id="ruc"
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.ruc}
                  onChange={set("ruc")}
                  placeholder="11 dígitos"
                />
              </Field>
              <Field id="razon_social" label="Razón social (opcional)">
                <input
                  id="razon_social"
                  type="text"
                  value={form.razon_social}
                  onChange={set("razon_social")}
                  placeholder="Nombre legal del negocio"
                />
              </Field>
            </div>

            <Field id="direccion" label="Dirección (opcional)">
              <input
                id="direccion"
                type="text"
                value={form.direccion}
                onChange={set("direccion")}
                placeholder="Av. / Calle, número, distrito, ciudad"
              />
            </Field>

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
