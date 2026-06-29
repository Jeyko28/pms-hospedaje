import { useEffect, useRef, useState } from "react";
import Field from "../../components/Field";
import Button from "../../components/Button";
import { api } from "../../api/client";
import { normalizar } from "../../utils/normalizar";
import "./SelectorHuesped.css";

/**
 * SelectorHuesped — campo "buscar o crear" para elegir el huesped de una
 * reserva sin salir del formulario.
 *
 * Flujo (patron tipo Cloudbeds/Booking):
 *  - Escribes nombre/DNI -> filtra los huespedes que YA existen.
 *  - Si aparece, lo eliges con un clic (no se reescribe nada).
 *  - Si NO existe, "+ Crear «texto»" despliega 3 campos (nombre, telefono,
 *    DNI); al guardar queda creado y seleccionado al instante.
 *  - Sobre un huesped ya elegido, "Actualizar datos" edita su ficha en linea
 *    (por si menciona un dato nuevo, ej. cambio de telefono).
 *
 * El componente NO mantiene la lista maestra: avisa al padre con
 * onHuespedCreado para que refresque su useApi de huespedes.
 *
 * Props:
 *   huespedes:        lista actual (para buscar)
 *   value:            id del huesped seleccionado (string) o ""
 *   onChange:         (idComoString) => void
 *   onHuespedCreado:  () => void  (refrescar la lista maestra; opcional)
 */
export default function SelectorHuesped({
  huespedes,
  value,
  onChange,
  onHuespedCreado,
}) {
  const [sel, setSel] = useState(null); // objeto huesped seleccionado
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState(undefined); // undefined=cerrado, null=crear, id=editar
  const [form, setForm] = useState({ nombre: "", telefono: "", documento: "", tipo_documento: "DNI" });
  const [guardando, setGuardando] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const ref = useRef(null);

  // Sincroniza el objeto seleccionado con el value externo. Si el id no esta
  // en la lista (ej. recien creado), conserva el sel actual en vez de borrarlo.
  useEffect(() => {
    if (!value) {
      setSel(null);
      return;
    }
    const h = huespedes.find((x) => String(x.id) === String(value));
    if (h) setSel(h);
  }, [value, huespedes]);

  // Cierra el desplegable al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [abierto]);

  const q = normalizar(texto.trim());
  const coincidencias = (q
    ? huespedes.filter(
        (h) =>
          normalizar(h.nombre).includes(q) ||
          normalizar(h.documento || "").includes(q) ||
          normalizar(h.email || "").includes(q)
      )
    : huespedes
  ).slice(0, 6);
  const hayExacto = huespedes.some((h) => normalizar(h.nombre.trim()) === q);

  function elegir(h) {
    setSel(h);
    onChange(String(h.id));
    setAbierto(false);
    setTexto("");
  }

  function limpiar() {
    setSel(null);
    onChange("");
    setTexto("");
    setAbierto(true);
  }

  function abrirCrear() {
    setEditId(null);
    setForm({ nombre: texto.trim(), telefono: "", documento: "", tipo_documento: "DNI" });
    setErrMsg(null);
    setAbierto(false);
  }

  function abrirEditar() {
    if (!sel) return;
    setEditId(sel.id);
    setForm({
      nombre: sel.nombre || "",
      telefono: sel.telefono || "",
      documento: sel.documento || "",
      tipo_documento: sel.tipo_documento || "DNI",
    });
    setErrMsg(null);
  }

  const setCampo = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  async function guardar(ev) {
    ev.preventDefault();
    if (!form.nombre.trim()) {
      setErrMsg("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    setErrMsg(null);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        documento: form.documento.trim(),
        tipo_documento: form.tipo_documento,
      };
      const huesped =
        editId == null
          ? await api.crearHuesped(datos)
          : await api.editarHuesped(editId, datos);
      setSel(huesped);
      onChange(String(huesped.id));
      onHuespedCreado?.();
      setEditId(undefined);
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setGuardando(false);
    }
  }

  // --- Modo edicion/creacion (mini-formulario en linea) ---
  if (editId !== undefined) {
    return (
      <div className="selh selh--edit" ref={ref}>
        <p className="selh__edit-titulo">
          {editId == null ? "Nuevo huésped" : "Actualizar datos"}
        </p>
        <Field id="selh-nombre" label="Nombre" required>
          <input
            id="selh-nombre"
            type="text"
            value={form.nombre}
            onChange={setCampo("nombre")}
            placeholder="Nombre completo"
            autoFocus
          />
        </Field>
        <div className="selh__edit-fila">
          <Field id="selh-tel" label="Teléfono / WhatsApp">
            <input
              id="selh-tel"
              type="tel"
              value={form.telefono}
              onChange={setCampo("telefono")}
              placeholder="Ej. 987 654 321"
            />
          </Field>
          <Field id="selh-tipo-doc" label="Tipo doc.">
            <select id="selh-tipo-doc" value={form.tipo_documento} onChange={setCampo("tipo_documento")}>
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
              <option value="Pasaporte">Pasaporte</option>
            </select>
          </Field>
          <Field id="selh-doc" label="N.º documento">
            <input
              id="selh-doc"
              type="text"
              value={form.documento}
              onChange={setCampo("documento")}
              placeholder={form.tipo_documento === "DNI" ? "8 dígitos" : "Número"}
            />
          </Field>
        </div>
        {errMsg && (
          <p className="selh__error" role="alert">
            {errMsg}
          </p>
        )}
        <div className="selh__edit-acciones">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setEditId(undefined)}
          >
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : editId == null ? "Crear y elegir" : "Guardar"}
          </Button>
        </div>
      </div>
    );
  }

  // --- Huesped ya seleccionado: tarjeta con datos + acciones ---
  if (sel) {
    const detalle = [sel.documento, sel.telefono].filter(Boolean).join(" · ");
    return (
      <div className="selh selh--sel" ref={ref}>
        <div className="selh__chip">
          <div className="selh__chip-info">
            <strong>{sel.nombre}</strong>
            {detalle && <span className="selh__chip-detalle">{detalle}</span>}
          </div>
          <div className="selh__chip-acciones">
            <button type="button" className="selh__link" onClick={abrirEditar}>
              Actualizar datos
            </button>
            <button type="button" className="selh__link" onClick={limpiar}>
              Cambiar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Busqueda (sin seleccion) ---
  return (
    <div className="selh" ref={ref}>
      <input
        id="huesped"
        type="text"
        className="selh__input"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        placeholder="Busca por nombre o DNI…"
        autoComplete="off"
      />
      {abierto && (
        <div className="selh__menu">
          {coincidencias.map((h) => (
            <button
              key={h.id}
              type="button"
              className="selh__opcion"
              onClick={() => elegir(h)}
            >
              <span className="selh__opcion-nombre">{h.nombre}</span>
              {(h.documento || h.telefono) && (
                <span className="selh__opcion-detalle">
                  {[h.documento, h.telefono].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>
          ))}
          {coincidencias.length === 0 && !q && (
            <p className="selh__vacio">Escribe para buscar un huésped.</p>
          )}
          {q && !hayExacto && (
            <button type="button" className="selh__crear" onClick={abrirCrear}>
              + Crear «{texto.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
