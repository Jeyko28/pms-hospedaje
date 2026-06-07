import Card from "./Card";
import "./StatCard.css";

/**
 * StatCard — tarjeta de KPI para el dashboard.
 *
 * Estructura: una fila superior con icono + etiqueta, y debajo la cifra
 * ocupando TODO el ancho de la tarjeta. Asi el numero (que es lo importante)
 * nunca compite por espacio con el icono y aprovecha el ancho completo,
 * evitando que se parta a mitad de los digitos.
 *
 * Props:
 *   label:  texto descriptivo (que mide)
 *   value:  la cifra a destacar
 *   icon:   emoji/icono
 *   accent: "brand" | "success" | "warning" | "danger" (color del icono)
 *   hint:   texto pequeno de apoyo (opcional)
 */
export default function StatCard({ label, value, icon, accent = "brand", hint }) {
  return (
    <Card padding="md" className="statcard">
      <div className="statcard__top">
        <span
          className={`statcard__icon statcard__icon--${accent}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <p className="statcard__label">{label}</p>
      </div>

      <p className="statcard__value">{value}</p>
      {hint && <p className="statcard__hint">{hint}</p>}
    </Card>
  );
}
