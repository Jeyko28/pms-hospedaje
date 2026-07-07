import { useEffect, useMemo, useState } from "react";
import { Hotel, BedDouble, CheckCircle2 } from "lucide-react";
import Field from "../components/Field";
import Button from "../components/Button";
import { api } from "../api/client";
import { useTheme } from "../hooks/useTheme";
import { ymdLocal } from "../utils/fechas";
import { formatoMoneda, convertirDesdeBase } from "../utils/moneda";
import "./ReservaPublica.css";

/**
 * ReservaPublica — pagina PUBLICA de reservas (motor de reservas).
 * El huesped llega por el link del hospedaje (#/reservar/<slug>), elige
 * fechas, ve habitaciones disponibles, y envia su reserva. Sin login.
 *
 * Flujo: cargar hospedaje -> elegir fechas -> ver disponibles -> elegir
 * habitacion -> datos del huesped -> confirmar.
 *
 * Props: slug
 */
export default function ReservaPublica({ slug }) {
  useTheme();
  const hoy = ymdLocal();

  const [cargando, setCargando] = useState(true);
  const [hospedaje, setHospedaje] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);

  const [fechas, setFechas] = useState({ entrada: hoy, salida: "" });
  const [buscando, setBuscando] = useState(false);
  const [disponibles, setDisponibles] = useState(null); // null=sin buscar
  const [noches, setNoches] = useState(0);

  const [seleccion, setSeleccion] = useState(null); // habitacion elegida
  const [datos, setDatos] = useState({ nombre: "", email: "", telefono: "" });
  const [codigoOp, setCodigoOp] = useState(""); // código de operación del adelanto (Yape)
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [exito, setExito] = useState(null); // {reserva_id, total}

  // Cargar info del hospedaje por slug.
  useEffect(() => {
    let vivo = true;
    api
      .publicoHospedaje(slug)
      .then((d) => vivo && setHospedaje(d))
      .catch((e) => vivo && setErrorCarga(e.message))
      .finally(() => vivo && setCargando(false));
    return () => (vivo = false);
  }, [slug]);

  async function buscar(e) {
    e?.preventDefault();
    setDisponibles(null);
    setSeleccion(null);
    if (!fechas.entrada || !fechas.salida) return;
    setBuscando(true);
    try {
      const d = await api.publicoDisponibilidad(slug, fechas.entrada, fechas.salida);
      setDisponibles(d.habitaciones);
      setNoches(d.noches);
    } catch (err) {
      setErrorCarga(err.message);
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar(e) {
    e.preventDefault();
    setErrorEnvio(null);
    if (!datos.nombre.trim()) {
      setErrorEnvio("Indica tu nombre.");
      return;
    }
    // Exigir al menos una forma de contacto (correo o teléfono).
    if (!datos.email.trim() && !datos.telefono.trim()) {
      setErrorEnvio("Déjanos un correo o un teléfono para confirmarte la reserva.");
      return;
    }
    if (
      datos.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())
    ) {
      setErrorEnvio("Escribe un correo válido.");
      return;
    }
    setEnviando(true);
    try {
      const r = await api.publicoReservar(slug, {
        habitacion_id: seleccion.id,
        fecha_entrada: fechas.entrada,
        fecha_salida: fechas.salida,
        nombre: datos.nombre.trim(),
        email: datos.email.trim(),
        telefono: datos.telefono.trim(),
        adelanto_codigo: codigoOp.trim(),
      });
      setExito(r);
    } catch (err) {
      setErrorEnvio(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const set = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  // Formateo en la MONEDA BASE del hospedaje (la página pública no tiene sesión,
  // así que no se usa la moneda global). Si el hospedaje acepta USD, se muestra
  // un equivalente REFERENCIAL.
  const base = hospedaje?.cambio?.base || "PEN";
  const refTasa = hospedaje?.cambio?.referencia?.tasa || 0;
  const fmt = (x) => formatoMoneda(x, base);
  const refUSD = (x) =>
    refTasa > 0 ? `≈ US$ ${convertirDesdeBase(x, refTasa).toFixed(2)}` : "";

  // ---------- Render ----------
  if (cargando) {
    return <div className="pub__centro">Cargando…</div>;
  }
  if (errorCarga && !hospedaje) {
    return (
      <div className="pub__centro">
        <p>{errorCarga}</p>
      </div>
    );
  }

  // Pantalla de éxito tras reservar.
  if (exito) {
    return (
      <div className="pub">
        <div className="pub__card pub__exito">
          <CheckCircle2 size={56} className="pub__exito-icono" />
          <h1>¡Reserva enviada!</h1>
          <p>
            Gracias, {datos.nombre}. Tu solicitud de reserva en{" "}
            <strong>{hospedaje.hospedaje.nombre}</strong> fue registrada.
          </p>
          <p className="pub__exito-detalle">
            Código #{exito.reserva_id} · {exito.noches} noche(s) ·{" "}
            <strong>{fmt(exito.total)}</strong>
          </p>
          {exito.adelanto_monto > 0 ? (
            <p className="pub__nota">
              Registramos tu adelanto de <strong>{fmt(exito.adelanto_monto)}</strong>.
              El hospedaje lo verificará y te confirmará la reserva por los datos que dejaste.
            </p>
          ) : (
            <p className="pub__nota">
              El hospedaje confirmará tu reserva. Te contactarán por los datos que dejaste.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pub">
      <div className="pub__card">
        <header className="pub__head">
          <span className="pub__logo" aria-hidden="true">
            <Hotel size={28} strokeWidth={2} />
          </span>
          <div>
            <h1 className="pub__titulo">{hospedaje.hospedaje.nombre}</h1>
            <p className="pub__sub">Reserva tu estadía en línea</p>
          </div>
        </header>

        {/* Paso 1: fechas */}
        <form className="pub__fechas" onSubmit={buscar}>
          <Field id="entrada" label="Entrada">
            <input
              id="entrada"
              type="date"
              min={hoy}
              value={fechas.entrada}
              onChange={(e) => setFechas((f) => ({ ...f, entrada: e.target.value }))}
            />
          </Field>
          <Field id="salida" label="Salida">
            <input
              id="salida"
              type="date"
              min={fechas.entrada || hoy}
              value={fechas.salida}
              onChange={(e) => setFechas((f) => ({ ...f, salida: e.target.value }))}
            />
          </Field>
          <Button type="submit" disabled={buscando || !fechas.salida}>
            {buscando ? "Buscando…" : "Ver disponibilidad"}
          </Button>
        </form>

        {/* Paso 2: habitaciones disponibles */}
        {disponibles && disponibles.length === 0 && (
          <p className="pub__vacio">No hay habitaciones disponibles en esas fechas.</p>
        )}
        {disponibles && disponibles.length > 0 && !seleccion && (
          <div className="pub__habs">
            <p className="pub__habs-titulo">{noches} noche(s) · elige una habitación:</p>
            {disponibles.map((h) => (
              <button
                key={h.id}
                type="button"
                className="pub__hab"
                onClick={() => setSeleccion(h)}
              >
                <span className="pub__hab-icono" aria-hidden="true">
                  <BedDouble size={22} />
                </span>
                <span className="pub__hab-info">
                  <strong>Hab. {h.numero}</strong> · {h.tipo}
                  <span className="pub__hab-precio">
                    {fmt(h.precio_base)}/noche
                  </span>
                </span>
                <span className="pub__hab-total">
                  {fmt(h.total)}
                  {refUSD(h.total) && <span className="pub__hab-ref">{refUSD(h.total)}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Paso 3: datos del huésped */}
        {seleccion && (
          <form className="pub__datos" onSubmit={confirmar}>
            <div className="pub__resumen">
              <span>
                Hab. {seleccion.numero} · {seleccion.tipo} · {noches} noche(s)
              </span>
              <span className="pub__resumen-precio">
                <strong>{fmt(seleccion.total)}</strong>
                {refUSD(seleccion.total) && (
                  <span className="pub__hab-ref">{refUSD(seleccion.total)} referencial</span>
                )}
              </span>
            </div>
            <Field id="nombre" label="Tu nombre" required>
              <input id="nombre" value={datos.nombre} onChange={set("nombre")} autoFocus />
            </Field>
            <p className="pub__contacto-nota">
              Déjanos al menos una forma de contacto para confirmarte la reserva.
            </p>
            <div className="pub__datos-fila">
              <Field id="email" label="Correo">
                <input
                  id="email"
                  type="email"
                  value={datos.email}
                  onChange={set("email")}
                  placeholder="tucorreo@ejemplo.com"
                />
              </Field>
              <Field id="telefono" label="Teléfono / WhatsApp">
                <input
                  id="telefono"
                  type="tel"
                  value={datos.telefono}
                  onChange={set("telefono")}
                  placeholder="Ej. 999 888 777"
                />
              </Field>
            </div>
            {hospedaje.adelanto?.activo && seleccion.adelanto > 0 && (
              <div className="pub__adelanto">
                <p className="pub__adelanto-titulo">
                  Asegura tu reserva con un adelanto de{" "}
                  <strong>{fmt(seleccion.adelanto)}</strong>
                </p>
                <p className="pub__adelanto-yape">
                  Yapea o transfiere a{" "}
                  <strong>{hospedaje.adelanto.yape_numero}</strong>
                  {hospedaje.adelanto.yape_titular && <> · {hospedaje.adelanto.yape_titular}</>}
                </p>
                <Field id="cod-op" label="Código de operación (Yape/transferencia)">
                  <input
                    id="cod-op"
                    value={codigoOp}
                    onChange={(e) => setCodigoOp(e.target.value)}
                    placeholder="Ej. 01234567"
                    inputMode="numeric"
                  />
                </Field>
                <p className="pub__adelanto-nota">
                  El hospedaje verificará tu adelanto y confirmará la reserva. El resto lo
                  pagas al llegar.
                </p>
              </div>
            )}
            {errorEnvio && <p className="pub__error" role="alert">{errorEnvio}</p>}
            <div className="pub__acciones">
              <Button type="button" variant="secondary" onClick={() => setSeleccion(null)}>
                Cambiar habitación
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando
                  ? "Enviando…"
                  : hospedaje.adelanto?.activo && seleccion.adelanto > 0
                  ? "Reservar y registrar adelanto"
                  : "Confirmar reserva"}
              </Button>
            </div>
          </form>
        )}

        <footer className="pub__footer">Reservas con Stanza</footer>
      </div>
    </div>
  );
}
