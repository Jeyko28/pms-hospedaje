import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import Button from "../../components/Button";
import Field from "../../components/Field";
import StateMessage from "../../components/StateMessage";
import { useToast } from "../../components/Toast";
import "./HabitacionFotos.css";

const MAX_FOTOS = 6;

/**
 * Comprime una imagen en el navegador antes de subirla: redimensiona al lado
 * máximo indicado y la exporta a JPEG. Así la BD no se infla y la subida es
 * rápida (el backend guarda el data URL base64).
 */
function comprimirImagen(file, maxLado = 1000, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width >= height && width > maxLado) {
        height = Math.round((height * maxLado) / width);
        width = maxLado;
      } else if (height > maxLado) {
        width = Math.round((width * maxLado) / height);
        height = maxLado;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

/**
 * Editor de "Fotos y detalles" de una habitación. Las fotos suben al instante
 * (comprimidas); la descripción/capacidad/amenidades se guardan con el botón.
 */
export default function HabitacionFotos({ habitacion, onCerrar }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [descripcion, setDescripcion] = useState(habitacion.descripcion || "");
  const [capacidad, setCapacidad] = useState(habitacion.capacidad || "");
  const [amenidades, setAmenidades] = useState(habitacion.amenidades || "");

  useEffect(() => {
    cargarFotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarFotos() {
    setCargando(true);
    try {
      setFotos(await api.fotosHabitacion(habitacion.id));
    } catch (e) {
      toast.error(e.message || "No se pudieron cargar las fotos.");
    } finally {
      setCargando(false);
    }
  }

  async function alElegir(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    const cupo = MAX_FOTOS - fotos.length;
    if (cupo <= 0) {
      toast.error(`Máximo ${MAX_FOTOS} fotos por habitación.`);
      return;
    }
    setSubiendo(true);
    let subidas = 0;
    for (const f of files.slice(0, cupo)) {
      if (!f.type.startsWith("image/")) {
        toast.error(`"${f.name}" no es una imagen.`);
        continue;
      }
      try {
        const dataUrl = await comprimirImagen(f);
        await api.agregarFotoHabitacion(habitacion.id, dataUrl);
        subidas += 1;
      } catch (err) {
        toast.error(err.message || "No se pudo subir la foto.");
      }
    }
    setSubiendo(false);
    if (files.length > cupo) toast.error(`Solo caben ${MAX_FOTOS} fotos; subí las primeras.`);
    if (subidas) toast.success(subidas === 1 ? "Foto agregada." : `${subidas} fotos agregadas.`);
    cargarFotos();
  }

  async function borrar(fotoId) {
    try {
      await api.eliminarFotoHabitacion(habitacion.id, fotoId);
      setFotos((prev) => prev.filter((f) => f.id !== fotoId));
    } catch (e) {
      toast.error(e.message || "No se pudo eliminar la foto.");
    }
  }

  async function guardarDetalles() {
    setGuardando(true);
    try {
      await api.guardarDetallesHabitacion(habitacion.id, {
        descripcion: descripcion.trim(),
        capacidad: Number(capacidad) || 0,
        amenidades: amenidades.trim(),
      });
      toast.success("Detalles guardados.");
      onCerrar?.(true);
    } catch (e) {
      toast.error(e.message || "No se pudieron guardar los detalles.");
    } finally {
      setGuardando(false);
    }
  }

  const lleno = fotos.length >= MAX_FOTOS;

  return (
    <div className="habfotos">
      <p className="habfotos__intro">
        Sube fotos y datos de la <strong>Hab. {habitacion.numero}</strong> para que el huésped
        vea qué reserva. La primera foto es la principal.
      </p>

      {/* Fotos */}
      <div className="habfotos__seccion">
        <div className="habfotos__seccion-head">
          <span className="habfotos__label">Fotos ({fotos.length}/{MAX_FOTOS})</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo || lleno}
          >
            {subiendo ? "Subiendo…" : "Agregar fotos"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={alElegir}
          />
        </div>

        {cargando ? (
          <StateMessage variant="loading" title="Cargando fotos…" />
        ) : fotos.length === 0 ? (
          <button
            type="button"
            className="habfotos__drop"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
          >
            <span className="habfotos__drop-ico" aria-hidden="true">＋</span>
            <span>Agrega la primera foto</span>
            <small>Se comprime automáticamente antes de subir</small>
          </button>
        ) : (
          <div className="habfotos__grid">
            {fotos.map((f, i) => (
              <div key={f.id} className="habfotos__item">
                <img src={f.imagen} alt={`Foto ${i + 1} de la habitación`} loading="lazy" />
                {i === 0 && <span className="habfotos__principal">Principal</span>}
                <button
                  type="button"
                  className="habfotos__quitar"
                  onClick={() => borrar(f.id)}
                  aria-label="Eliminar foto"
                  title="Eliminar"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detalles */}
      <div className="habfotos__seccion">
        <span className="habfotos__label">Detalles</span>
        <Field id="hf-desc" label="Descripción">
          <textarea
            id="hf-desc"
            rows={3}
            maxLength={2000}
            placeholder="Ej.: Habitación matrimonial con vista al mar, cómoda y luminosa."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Field>
        <div className="habfotos__fila">
          <Field id="hf-cap" label="Capacidad (huéspedes)">
            <input
              id="hf-cap"
              type="number"
              min="0"
              max="99"
              placeholder="2"
              value={capacidad}
              onChange={(e) => setCapacidad(e.target.value)}
            />
          </Field>
          <Field id="hf-amen" label="Amenidades (separadas por coma)">
            <input
              id="hf-amen"
              type="text"
              maxLength={600}
              placeholder="WiFi, TV, Baño privado, Agua caliente"
              value={amenidades}
              onChange={(e) => setAmenidades(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="habfotos__acciones">
        <Button variant="ghost" onClick={() => onCerrar?.(false)}>
          Cerrar
        </Button>
        <Button onClick={guardarDetalles} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar detalles"}
        </Button>
      </div>
    </div>
  );
}
