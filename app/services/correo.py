"""
Envio de emails por SMTP estandar: cambiar de proveedor es cambiar el .env.

Sin SMTP_HOST (desarrollo, tests) no se conecta a nada: el email se escribe en
el log con nivel WARNING, enlace incluido, para poder seguir el flujo copiando
el enlace de la consola.

Ningun fallo de envio se propaga: quien llama lo hace en segundo plano
(BackgroundTasks) y una invitacion perdida se puede reenviar.
"""
import logging
import os
import smtplib
from email.message import EmailMessage
from html import escape
from typing import Optional

logger = logging.getLogger(__name__)

URL_WEB_DESARROLLO = "http://localhost:5173"


def validar_configuracion() -> None:
    """Con SMTP configurado, URL_WEB es obligatoria: sin ella no hay enlaces."""
    if os.getenv("SMTP_HOST") and not os.getenv("URL_WEB"):
        raise RuntimeError("Falta URL_WEB: con SMTP_HOST definido hace falta para construir los enlaces de los emails.")


def url_web() -> str:
    return (os.getenv("URL_WEB") or URL_WEB_DESARROLLO).rstrip("/")


def enviar(destinatario: str, asunto: str, texto: str, html: str) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.warning("SMTP_HOST sin definir; email NO enviado.\nPara: %s\nAsunto: %s\n\n%s", destinatario, asunto, texto)
        return

    msg = EmailMessage()
    msg["From"] = os.getenv("CORREO_REMITENTE", "Viñalert <no-responder@localhost>")
    msg["To"] = destinatario
    msg["Subject"] = asunto
    msg.set_content(texto)
    msg.add_alternative(html, subtype="html")

    puerto = int(os.getenv("SMTP_PORT", "587"))
    usuario = os.getenv("SMTP_USUARIO")
    password = os.getenv("SMTP_PASSWORD")
    try:
        if puerto == 465:
            conexion = smtplib.SMTP_SSL(host, puerto, timeout=20)
        else:
            conexion = smtplib.SMTP(host, puerto, timeout=20)
        with conexion as smtp:
            if puerto != 465:
                smtp.starttls()
            if usuario:
                smtp.login(usuario, password or "")
            smtp.send_message(msg)
    except Exception:
        logger.exception("No se pudo enviar el email '%s' a %s", asunto, destinatario)


def _html(parrafos: list[str], enlace: str, boton: str) -> str:
    cuerpo = "".join(f"<p>{escape(p)}</p>" for p in parrafos)
    return (
        '<div style="font-family:sans-serif;max-width:520px;color:#222a2e">'
        f"{cuerpo}"
        f'<p><a href="{escape(enlace)}" style="display:inline-block;padding:10px 18px;'
        f'background:#222a2e;color:#efede6;text-decoration:none">{escape(boton)}</a></p>'
        f'<p style="font-size:12px;color:#787c7b">Si el botón no funciona, copia este enlace: {escape(enlace)}</p>'
        "</div>"
    )


def enviar_invitacion(destinatario: str, enlace: str, invitado_por: Optional[str], parcela: Optional[str]) -> None:
    quien = invitado_por or "El equipo de Viñalert"
    donde = f" a la parcela «{parcela}»" if parcela else ""
    parrafos = [
        f"{quien} te ha invitado a Viñalert{donde}.",
        "Para entrar, elige tu nombre y una contraseña desde este enlace. Caduca en 7 días.",
    ]
    texto = "\n\n".join(parrafos + [enlace, "Si no esperabas esta invitación, ignora este email."])
    enviar(destinatario, "Te han invitado a Viñalert", texto, _html(parrafos, enlace, "Aceptar invitación"))


def enviar_recuperacion(destinatario: str, enlace: str) -> None:
    parrafos = [
        "Alguien (probablemente tú) ha pedido restablecer la contraseña de tu cuenta de Viñalert.",
        "Para elegir una nueva, abre este enlace. Caduca en 1 hora y solo sirve una vez.",
    ]
    texto = "\n\n".join(parrafos + [enlace, "Si no lo has pedido tú, ignora este email: tu contraseña no cambia."])
    enviar(destinatario, "Restablecer tu contraseña de Viñalert", texto, _html(parrafos, enlace, "Elegir contraseña nueva"))
