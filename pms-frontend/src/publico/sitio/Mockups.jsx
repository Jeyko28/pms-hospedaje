/**
 * Mockups — visuales de producto en SVG (livianos, nítidos, sin imágenes
 * raster). Usan los tokens --s-* vía currentColor y variables CSS, así se
 * adaptan a claro/oscuro. Son ilustrativos del PMS (calendario, dashboard,
 * reserva, link público), no capturas reales.
 */

/* Marco tipo "navegador" reutilizable. */
export function Frame({ url = "stanza.pe/app", children }) {
  return (
    <div className="s-frame">
      <div className="s-frame__bar" aria-hidden="true">
        <span className="s-frame__dot" />
        <span className="s-frame__dot" />
        <span className="s-frame__dot" />
        <span className="s-frame__url">{url}</span>
      </div>
      <div className="s-frame__body">{children}</div>
    </div>
  );
}

/**
 * CalendarMockup — timeline habitación × día con barras de reserva. Es el
 * "héroe visual": comunica de un vistazo que Stanza es un PMS de verdad.
 */
export function CalendarMockup() {
  const habitaciones = ["101", "102", "103", "201", "202"];
  const dias = 14;
  const W = 920;
  const H = 340;
  const padL = 148;
  const padT = 56;
  const colW = (W - padL - 24) / dias;
  const rowH = (H - padT - 20) / habitaciones.length;

  // Reservas: [fila, díaInicio, duración, tipo] — tipo define el color.
  const reservas = [
    [0, 0, 3, "in"],
    [0, 5, 4, "conf"],
    [1, 1, 5, "conf"],
    [1, 8, 3, "pend"],
    [2, 0, 2, "out"],
    [2, 3, 6, "in"],
    [3, 4, 4, "conf"],
    [3, 9, 4, "pend"],
    [4, 2, 5, "in"],
    [4, 8, 5, "conf"],
  ];
  const color = {
    in: "var(--s-success)",
    conf: "var(--s-accent)",
    pend: "#d97706",
    out: "var(--s-text-muted)",
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="s-frame__body"
      role="img"
      aria-label="Calendario de reservas por habitación y día"
      style={{ background: "var(--s-surface)" }}
    >
      {/* Cabecera de días */}
      {Array.from({ length: dias }).map((_, i) => (
        <text
          key={`d${i}`}
          x={padL + i * colW + colW / 2}
          y={padT - 22}
          textAnchor="middle"
          fontSize="12"
          fill="var(--s-text-muted)"
          fontFamily="Inter, sans-serif"
        >
          {i + 1}
        </text>
      ))}
      {/* Líneas verticales */}
      {Array.from({ length: dias + 1 }).map((_, i) => (
        <line
          key={`v${i}`}
          x1={padL + i * colW}
          y1={padT - 8}
          x2={padL + i * colW}
          y2={H - 16}
          stroke="var(--s-border)"
          strokeWidth="1"
        />
      ))}
      {/* Filas + etiquetas */}
      {habitaciones.map((hab, r) => (
        <g key={hab}>
          <line
            x1={16}
            y1={padT + r * rowH}
            x2={W - 24}
            y2={padT + r * rowH}
            stroke="var(--s-border)"
            strokeWidth="1"
          />
          <text
            x={20}
            y={padT + r * rowH + rowH / 2 + 4}
            fontSize="13"
            fontWeight="600"
            fill="var(--s-text-2)"
            fontFamily="Inter, sans-serif"
          >
            Hab. {hab}
          </text>
        </g>
      ))}
      {/* Barras de reserva */}
      {reservas.map(([row, start, len, tipo], i) => (
        <rect
          key={`r${i}`}
          x={padL + start * colW + 3}
          y={padT + row * rowH + 8}
          width={len * colW - 6}
          height={rowH - 16}
          rx="7"
          fill={color[tipo]}
          opacity={tipo === "out" ? 0.5 : 0.92}
        />
      ))}
    </svg>
  );
}

