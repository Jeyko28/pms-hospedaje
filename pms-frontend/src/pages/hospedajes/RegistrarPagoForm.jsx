import { useEffect, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";

/**
 * RegistrarPagoForm — registra un pago de suscripción (Yape/transferencia) de
 * un hospedaje-cliente. Al guardar, el backend ACTIVA y EXTIENDE al cliente
 * automáticamente (estado activo + fecha de vencimiento). Sugiere el monto
 * según el plan/periodo (y el precio fundador S/99), editable a mano.
 *
 * Props: hospedaje, onGuardado(resultado), onCancelar
 */
const PRECIOS = {
  inicia: { mensual: 79, anual: 790 },
  crece: { mensual: 139, anual: 1390 },
  pro: { mensual: 239, anual: 2390 },
};

function sugerir(plan, periodo, fundador) {
  if (fundador) return periodo === "anual" ? 990 : 99;
  return PRECIOS[plan]?.[periodo] ?? 0;
}

export default function RegistrarPagoForm({ hospedaje, onGuardado, onCancelar }) {
  const [form, setForm] = useState({
    plan: hospedaje?.plan && hospedaje.plan !== "trial" ? hospedaje.plan : "inicia",
    periodo: "mensual",
    metodo: "yape",
    es_fundador: false,
    monto: sugerir(
      hospedaje?.plan && hospedaje.plan !== "trial" ? hospedaje.plan : "inicia",
      "mensual",
      false
    ),
    nota: "",
  });
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  // Al cambiar plan/periodo/fundador, re-sugiere el monto (editable a mano).
  useEffect(() => {
    setForm((f) => ({ ...f, monto: sugerir(f.plan, f.periodo, f.es_fundador) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.plan, form.periodo, form.es_fundador]);

  async function enviar(ev) {
    ev.preventDefault();
    setErrorGeneral(null);
    const monto = Number(form.monto);
    if (!monto || monto <= 0) {
      setErrorGeneral("Indica un monto válido.");
      return;
    }
    setGuardando(true);
    try {
      const r = await api.registrarPagoSuscripcion(hospedaje.id, {
        monto,
        metodo: form.metodo,
        periodo: form.periodo,
        plan: form.plan,
        nota: form.nota.trim(),
        es_fundador: form.es_fundador,
      });
      onGuardado(r);
    } catch (err) {
      setErrorGeneral(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="entidad-form" onSubmit={enviar} noValidate>
      <p className="entidad-form__seccion">
        Cobro para <strong>{hospedaje?.nombre}</strong>. Al registrar, el cliente
        se activa y se extiende su vencimiento automáticamente.
      </p>

      <div className="entidad-form__fila">
        <Field id="plan" label="Plan">
          <select id="plan" value={form.plan} onChange={set("plan")}>
            <option value="inicia">Inicia</option>
            <option value="crece">Crece</option>
            <option value="pro">Pro</option>
          </select>
        </Field>
        <Field id="periodo" label="Periodo">
          <select id="periodo" value={form.periodo} onChange={set("periodo")}>
            <option value="mensual">Mensual (+30 días)</option>
            <option value="anual">Anual (+365 días)</option>
          </select>
        </Field>
      </div>

      <div className="entidad-form__fila">
        <Field id="metodo" label="Método de pago">
          <select id="metodo" value={form.metodo} onChange={set("metodo")}>
            <option value="yape">Yape</option>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="otro">Otro</option>
          </select>
        </Field>
        <Field id="monto" label="Monto (S/)" hint="Sugerido según el plan; puedes editarlo.">
          <input
            id="monto"
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={set("monto")}
          />
        </Field>
      </div>

      <label className="entidad-form__check">
        <input
          type="checkbox"
          checked={form.es_fundador}
          onChange={(e) => setForm((f) => ({ ...f, es_fundador: e.target.checked }))}
        />
        Precio fundador (S/99 vitalicio) — guarda el precio pactado
      </label>

      <Field id="nota" label="Nota (opcional)">
        <input
          id="nota"
          type="text"
          value={form.nota}
          onChange={set("nota")}
          placeholder="Ej. N° de operación Yape, acuerdo, etc."
        />
      </Field>

      {errorGeneral && (
        <p className="entidad-form__error" role="alert">
          {errorGeneral}
        </p>
      )}

      <div className="entidad-form__acciones">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando ? "Registrando…" : "Registrar pago y activar"}
        </Button>
      </div>
    </form>
  );
}
