import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import { useToast } from "../../components/Toast";
import { normalizar } from "../../utils/normalizar";
import "../entidades.css";
import "./Servicios.css";

const CATEGORIAS = [
  { value: "bebida", label: "Bebidas" },
  { value: "snack", label: "Snacks" },
  { value: "limpieza", label: "Limpieza" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "servicio", label: "Servicios" },
  { value: "general", label: "General" },
];

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function estadoServicio(activo) {
  return activo
    ? { tone: "success", label: "Activo" }
    : { tone: "neutral", label: "Inactivo" };
}

export default function Servicios() {
  const servicios = useApi(api.serviciosHabitacion);
  const toast = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [modal, setModal] = useState(null); // null | {modo, servicio}
  const [form, setForm] = useState({ nombre: "", categoria: "general", subcategoria: "", precio: "" });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  const filtrados = useMemo(() => {
    if (!servicios.data) return [];
    const texto = normalizar(busqueda.trim());
    return servicios.data.filter((s) => {
      const coincideTexto =
        !texto ||
        normalizar(s.nombre).includes(texto) ||
        normalizar(s.subcategoria || "").includes(texto);
      const coincideCat = filtroCategoria === "todos" || s.categoria === filtroCategoria;
      return coincideTexto && coincideCat;
    });
  }, [servicios.data, busqueda, filtroCategoria]);

  const resumen = useMemo(() => {
    const d = servicios.data || [];
    return {
      total: d.length,
      activos: d.filter((s) => s.activo).length,
      inactivos: d.filter((s) => !s.activo).length,
    };
  }, [servicios.data]);

  function abrirCrear() {
    setForm({ nombre: "", categoria: "general", subcategoria: "", precio: "" });
    setErrores({});
    setModal({ modo: "crear", servicio: null });
  }

  function abrirEditar(s) {
    setForm({
      nombre: s.nombre,
      categoria: s.categoria || "general",
      subcategoria: s.subcategoria || "",
      precio: String(s.precio || ""),
    });
    setErrores({});
    setModal({ modo: "editar", servicio: s });
  }

  function validar() {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio.";
    if (!form.precio || parseFloat(form.precio) < 0) e.precio = "Ingresa un precio válido.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function guardar(e) {
    e.preventDefault();
    if (!validar()) return;
    setGuardando(true);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        subcategoria: form.subcategoria.trim(),
        precio: parseFloat(form.precio) || 0,
      };
      if (modal.modo === "crear") {
        await api.crearServicioHabitacion(datos);
        toast.success("Servicio creado.");
      } else {
        await api.editarServicioHabitacion(modal.servicio.id, {
          ...datos,
          activo: modal.servicio.activo,
        });
        toast.success("Servicio actualizado.");
      }
      setModal(null);
      servicios.recargar();
    } catch (err) {
      toast.error(err.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(s) {
    try {
      await api.editarServicioHabitacion(s.id, {
        nombre: s.nombre,
        categoria: s.categoria,
        subcategoria: s.subcategoria || "",
        precio: s.precio,
        activo: !s.activo,
      });
      toast.success(s.activo ? "Servicio desactivado." : "Servicio activado.");
      servicios.recargar();
    } catch (err) {
      toast.error(err.message || "No se pudo cambiar el estado.");
    }
  }

  async function eliminar(s) {
    if (!window.confirm(`¿Eliminar "${s.nombre}"?`)) return;
    try {
      await api.eliminarServicioHabitacion(s.id);
      toast.success("Servicio eliminado.");
      servicios.recargar();
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar.");
    }
  }

  return (
    <div className="entidad">
      <header className="entidad__head">
        <Button icon="+" onClick={abrirCrear}>
          Nuevo servicio
        </Button>
      </header>

      {/* Resumen */}
      {servicios.data && servicios.data.length > 0 && (
        <div className="facturas__resumen">
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Total</span>
            <span className="facturas__resumen-valor">{resumen.total}</span>
          </Card>
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Activos</span>
            <span className="facturas__resumen-valor facturas__resumen-valor--ok">
              {resumen.activos}
            </span>
          </Card>
          <Card padding="sm" className="facturas__resumen-item">
            <span className="facturas__resumen-label">Inactivos</span>
            <span className="facturas__resumen-valor facturas__resumen-valor--warn">
              {resumen.inactivos}
            </span>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card padding="sm" className="servicios__filtros">
        <div className="servicios__buscar">
          <Field id="buscar" label="Buscar">
            <input
              id="buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o subcategoría…"
            />
          </Field>
        </div>
        <div className="servicios__filtro-cat">
          <Field id="categoria" label="Categoría">
            <select
              id="categoria"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="todos">Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {/* Estados */}
      {servicios.loading && (
        <Card><StateMessage variant="loading" title="Cargando servicios…" /></Card>
      )}

      {servicios.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudieron cargar los servicios"
            message={servicios.error}
            action={<Button variant="secondary" onClick={servicios.recargar}>Reintentar</Button>}
          />
        </Card>
      )}

      {servicios.data && filtrados.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title={servicios.data.length === 0 ? "Aún no hay servicios" : "Sin resultados"}
            message={
              servicios.data.length === 0
                ? "Crea el primer servicio o producto del catálogo."
                : "Prueba con otra búsqueda o cambia el filtro."
            }
          />
        </Card>
      )}

      {/* Lista */}
      {filtrados.length > 0 && (
        <div className="entidad__lista">
          {filtrados.map((s) => {
            const est = estadoServicio(s.activo);
            const cat = CATEGORIAS.find((c) => c.value === s.categoria);
            return (
              <Card key={s.id} padding="sm" className="servicio-item">
                <div className="servicio-item__main">
                  <div className="servicio-item__info">
                    <span className="servicio-item__nombre">{s.nombre}</span>
                    <div className="servicio-item__meta">
                      <Badge tone={est.tone}>{est.label}</Badge>
                      <span className="servicio-item__cat">{cat?.label || s.categoria}</span>
                      {s.subcategoria && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="servicio-item__sub">{s.subcategoria}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="servicio-item__precio">
                    {formatoMoneda.format(s.precio)}
                  </span>
                </div>
                <div className="servicio-item__acciones">
                  <Button variant="ghost" size="sm" onClick={() => abrirEditar(s)}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActivo(s)}
                  >
                    {s.activo ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => eliminar(s)}
                  >
                    Eliminar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: crear / editar */}
      <Modal
        open={!!modal}
        title={modal?.modo === "crear" ? "Nuevo servicio" : "Editar servicio"}
        onClose={() => setModal(null)}
      >
        <form className="servicios__form" onSubmit={guardar}>
          <Field id="s-nombre" label="Nombre" required error={errores.nombre}>
            <input
              id="s-nombre"
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Gaseosa 1.5L, Limpieza profunda…"
            />
          </Field>

          <div className="servicios__form-row">
            <Field id="s-categoria" label="Categoría" required>
              <select
                id="s-categoria"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>

            <Field id="s-subcategoria" label="Subcategoría" hint="Opcional">
              <input
                id="s-subcategoria"
                type="text"
                value={form.subcategoria}
                onChange={(e) => setForm({ ...form, subcategoria: e.target.value })}
                placeholder="Ej: Agua, Cerveza, Doritos…"
              />
            </Field>
          </div>

          <Field id="s-precio" label="Precio (S/)" required error={errores.precio}>
            <input
              id="s-precio"
              type="number"
              min="0"
              step="0.10"
              value={form.precio}
              onChange={(e) => setForm({ ...form, precio: e.target.value })}
              placeholder="0.00"
            />
          </Field>

          <div className="servicios__form-acciones">
            <Button variant="secondary" type="button" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardando}>
              {modal?.modo === "crear" ? "Crear" : "Guardar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
