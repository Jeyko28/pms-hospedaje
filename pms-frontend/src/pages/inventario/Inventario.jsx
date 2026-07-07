import { nfMoneda } from "../../utils/moneda";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import { useToast } from "../../components/Toast";
import { normalizar } from "../../utils/normalizar";
import ItemInventarioForm from "./ItemInventarioForm";
import MovimientoForm from "./MovimientoForm";
import "../entidades.css";
import "./Inventario.css";

const moneda = nfMoneda({ style: "currency", currency: "PEN" });
const num = (n) => Number(n ?? 0).toLocaleString("es-PE", { maximumFractionDigits: 2 });
const CATS = ["Cocina", "Minimarket", "Limpieza", "Operación"];

export default function Inventario() {
  const [categoria, setCategoria] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const items = useApi(() => api.inventario(categoria, verInactivos), [categoria, verInactivos]);
  const resumen = useApi(api.inventarioResumen);
  const toast = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(null); // {modo, item}
  const [movItem, setMovItem] = useState(null);
  const [accId, setAccId] = useState(null);

  const filtrados = useMemo(() => {
    if (!items.data) return [];
    const t = normalizar(busqueda.trim());
    if (!t) return items.data;
    return items.data.filter(
      (i) => normalizar(i.nombre).includes(t) || normalizar(i.proveedor || "").includes(t)
    );
  }, [items.data, busqueda]);

  function recargarTodo() {
    items.recargar();
    resumen.recargar();
  }
  function alGuardar() {
    const creado = modal?.modo === "crear";
    setModal(null);
    recargarTodo();
    toast.success(creado ? "Producto creado." : "Producto actualizado.");
  }
  function alMovimiento() {
    setMovItem(null);
    recargarTodo();
    toast.success("Movimiento registrado.");
  }
  async function archivar(i) {
    if (!window.confirm(`¿Archivar ${i.nombre}? Conserva su historial de movimientos.`)) return;
    setAccId(i.id);
    try {
      await api.archivarItemInventario(i.id);
      toast.success("Producto archivado.");
      recargarTodo();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAccId(null);
    }
  }

  return (
    <div className="entidad">
      <header className="entidad__head inv-head">
        <div className="inv-cats" role="group" aria-label="Categoría">
          <button className={categoria === "" ? "is-active" : ""} onClick={() => setCategoria("")}>Todas</button>
          {CATS.map((c) => (
            <button key={c} className={categoria === c ? "is-active" : ""} onClick={() => setCategoria(c)}>{c}</button>
          ))}
        </div>
        <Button icon="+" onClick={() => setModal({ modo: "crear", item: null })}>Nuevo producto</Button>
      </header>

      {resumen.data && (
        <div className="inv-resumen">
          <Card padding="sm" className="inv-kpi">
            <span className="inv-kpi__label">Productos</span>
            <span className="inv-kpi__valor">{resumen.data.items}</span>
          </Card>
          <Card padding="sm" className="inv-kpi">
            <span className="inv-kpi__label">En alerta</span>
            <span className={`inv-kpi__valor ${resumen.data.en_alerta ? "inv-kpi__valor--warn" : ""}`}>
              {resumen.data.en_alerta}
            </span>
          </Card>
          <Card padding="sm" className="inv-kpi">
            <span className="inv-kpi__label">Valor del stock</span>
            <span className="inv-kpi__valor">{moneda.format(resumen.data.valor_total)}</span>
          </Card>
        </div>
      )}

      <Card padding="sm">
        <div className="inv-toolbar">
          <Field id="buscar" label="Buscar">
            <input
              id="buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Producto o proveedor…"
            />
          </Field>
          <label className="inv-check">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Mostrar archivados
          </label>
        </div>
      </Card>

      {items.loading && <Card><StateMessage variant="loading" title="Cargando inventario…" /></Card>}
      {items.error && (
        <Card>
          <StateMessage variant="error" title="No se pudo cargar el inventario" message={items.error}
            action={<Button variant="secondary" onClick={items.recargar}>Reintentar</Button>} />
        </Card>
      )}
      {items.data && filtrados.length === 0 && (
        <Card>
          <StateMessage
            variant="empty"
            title={items.data.length === 0 ? "Aún no hay productos" : "Sin resultados"}
            message={items.data.length === 0 ? "Crea tu primer producto para llevar el control de existencias." : "Prueba con otro término o categoría."}
            action={items.data.length === 0 ? <Button icon="+" onClick={() => setModal({ modo: "crear", item: null })}>Nuevo producto</Button> : null}
          />
        </Card>
      )}

      {filtrados.length > 0 && (
        <Card padding="none" className="inv-lista-card">
          <div className="inv-lista-scroll">
            <table className="inv-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="inv-num">Stock</th>
                  <th className="inv-num">Mínimo</th>
                  <th className="inv-num">Costo</th>
                  <th className="inv-num">Valor</th>
                  <th>Proveedor</th>
                  <th className="inv-acc">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((i) => (
                  <tr key={i.id} className={i.activo ? "" : "is-archived"}>
                    <td className="inv-nombre">
                      {i.nombre}
                      {i.presentacion && i.presentacion_factor > 0 && (
                        <span className="inv-nombre-pres">
                          1 {i.presentacion} = {num(i.presentacion_factor)} {i.unidad}
                        </span>
                      )}
                    </td>
                    <td>{i.categoria}</td>
                    <td className="inv-num">
                      <span className={`inv-stock ${i.en_alerta ? "inv-stock--alerta" : ""}`}>
                        {i.en_alerta && <AlertTriangle size={13} aria-hidden="true" />}
                        {num(i.stock)} {i.unidad}
                      </span>
                    </td>
                    <td className="inv-num">{i.stock_minimo ? num(i.stock_minimo) : "—"}</td>
                    <td className="inv-num">{moneda.format(i.costo_unitario || 0)}</td>
                    <td className="inv-num">{moneda.format(i.valor || 0)}</td>
                    <td className="inv-prov">{i.proveedor || "—"}</td>
                    <td className="inv-acc">
                      <button className="inv-link inv-link--fuerte" onClick={() => setMovItem(i)}>Movimiento</button>
                      <button className="inv-link" onClick={() => setModal({ modo: "editar", item: i })}>Editar</button>
                      <button className="inv-link" onClick={() => archivar(i)} disabled={accId === i.id}>Archivar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!modal} title={modal?.modo === "editar" ? "Editar producto" : "Nuevo producto"} onClose={() => setModal(null)}>
        {modal && <ItemInventarioForm item={modal.item} onGuardado={alGuardar} onCancelar={() => setModal(null)} />}
      </Modal>
      <Modal open={!!movItem} title="Registrar movimiento" onClose={() => setMovItem(null)}>
        {movItem && <MovimientoForm item={movItem} onHecho={alMovimiento} onCancelar={() => setMovItem(null)} />}
      </Modal>
    </div>
  );
}
