import { useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Field from "../../components/Field";
import StateMessage from "../../components/StateMessage";
import { useToast } from "../../components/Toast";
import "./Tarifas.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

// weekday(): 0=Lunes … 6=Domingo (igual que Python).
const DIAS = [
  { v: 0, l: "Lun" },
  { v: 1, l: "Mar" },
  { v: 2, l: "Mié" },
  { v: 3, l: "Jue" },
  { v: 4, l: "Vie" },
  { v: 5, l: "Sáb" },
  { v: 6, l: "Dom" },
];

const VACIO = {
  nombre: "",
  habitacion_id: "", // "" = todas
  fecha_inicio: "",
  fecha_fin: "",
  dias: [], // array de números 0..6
  modo: "precio", // "precio" | "pct"
  precio: "",
  ajuste_pct: "",
};

function etiquetaDias(csv) {
  if (!csv) return null;
  const set = new Set(String(csv).split(",").map((x) => x.trim()));
  return DIAS.filter((d) => set.has(String(d.v))).map((d) => d.l).join(", ");
}

export default function Tarifas() {
  const tarifas = useApi(api.tarifas);
  const habitaciones = useApi(api.habitaciones);
  const toast = useToast();

  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [borrandoId, setBorrandoId] = useState(null);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  function toggleDia(v) {
    setForm((f) => ({
      ...f,
      dias: f.dias.includes(v) ? f.dias.filter((x) => x !== v) : [...f.dias, v],
    }));
  }

  function nombreHab(id) {
    const h = (habitaciones.data || []).find((x) => Number(x.id) === Number(id));
    return h ? `Hab. ${h.numero}` : `Hab. ${id}`;
  }

  async function crear(ev) {
    ev.preventDefault();
    const tieneCondicion = form.fecha_inicio || form.dias.length > 0;
    if (!tieneCondicion) {
      toast.error("Indica un rango de fechas o unos días de la semana.");
      return;
    }
    if (form.fecha_inicio && form.fecha_fin && form.fecha_fin < form.fecha_inicio) {
      toast.error("La fecha fin no puede ser anterior a la de inicio.");
      return;
    }
    const precio = form.modo === "precio" ? Number(form.precio) : null;
    const pct = form.modo === "pct" ? Number(form.ajuste_pct) : null;
    if (form.modo === "precio" && (!precio || precio <= 0)) {
      toast.error("Indica un precio por noche válido.");
      return;
    }
    if (form.modo === "pct" && (!pct || Number.isNaN(pct))) {
      toast.error("Indica un ajuste porcentual (ej. 50 o -10).");
      return;
    }
    setGuardando(true);
    try {
      await api.crearTarifa({
        nombre: form.nombre.trim(),
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        dias_semana: form.dias.slice().sort().join(","),
        habitacion_id: form.habitacion_id ? Number(form.habitacion_id) : null,
        precio,
        ajuste_pct: pct,
      });
      setForm(VACIO);
      tarifas.recargar();
      toast.success("Tarifa creada.");
    } catch (e) {
      toast.error(e.message || "No se pudo crear la tarifa.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(t) {
    if (!window.confirm(`Eliminar la tarifa "${t.nombre || "sin nombre"}"?`)) return;
    setBorrandoId(t.id);
    try {
      await api.eliminarTarifa(t.id);
      toast.success("Tarifa eliminada.");
      tarifas.recargar();
    } catch (e) {
      toast.error(e.message || "No se pudo eliminar.");
    } finally {
      setBorrandoId(null);
    }
  }

  const lista = tarifas.data || [];

  return (
    <div className="tarifas">
      {/* Formulario de nueva tarifa */}
      <Card>
        <h2 className="tarifas__titulo">Nueva tarifa</h2>
        <p className="tarifas__hint">
          Precio especial para ciertas fechas (temporada) o días de la semana
          (fin de semana). Si no hay tarifa, se usa el precio base de la habitación.
        </p>
        <form className="tarifas__form" onSubmit={crear}>
          <div className="tarifas__fila">
            <Field id="t-nombre" label="Nombre">
              <input
                id="t-nombre"
                type="text"
                value={form.nombre}
                onChange={set("nombre")}
                placeholder="Ej. Temporada alta, Fin de semana"
              />
            </Field>
            <Field id="t-hab" label="Aplica a">
              <select id="t-hab" value={form.habitacion_id} onChange={set("habitacion_id")}>
                <option value="">Todas las habitaciones</option>
                {(habitaciones.data || []).map((h) => (
                  <option key={h.id} value={h.id}>
                    Hab. {h.numero} — {h.tipo}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="tarifas__fila">
            <Field id="t-ini" label="Desde (opcional)">
              <input id="t-ini" type="date" value={form.fecha_inicio} onChange={set("fecha_inicio")} />
            </Field>
            <Field id="t-fin" label="Hasta (opcional)">
              <input
                id="t-fin"
                type="date"
                value={form.fecha_fin}
                min={form.fecha_inicio || undefined}
                onChange={set("fecha_fin")}
              />
            </Field>
          </div>

          <Field id="t-dias" label="Días de la semana (opcional)">
            <div className="tarifas__dias" role="group" aria-label="Días de la semana">
              {DIAS.map((d) => (
                <button
                  type="button"
                  key={d.v}
                  className={`tarifas__dia${form.dias.includes(d.v) ? " tarifas__dia--on" : ""}`}
                  onClick={() => toggleDia(d.v)}
                >
                  {d.l}
                </button>
              ))}
            </div>
          </Field>

          <div className="tarifas__fila">
            <Field id="t-modo" label="Tipo de precio">
              <select id="t-modo" value={form.modo} onChange={set("modo")}>
                <option value="precio">Precio fijo por noche</option>
                <option value="pct">Ajuste porcentual</option>
              </select>
            </Field>
            {form.modo === "precio" ? (
              <Field id="t-precio" label="Precio por noche (S/)">
                <input
                  id="t-precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio}
                  onChange={set("precio")}
                  placeholder="Ej. 120"
                />
              </Field>
            ) : (
              <Field id="t-pct" label="Ajuste % (ej. 50 o -10)">
                <input
                  id="t-pct"
                  type="number"
                  step="1"
                  value={form.ajuste_pct}
                  onChange={set("ajuste_pct")}
                  placeholder="Ej. 50"
                />
              </Field>
            )}
          </div>

          <div className="tarifas__acciones">
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Crear tarifa"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Lista de tarifas */}
      <section className="tarifas__lista-sec">
        <h2 className="tarifas__titulo">Tarifas configuradas</h2>
        {tarifas.loading && !tarifas.data && (
          <Card><StateMessage variant="loading" title="Cargando…" /></Card>
        )}
        {tarifas.data && lista.length === 0 && (
          <Card>
            <StateMessage
              variant="empty"
              title="Sin tarifas"
              message="Aún no hay tarifas especiales. Las reservas usan el precio base de cada habitación."
            />
          </Card>
        )}
        {lista.length > 0 && (
          <div className="tarifas__lista">
            {lista.map((t) => {
              const dias = etiquetaDias(t.dias_semana);
              const rango =
                t.fecha_inicio && t.fecha_fin
                  ? `${t.fecha_inicio} → ${t.fecha_fin}`
                  : t.fecha_inicio
                  ? `Desde ${t.fecha_inicio}`
                  : null;
              return (
                <Card key={t.id} padding="sm" className="tarifas__item">
                  <div className="tarifas__item-info">
                    <div className="tarifas__item-top">
                      <strong>{t.nombre || "Tarifa"}</strong>
                      {t.precio != null && t.precio > 0 ? (
                        <Badge tone="info" icon="S/">{formatoMoneda.format(t.precio)}/noche</Badge>
                      ) : (
                        <Badge tone={t.ajuste_pct >= 0 ? "info" : "success"} icon="%">
                          {t.ajuste_pct > 0 ? "+" : ""}{t.ajuste_pct}%
                        </Badge>
                      )}
                    </div>
                    <span className="tarifas__item-meta">
                      {[
                        t.habitacion_id ? nombreHab(t.habitacion_id) : "Todas las habitaciones",
                        rango,
                        dias ? `Días: ${dias}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => eliminar(t)}
                    disabled={borrandoId === t.id}
                  >
                    {borrandoId === t.id ? "Eliminando…" : "Eliminar"}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
