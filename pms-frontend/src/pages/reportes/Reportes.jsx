import { useCallback, useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import Card from "../../components/Card";
import StatCard from "../../components/StatCard";
import Button from "../../components/Button";
import StateMessage from "../../components/StateMessage";
import Field from "../../components/Field";
import "./Reportes.css";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Color del nivel de ocupacion. Ademas del color, cada barra lleva su % como
// texto y title, para no depender solo del color (WCAG 1.4.1).
function tono(pct) {
  if (pct >= 80) return "alta";
  if (pct >= 50) return "media";
  if (pct > 0) return "baja";
  return "cero";
}

export default function Reportes() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  // El fetcher depende de anio/mes; useCallback lo recrea al cambiarlos
  // para que useApi recargue automaticamente.
  const fetcher = useCallback(() => api.ocupacion(anio, mes), [anio, mes]);
  const reporte = useApi(fetcher);

  const maxPct = useMemo(() => {
    if (!reporte.data) return 100;
    const m = Math.max(0, ...reporte.data.dias.map((d) => d.porcentaje));
    return m > 0 ? m : 100;
  }, [reporte.data]);

  const anios = [];
  for (let a = hoy.getFullYear() - 3; a <= hoy.getFullYear() + 1; a++) anios.push(a);

  return (
    <div className="reportes">
      <header className="reportes__head">
        <div>
          <h1>Reportes</h1>
          <p className="reportes__subtitle">
            Ocupación diaria de tu hospedaje.
          </p>
        </div>
      </header>

      {/* Selector de periodo */}
      <Card padding="sm" className="reportes__filtros">
        <Field id="mes" label="Mes">
          <select id="mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((nombre, i) => (
              <option key={i} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field id="anio" label="Año">
          <select id="anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {reporte.loading && (
        <Card>
          <StateMessage variant="loading" title="Calculando ocupación…" />
        </Card>
      )}

      {reporte.error && (
        <Card>
          <StateMessage
            variant="error"
            title="No se pudo cargar el reporte"
            message={reporte.error}
            action={
              <Button variant="secondary" onClick={reporte.recargar}>
                Reintentar
              </Button>
            }
          />
        </Card>
      )}

      {reporte.data && (
        <>
          {/* Resumen del mes */}
          <div className="reportes__kpis">
            <StatCard
              icon="📈"
              accent="success"
              label="Ocupación promedio"
              value={`${reporte.data.promedio_ocupacion}%`}
              hint={`${MESES[mes - 1]} ${anio}`}
            />
            <StatCard
              icon="🏨"
              accent="brand"
              label="Habitaciones activas"
              value={reporte.data.total_habitaciones}
            />
            <StatCard
              icon="📅"
              accent="warning"
              label="Días del mes"
              value={reporte.data.dias.length}
            />
          </div>

          {/* Grafico de barras */}
          <Card>
            <div className="reportes__grafico-head">
              <h2>Ocupación por día</h2>
              <ul className="reportes__leyenda" aria-hidden="true">
                <li>
                  <span className="punto punto--baja" /> Baja (&lt;50%)
                </li>
                <li>
                  <span className="punto punto--media" /> Media (50–79%)
                </li>
                <li>
                  <span className="punto punto--alta" /> Alta (≥80%)
                </li>
              </ul>
            </div>

            {reporte.data.total_habitaciones === 0 ? (
              <StateMessage
                variant="empty"
                title="No hay habitaciones activas"
                message="Crea habitaciones para poder medir la ocupación."
              />
            ) : (
              <div
                className="grafico"
                role="img"
                aria-label={`Ocupación diaria de ${MESES[mes - 1]} ${anio}. Promedio ${reporte.data.promedio_ocupacion} por ciento.`}
              >
                {reporte.data.dias.map((d) => (
                  <div
                    key={d.dia}
                    className="grafico__col"
                    title={`Día ${d.dia}: ${d.porcentaje}% (${d.ocupadas} de ${reporte.data.total_habitaciones})`}
                  >
                    <div className="grafico__barra-zona">
                      <div
                        className={`grafico__barra grafico__barra--${tono(d.porcentaje)}`}
                        style={{ height: `${(d.porcentaje / maxPct) * 100}%` }}
                      />
                    </div>
                    <span className="grafico__dia">{d.dia}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Tabla accesible: misma informacion en formato lectura/exportable.
              Garantiza que el dato sea legible aunque el grafico no se vea. */}
          <Card padding="none">
            <details className="reportes__tabla-wrap">
              <summary className="reportes__tabla-toggle">
                Ver datos en tabla
              </summary>
              <div className="reportes__tabla-scroll">
                <table className="reportes__tabla">
                  <caption className="sr-only">
                    Ocupación diaria de {MESES[mes - 1]} {anio}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Día</th>
                      <th scope="col">Ocupadas</th>
                      <th scope="col">% Ocupación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.data.dias.map((d) => (
                      <tr key={d.dia}>
                        <td>{d.dia}</td>
                        <td>
                          {d.ocupadas} / {reporte.data.total_habitaciones}
                        </td>
                        <td>{d.porcentaje}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
