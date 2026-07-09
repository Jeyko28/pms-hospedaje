import { waLink } from "./datos";

/**
 * Legal — páginas legales del sitio (Términos, Privacidad, Cookies), servidas
 * como rutas públicas independientes (#/terminos, #/privacidad, #/cookies) y
 * enlazadas desde el footer.
 *
 * NOTA: este contenido es un estándar razonable para un SaaS peruano (Ley N° 29733
 * de Protección de Datos Personales). ANTES DE PRODUCCIÓN conviene una revisión
 * legal profesional y ajustar la identidad del titular (razón social/RUC/domicilio).
 * Es honesto con lo que el producto realmente hace (p. ej. no hay cookies de
 * rastreo: solo almacenamiento esencial en el navegador).
 */

const ACTUALIZADO = "6 de julio de 2026";

const DOCS = {
  terminos: {
    titulo: "Términos y Condiciones",
    intro:
      "Estas condiciones regulan el uso de Vantry, el software de gestión para hospedajes. Al crear una cuenta o usar el servicio, las aceptas.",
    secciones: [
      {
        h: "1. El servicio",
        p: "Vantry es un software como servicio (SaaS) en la nube para la gestión de hospedajes: reservas, calendario, recepción, cobros, comprobantes y reportes. El servicio se ofrece de forma continua y con mejoras periódicas.",
      },
      {
        h: "2. Cuenta y registro",
        p: "Para usar Vantry debes crear una cuenta con datos veraces. Eres responsable de mantener la confidencialidad de tus credenciales y de la actividad realizada con tu cuenta y las de tu equipo (recepción).",
      },
      {
        h: "3. Prueba, planes y pagos",
        items: [
          "Ofrecemos 14 días de prueba gratuita, sin tarjeta.",
          "Los planes son mensuales o anuales, con los precios vigentes publicados en la página de Precios.",
          "El pago se realiza por Yape o transferencia; la cuenta se activa o renueva al registrarse el pago.",
          "No hay contrato de permanencia: puedes cancelar cuando quieras y tu cuenta permanecerá activa hasta el fin del periodo pagado.",
          "Salvo que la ley disponga lo contrario, no se reembolsan periodos ya iniciados.",
        ],
      },
      {
        h: "4. Uso aceptable",
        p: "No puedes usar Vantry para fines ilícitos, vulnerar su seguridad, ni cargar datos de terceros sin contar con derecho o autorización para ello. Podemos suspender cuentas que incumplan estas condiciones.",
      },
      {
        h: "5. Tus datos y los de tus huéspedes",
        p: "La información que cargas (huéspedes, reservas, cobros) es tuya. Nos autorizas a procesarla únicamente para prestarte el servicio. Puedes exportar tu información mientras tu cuenta esté activa. El tratamiento de datos personales se rige por nuestra Política de Privacidad.",
      },
      {
        h: "6. Comprobantes y SUNAT",
        p: "La emisión de comprobantes con validez tributaria ante SUNAT depende de que cuentes con tu RUC y un proveedor autorizado. Mientras esa integración no esté activa, los comprobantes generados son representaciones impresas sin valor tributario, indicadas como tales.",
      },
      {
        h: "7. Disponibilidad",
        p: "Nos esforzamos por mantener el servicio disponible, pero puede haber interrupciones por mantenimiento o causas ajenas. No garantizamos disponibilidad ininterrumpida y recomendamos mantener respaldos de tu información crítica.",
      },
      {
        h: "8. Propiedad intelectual",
        p: "El software, la marca Vantry y sus contenidos son de su titular. Estas condiciones no te transfieren derechos de propiedad intelectual, solo el derecho a usar el servicio según tu plan.",
      },
      {
        h: "9. Limitación de responsabilidad",
        p: "En la medida permitida por la ley, Vantry no será responsable por lucro cesante ni por daños indirectos derivados del uso o la imposibilidad de uso del servicio. Nuestra responsabilidad se limita, como máximo, a lo pagado por el servicio en los últimos meses.",
      },
      {
        h: "10. Modificaciones",
        p: "Podemos actualizar estas condiciones. Los cambios relevantes se comunicarán por los medios de contacto o dentro del sistema. El uso continuado tras un cambio implica su aceptación.",
      },
      {
        h: "11. Ley aplicable",
        p: "Estas condiciones se rigen por las leyes de la República del Perú. Cualquier controversia se someterá a la jurisdicción de los tribunales de Lima.",
      },
    ],
  },

  privacidad: {
    titulo: "Política de Privacidad",
    intro:
      "Explicamos qué datos personales tratamos, con qué fin y qué derechos tienes. Cumplimos la Ley N° 29733 de Protección de Datos Personales del Perú y su reglamento.",
    secciones: [
      {
        h: "1. Responsable del tratamiento",
        p: "El responsable es el titular del servicio Vantry. Puedes contactarnos por los canales indicados al final de esta política para cualquier asunto sobre tus datos.",
      },
      {
        h: "2. Qué datos tratamos",
        items: [
          "De tu cuenta: nombre del hospedaje y de contacto, teléfono y correo, datos de facturación de la suscripción.",
          "Operativos: la información que registras en el sistema (huéspedes, reservas, cobros, comprobantes).",
          "Técnicos: datos de uso y registros necesarios para el funcionamiento y la seguridad.",
        ],
      },
      {
        h: "3. Para qué los usamos",
        p: "Para prestarte y mejorar el servicio, brindarte soporte, gestionar el cobro de tu suscripción y enviarte comunicaciones relacionadas. No vendemos tus datos ni los usamos para publicidad de terceros.",
      },
      {
        h: "4. Base legal",
        p: "Tratamos tus datos con base en tu consentimiento, en la ejecución del contrato de servicio y en el cumplimiento de obligaciones legales aplicables.",
      },
      {
        h: "5. Datos de tus huéspedes",
        p: "Respecto de los datos de tus huéspedes que registras en Vantry, tú actúas como responsable y Vantry como encargado del tratamiento: los procesamos solo siguiendo tus instrucciones y para operar el sistema. Eres responsable de contar con la base legal para tratarlos y de informar a tus huéspedes.",
      },
      {
        h: "6. Conservación",
        p: "Conservamos tus datos mientras tu cuenta esté activa y durante los plazos que exija la ley. Al cerrar tu cuenta, puedes solicitar la exportación o eliminación de tu información, salvo lo que debamos conservar por obligación legal.",
      },
      {
        h: "7. Encargados y terceros",
        p: "Nos apoyamos en proveedores de infraestructura en la nube para alojar y operar el servicio, bajo acuerdos de confidencialidad. Estos datos pueden almacenarse en servidores ubicados fuera del país, con las garantías adecuadas.",
      },
      {
        h: "8. Seguridad",
        p: "Aplicamos medidas técnicas y organizativas razonables para proteger tu información. Cada hospedaje accede únicamente a sus propios datos. Ningún sistema es 100% infalible, por lo que también recomendamos buenas prácticas de tu parte (contraseñas seguras, cuidado con las credenciales).",
      },
      {
        h: "9. Tus derechos (ARCO)",
        p: "Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición sobre tus datos personales, así como retirar tu consentimiento. Para hacerlo, contáctanos por los canales indicados abajo; atenderemos tu solicitud en los plazos legales.",
      },
      {
        h: "10. Cookies y almacenamiento",
        p: "Usamos almacenamiento esencial en tu navegador para el funcionamiento del sistema. El detalle está en nuestra Política de Cookies.",
      },
      {
        h: "11. Cambios",
        p: "Podemos actualizar esta política. Publicaremos la versión vigente con su fecha de actualización y comunicaremos los cambios relevantes.",
      },
    ],
  },

  cookies: {
    titulo: "Política de Cookies",
    intro:
      "Vantry es sobrio con tu privacidad: no usamos cookies de publicidad ni de rastreo de terceros. Solo empleamos almacenamiento esencial para que el sistema funcione.",
    secciones: [
      {
        h: "1. Qué usamos",
        items: [
          "Sesión: un identificador que mantiene tu sesión iniciada mientras usas el sistema.",
          "Preferencias: ajustes como el modo claro/oscuro y opciones de vista, guardados en tu navegador (localStorage).",
        ],
      },
      {
        h: "2. Qué NO usamos",
        p: "No usamos cookies de publicidad, ni perfiles de comportamiento, ni rastreadores de terceros con fines de marketing.",
      },
      {
        h: "3. Cómo gestionarlo",
        p: "Puedes borrar el almacenamiento de tu navegador en cualquier momento desde su configuración. Ten en cuenta que, si lo haces, se cerrará tu sesión y se perderán tus preferencias guardadas.",
      },
      {
        h: "4. Cambios",
        p: "Si en el futuro incorporamos herramientas de analítica o similares, actualizaremos esta política y, cuando corresponda, te pediremos tu consentimiento.",
      },
    ],
  },
};

export default function Legal({ doc }) {
  const data = DOCS[doc] || DOCS.terminos;
  return (
    <div className="sitio-legal">
      <div className="legal">
        <header className="legal__head">
          <h1>{data.titulo}</h1>
          <p className="legal__fecha">Última actualización: {ACTUALIZADO}</p>
          {data.intro && <p className="legal__intro">{data.intro}</p>}
        </header>

        {data.secciones.map((s) => (
          <section key={s.h} className="legal__seccion">
            <h2>{s.h}</h2>
            {s.p && <p>{s.p}</p>}
            {s.items && (
              <ul>
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="legal__seccion legal__contacto">
          <h2>Contacto</h2>
          <p>
            Para consultas legales, sobre tus datos o el ejercicio de tus derechos, escríbenos por{" "}
            <a href={waLink("Hola, tengo una consulta legal / sobre mis datos en Vantry.")} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>{" "}
            o desde la sección de <a href="#/contacto">Contacto</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
