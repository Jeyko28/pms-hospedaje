import "./Dona.css";

/**
 * Dona — gráfico de dona (donut) en SVG puro, sin librerías.
 *
 * Técnica: una circunferencia de radio tal que su perímetro = 100, así cada
 * segmento usa stroke-dasharray = porcentaje directamente. El desfase
 * (strokeDashoffset) acumulado encadena los segmentos empezando arriba.
 *
 * Accesibilidad: el SVG lleva role="img" + aria-label con el desglose, y la
 * leyenda muestra label + valor + % (no depende solo del color, WCAG 1.4.1).
 *
 * Props:
 *   segmentos:   [{ label, value, color }]
 *   centroValor: texto grande del centro (ej. total formateado)
 *   centroLabel: texto pequeño bajo el valor (ej. "cobrado")
 *   formato:     fn opcional para formatear el valor en la leyenda
 */
const RADIO = 15.915494; // perímetro = 2πr ≈ 100

export default function Dona({ segmentos, centroValor, centroLabel, formato }) {
  const suma = segmentos.reduce((a, s) => a + (s.value || 0), 0);
  let acumulado = 0;

  const resumenAria = segmentos
    .map((s) => `${s.label} ${suma > 0 ? Math.round((s.value / suma) * 100) : 0}%`)
    .join(", ");

  return (
    <div className="dona">
      <div className="dona__grafico">
        <svg viewBox="0 0 42 42" className="dona__svg" role="img" aria-label={resumenAria}>
          <circle
            className="dona__pista"
            cx="21"
            cy="21"
            r={RADIO}
            fill="transparent"
            strokeWidth="5"
          />
          {suma > 0 &&
            segmentos.map((s, i) => {
              const pct = (s.value / suma) * 100;
              const seg = (
                <circle
                  key={i}
                  cx="21"
                  cy="21"
                  r={RADIO}
                  fill="transparent"
                  stroke={s.color}
                  strokeWidth="5"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={25 - acumulado}
                />
              );
              acumulado += pct;
              return seg;
            })}
        </svg>
        <div className="dona__centro">
          <span className="dona__centro-valor">{centroValor}</span>
          {centroLabel && <span className="dona__centro-label">{centroLabel}</span>}
        </div>
      </div>

      <ul className="dona__leyenda">
        {segmentos.map((s, i) => {
          const pct = suma > 0 ? Math.round((s.value / suma) * 100) : 0;
          return (
            <li key={i} className="dona__leyenda-item">
              <span className="dona__leyenda-color" style={{ backgroundColor: s.color }} />
              <span className="dona__leyenda-label">{s.label}</span>
              <span className="dona__leyenda-valor">
                {formato ? formato(s.value) : s.value} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