/**
 * DashboardMockup — mini panel con KPIs y un gráfico de barras. Para acompañar
 * secciones de "reportes / control".
 */
export function DashboardMockup() {
  const barras = [40, 62, 48, 80, 70, 95, 88];
  const maxH = 90;
  return (
    <svg
      viewBox="0 0 460 300"
      className="s-frame__body"
      role="img"
      aria-label="Panel con indicadores del hospedaje"
      style={{ background: "var(--s-surface)" }}
    >
      {/* KPIs */}
      {[
        { x: 20, label: "Ocupación", val: "78%" },
        { x: 170, label: "Ingresos", val: "S/ 4.2k" },
        { x: 320, label: "Reservas", val: "31" },
      ].map((k) => (
        <g key={k.label}>
          <rect
            x={k.x}
            y="22"
            width="120"
            height="74"
            rx="12"
            fill="var(--s-bg-2)"
            stroke="var(--s-border)"
          />
          <text x={k.x + 14} y="48" fontSize="11" fill="var(--s-text-muted)" fontFamily="Inter, sans-serif">
            {k.label}
          </text>
          <text x={k.x + 14} y="76" fontSize="22" fontWeight="800" fill="var(--s-text)" fontFamily="Inter, sans-serif">
            {k.val}
          </text>
        </g>
      ))}
      {/* Gráfico */}
      <rect x="20" y="116" width="420" height="164" rx="12" fill="var(--s-bg-2)" stroke="var(--s-border)" />
      {barras.map((b, i) => {
        const bw = 40;
        const gap = 16;
        const x = 44 + i * (bw + gap);
        const h = (b / 100) * maxH;
        return (
          <rect
            key={i}
            x={x}
            y={256 - h}
            width={bw}
            height={h}
            rx="6"
            fill={i === barras.length - 1 ? "var(--s-accent)" : "var(--s-accent-border)"}
          />
        );
      })}
    </svg>
  );
}

/**
 * ReservaMockup — tarjeta de una reserva entrante por el link público.
 */
export function ReservaMockup() {
  return (
    <svg
      viewBox="0 0 420 240"
      className="s-frame__body"
      role="img"
      aria-label="Reserva recibida por el link público"
      style={{ background: "var(--s-surface)" }}
    >
      <rect x="20" y="20" width="380" height="200" rx="14" fill="var(--s-bg-2)" stroke="var(--s-border)" />
      <circle cx="56" cy="60" r="20" fill="var(--s-accent-soft)" stroke="var(--s-accent-border)" />
      <text x="56" y="66" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--s-accent)" fontFamily="Inter, sans-serif">
        AT
      </text>
      <text x="88" y="55" fontSize="15" fontWeight="700" fill="var(--s-text)" fontFamily="Inter, sans-serif">
        Ana Torres
      </text>
      <text x="88" y="74" fontSize="12" fill="var(--s-text-muted)" fontFamily="Inter, sans-serif">
        Reserva directa · sin comisión
      </text>
      <rect x="300" y="44" width="82" height="26" rx="13" fill="var(--s-success-soft)" stroke="var(--s-success-border)" />
      <text x="341" y="61" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--s-success)" fontFamily="Inter, sans-serif">
        Confirmada
      </text>
      {/* Detalles */}
      {[
        ["Habitación", "102 · Doble"],
        ["Fechas", "12 – 15 jul"],
        ["Total", "S/ 285"],
      ].map((row, i) => (
        <g key={row[0]}>
          <text x="44" y={116 + i * 30} fontSize="12" fill="var(--s-text-muted)" fontFamily="Inter, sans-serif">
            {row[0]}
          </text>
          <text x="376" y={116 + i * 30} textAnchor="end" fontSize="13" fontWeight="600" fill="var(--s-text)" fontFamily="Inter, sans-serif">
            {row[1]}
          </text>
        </g>
      ))}
    </svg>
  );
}
