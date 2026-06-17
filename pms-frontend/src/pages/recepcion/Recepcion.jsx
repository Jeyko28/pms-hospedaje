import { useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import StateMessage from "../../components/StateMessage";
import PagoForm from "./PagoForm";
import CheckinForm from "./CheckinForm";
import CheckoutForm from "./CheckoutForm";
import { abrirFacturaPdf } from "../../utils/pdf";
import "./Recepcion.css";

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

const formatoFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function Recepcion() {
  const pendientes = useApi(api.reservasPendientes);
  const estancias = useApi(api.estanciasActivas);

  const [pagoEstancia, setPagoEstancia] = useState(null); // estancia para modal de pago
  const [checkinReserva, setCheckinReserva] = useState(null); // reserva para modal de check-in
  const [checkoutEstancia, setCheckoutEstancia] = useState(null); // estancia para modal de check-out

  function refrescarTodo() {
    pendientes.recargar();
    estancias.recargar();
  }

  function alCheckin() {
    setCheckinReserva(null);
    refrescarTodo();
  }

  function alCheckout() {
    setCheckoutEstancia(null);
    refrescarTodo();
  }

  function alPagar() {
    setPagoEstancia(null);
    estancias.recargar();
  }

  return (
    <div className="recepcion">
      <header className="recepcion__head">
        <h1>Recepción</h1>
        <p className="recepcion__subtitle">
          Gestiona las entradas y salidas de huéspedes.
        </p>
      </header>

      <div className="recepcion__cols">
        {/* ============ Columna 1: Check-in (reservas pendientes) ============ */}
        <section className="recepcion__col" aria-labelledby="col-in">
          <div className="recepcion__col-head">
            <h2 id="col-in">Llegadas de hoy</h2>
            <Badge tone="info" icon="→">
              {pendientes.data ? pendientes.data.length : 0} por entrar
            </Badge>
          </div>

          {pendientes.loading && (
            <Card>
              <StateMessage variant="loading" title="Cargando…" />
            </Card>
          )}
          {pendientes.error && (
            <Card>
              <StateMessage
                variant="error"
                title="No se pudo cargar"
                message={pendientes.error}
                action={
                  <Button variant="secondary" onClick={pendientes.recargar}>
                    Reintentar
                  </Button>
                }
              />
            </Card>
          )}
          {pendientes.data && pendientes.data.length === 0 && (
            <Card>
              <StateMessage
                variant="empty"
                title="Sin llegadas pendientes"
                message="Todas las reservas confirmadas ya tienen check-in."
              />
            </Card>
          )}
          {pendientes.data &&
            pendientes.data.map((r) => (
              <Card key={r.id} padding="sm" className="recep-item">
                <div className="recep-item__main">
                  <span className="recep-item__nombre">{r.huesped}</span>
                  <div className="recep-item__meta">
                    <span>Hab. {r.habitacion}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {formatoFecha(r.fecha_entrada)} → {formatoFecha(r.fecha_salida)}
                    </span>
                  </div>
                  <span className="recep-item__total">
                    {formatoMoneda.format(r.total || 0)}
                  </span>
                </div>
                <Button
                  size="sm"
                  icon="→"
                  onClick={() => setCheckinReserva(r)}
                >
                  Check-in
                </Button>
              </Card>
            ))}
        </section>

        {/* ============ Columna 2: Check-out (estancias activas) ============ */}
        <section className="recepcion__col" aria-labelledby="col-out">
          <div className="recepcion__col-head">
            <h2 id="col-out">Huéspedes alojados</h2>
            <Badge tone="success" icon="●">
              {estancias.data ? estancias.data.length : 0} activos
            </Badge>
          </div>

          {estancias.loading && (
            <Card>
              <StateMessage variant="loading" title="Cargando…" />
            </Card>
          )}
          {estancias.error && (
            <Card>
              <StateMessage
                variant="error"
                title="No se pudo cargar"
                message={estancias.error}
                action={
                  <Button variant="secondary" onClick={estancias.recargar}>
                    Reintentar
                  </Button>
                }
              />
            </Card>
          )}
          {estancias.data && estancias.data.length === 0 && (
            <Card>
              <StateMessage
                variant="empty"
                title="No hay huéspedes alojados"
                message="Cuando hagas un check-in, la estancia aparecerá aquí."
              />
            </Card>
          )}
          {estancias.data &&
            estancias.data.map((e) => {
              const pagado = e.saldo <= 0;
              return (
                <Card key={e.id} padding="sm" className="recep-item">
                  <div className="recep-item__main">
                    <span className="recep-item__nombre">{e.huesped}</span>
                    <div className="recep-item__meta">
                      <span>Hab. {e.habitacion}</span>
                      <span aria-hidden="true">·</span>
                      <span>Entró {formatoFecha(e.fecha_checkin)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Sale {formatoFecha(e.fecha_checkout_esperado)}</span>
                    </div>
                    {e.reserva_entrada && e.reserva_entrada !== e.fecha_checkin && (
                      <p className="recep-item__nota">
                        Reservó desde {formatoFecha(e.reserva_entrada)} · se cobra por la estadía real
                      </p>
                    )}
                    <div className="recep-item__pago">
                      {pagado ? (
                        <Badge tone="success" icon="✓">
                          Pagado · {formatoMoneda.format(e.total)}
                        </Badge>
                      ) : (
                        <Badge tone="warning" icon="!">
                          Saldo {formatoMoneda.format(e.saldo)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="recep-item__acciones">
                    {e.factura_id && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="📄"
                        onClick={() => abrirFacturaPdf(e.factura_id)}
                      >
                        Factura
                      </Button>
                    )}
                    {!pagado && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="💳"
                        onClick={() => setPagoEstancia(e)}
                      >
                        Cobrar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={pagado ? "primary" : "ghost"}
                      icon="←"
                      onClick={() => setCheckoutEstancia(e)}
                    >
                      Check-out
                    </Button>
                  </div>
                </Card>
              );
            })}
        </section>
      </div>

      {/* Modal de check-in (elige fecha real + previsualiza el cobro) */}
      <Modal
        open={!!checkinReserva}
        title={`Check-in de ${checkinReserva?.huesped ?? ""}`}
        onClose={() => setCheckinReserva(null)}
      >
        {checkinReserva && (
          <CheckinForm
            reserva={checkinReserva}
            onCheckinHecho={alCheckin}
            onCancelar={() => setCheckinReserva(null)}
          />
        )}
      </Modal>

      {/* Modal de check-out (elige fecha real de salida + recalcula el cobro) */}
      <Modal
        open={!!checkoutEstancia}
        title={`Check-out de ${checkoutEstancia?.huesped ?? ""}`}
        onClose={() => setCheckoutEstancia(null)}
      >
        {checkoutEstancia && (
          <CheckoutForm
            estanciaId={checkoutEstancia.id}
            fechaCheckin={checkoutEstancia.fecha_checkin}
            fechaSalidaEsperada={checkoutEstancia.fecha_checkout_esperado}
            totalFacturado={checkoutEstancia.total}
            saldo={checkoutEstancia.saldo}
            onCheckoutHecho={alCheckout}
            onAjuste={estancias.recargar}
            onCancelar={() => setCheckoutEstancia(null)}
          />
        )}
      </Modal>

      {/* Modal de pago */}
      <Modal
        open={!!pagoEstancia}
        title={`Cobrar a ${pagoEstancia?.huesped ?? ""}`}
        onClose={() => setPagoEstancia(null)}
      >
        {pagoEstancia && (
          <PagoForm
            estancia={pagoEstancia}
            onPagado={alPagar}
            onCerrar={() => setPagoEstancia(null)}
          />
        )}
      </Modal>
    </div>
  );
}
