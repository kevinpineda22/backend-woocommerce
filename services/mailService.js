const nodemailer = require("nodemailer");

/**
 * Correo por el SMTP corporativo (Office365), mismo patrón que backend-traslado
 * y backend-inventario. Credenciales en el .env / Vercel:
 *
 *   EMAIL_HOST=smtp.office365.com
 *   EMAIL_PORT=587
 *   EMAIL_SECURE=false
 *   EMAIL_USER=<cuenta emisora @merkahorrosas.com>
 *   EMAIL_PASS=<contraseña de la cuenta>
 */

let transporter = null;

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Faltan EMAIL_USER / EMAIL_PASS: no se puede enviar correo.");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.office365.com",
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === "true", // false para 587 (STARTTLS)
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { ciphers: "TLSv1.2" },
    });
  }
  return transporter;
}

/** Lista de correos separados por coma, sin duplicados (sin distinguir mayúsculas). */
function listaCorreos(valor, porDefecto) {
  const vistos = new Set();
  return String(valor || porDefecto || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((correo) => {
      const clave = correo.toLowerCase();
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
}

async function enviarCorreo({ to, subject, html }) {
  return getTransporter().sendMail({
    from: `"Picking Ecommerce Merkahorro" <${process.env.EMAIL_USER}>`,
    to: to.join(","),
    subject,
    html,
  });
}

module.exports = { enviarCorreo, listaCorreos };
