import { useMemo, useState } from "react";
import {
  PartyPopper,
  BedDouble,
  CalendarDays,
  ConciergeBell,
  CheckCircle2,
} from "lucide-react";
import Button from "./Button";
import Field from "./Field";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRuta } from "../router/Router";
import "./AsistenteBienvenida.css";

/**
 * AsistenteBienvenida — guía paso a paso que aparece la PRIMERA vez que un
 * cliente entra (tras registrarse). Navega con Siguiente/Atrás y se puede
 * Omitir en cualquier momento. Incluye un mini-paso para crear la primera
 * habitación sin salir del asistente.
 *
 * Se recuerda en localStorage por usuario para no volver a mostrarlo.
 *
 * Props: onCerrar() — se llama al terminar u omitir.
 */
export default function AsistenteBienvenida({ onCerrar }) {
  const { usuario } = useAuth();
  const { navegar } = useRuta();
  const [paso, setPaso] = useState(0);

  // Estado del mini-formulario de habitación (paso 2).
  const [hab, setHab] = useState({ numero: "", tipo: "Doble", precio_base: "" });
  const [creando, setCreando] = useState(false);
  const [habCreada, setHabCreada] = useState(false);
  const [errorHab, setErrorHab] = useState(null);

  function cerrar() {
    onCerrar?.();
  }

  function irASeccion(id) {
    cerrar();
    navegar(id);
  }

  async function crearHabitacion() {
    setErrorHab(null);
    const precio = Number(hab.precio_base);
    if (!hab.numero.trim()) return setErrorHab("Indica el número de la habitación.");
    if (!hab.precio_base || isNaN(precio) || precio < 0)
      return setErrorHab("Indica un precio válido.");
    setCreando(true);
    try {
      await api.crearHabitacion({
        numero: hab.numero.trim(),
        tipo: hab.tipo,
        precio_base: precio,
        estado_limpieza: "Limpia",
        estado: "disponible",
      });
      setHabCreada(true);
    } catch (e) {
      setErrorHab(e.message);
    } finally {
      setCreando(false);
    }
  }

  // Definición de los pasos del asistente.
  const pasos = useMemo(
    () => [
      {
        icono: <PartyPopper size={40} strokeWidth={1.8} />,
        titulo: `¡Bienvenido, ${usuario?.nombre || ""}!`,
        contenido: (
          <>
            <p>
              Tu hospedaje ya está listo. Tienes <strong>14 días de prueba
              gratis</strong> para conocer todo.
            </p>
            <p className="asistente__sub">
              Te guiamos en 3 pasos rápidos para que empieces hoy mismo.
            </p>
          </>
        ),
      },
      {
        icono: <BedDouble size={40} strokeWidth={1.8} />,
        titulo: "Crea tu primera habitación",
        contenido: habCreada ? (
          <div className="asistente__ok">
            <CheckCircle2 size={28} />
            <p>¡Listo! Habitación creada. Puedes añadir más cuando quieras.</p>
          </div>
        ) : (
          <>
            <p className="asistente__sub">
              Empecemos por lo básico: registra una habitación.
            </p>
            <div className="asistente__form">
              <div className="asistente__form-fila">
                <Field id="w-num" label="Número">
                  <input
                    id="w-num"
                    value={hab.numero}
                    onChange={(e) => setHab((h) => ({ ...h, numero: e.target.value }))}
                    placeholder="Ej. 101"
                  />
                </Field>
                <Field id="w-tipo" label="Tipo">
                  <select
                    id="w-tipo"
                    value={hab.tipo}
                    onChange={(e) => setHab((h) => ({ ...h, tipo: e.target.value }))}
                  >
                    <option>Individual</option>
                    <option>Doble</option>
                    <option>Triple</option>
                    <option>Suite</option>
                    <option>Familiar</option>
                  </select>
                </Field>
              </div>
              <Field id="w-precio" label="Precio por noche (S/)">
                <input
                  id="w-precio"
                  type="number"
                  min="0"
                  value={hab.precio_base}
                  onChange={(e) => setHab((h) => ({ ...h, precio_base: e.target.value }))}
                  placeholder="Ej. 65"
                />
              </Field>
              {errorHab && <p className="asistente__error" role="alert">{errorHab}</p>}
              <Button onClick={crearHabitacion} disabled={creando}>
                {creando ? "Creando…" : "Crear habitación"}
              </Button>
            </div>
          </>
        ),
      },
      {
        icono: <ConciergeBell size={40} strokeWidth={1.8} />,
        titulo: "Así funciona tu PMS",
        contenido: (
          <ul className="asistente__guia">
            <li>
              <CalendarDays size={20} />
              <span><strong>Reservas:</strong> registra quién llega y cuándo.</span>
            </li>
            <li>
              <ConciergeBell size={20} />
              <span><strong>Recepción:</strong> haz check-in, check-out y cobra.</span>
            </li>
            <li>
              <BedDouble size={20} />
              <span><strong>Habitaciones y Huéspedes:</strong> tu inventario y directorio.</span>
            </li>
          </ul>
        ),
      },
      {
        icono: <CheckCircle2 size={40} strokeWidth={1.8} />,
        titulo: "¡Todo listo para empezar!",
        contenido: (
          <>
            <p>Ya puedes gestionar tu hospedaje. ¿Por dónde quieres empezar?</p>
            <div className="asistente__accesos">
              <Button variant="secondary" onClick={() => irASeccion("habitaciones")}>
                Habitaciones
              </Button>
              <Button variant="secondary" onClick={() => irASeccion("reservas")}>
                Reservas
              </Button>
            </div>
          </>
        ),
      },
    ],
    [usuario, hab, habCreada, creando, errorHab]
  );

  const actual = pasos[paso];
  const esUltimo = paso === pasos.length - 1;
  const total = pasos.length;

  return (
    <div className="asistente__overlay">
      <div
        className="asistente"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asistente-titulo"
      >
        <div className="asistente__icono" aria-hidden="true">
          {actual.icono}
        </div>
        <h2 id="asistente-titulo" className="asistente__titulo">
          {actual.titulo}
        </h2>
        <div className="asistente__contenido">{actual.contenido}</div>

        {/* Indicador de progreso (puntos). */}
        <div className="asistente__puntos" aria-hidden="true">
          {pasos.map((_, i) => (
            <span
              key={i}
              className={"asistente__punto" + (i === paso ? " asistente__punto--activo" : "")}
            />
          ))}
        </div>

        {/* Acciones */}
        <div className="asistente__acciones">
          <button type="button" className="asistente__omitir" onClick={cerrar}>
            {esUltimo ? "" : "Omitir"}
          </button>
          <div className="asistente__nav">
            {paso > 0 && (
              <Button variant="secondary" onClick={() => setPaso((p) => p - 1)}>
                Atrás
              </Button>
            )}
            {esUltimo ? (
              <Button onClick={cerrar}>Empezar</Button>
            ) : (
              <Button onClick={() => setPaso((p) => p + 1)}>Siguiente</Button>
            )}
          </div>
        </div>

        <p className="asistente__contador">
          Paso {paso + 1} de {total}
        </p>
      </div>
    </div>
  );
}
