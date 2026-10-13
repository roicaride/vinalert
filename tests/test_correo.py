"""
El correo sale por SMTP estandar. Sin SMTP_HOST (desarrollo, tests) no se
conecta a nada: el email se escribe en el log, enlace incluido.
"""
import logging

import pytest

from app.services import correo


class SmtpFalso:
    instancias = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port
        self.llamadas = []
        self.mensajes = []
        SmtpFalso.instancias.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self):
        self.llamadas.append("starttls")

    def login(self, usuario, password):
        self.llamadas.append(("login", usuario, password))

    def send_message(self, msg):
        self.mensajes.append(msg)


@pytest.fixture()
def smtp(monkeypatch):
    SmtpFalso.instancias = []
    monkeypatch.setattr(correo.smtplib, "SMTP", SmtpFalso)
    monkeypatch.setattr(correo.smtplib, "SMTP_SSL", SmtpFalso)
    return SmtpFalso


@pytest.fixture()
def config_smtp(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.ejemplo.es")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USUARIO", "u")
    monkeypatch.setenv("SMTP_PASSWORD", "p")
    monkeypatch.setenv("CORREO_REMITENTE", "Viñalert <no-responder@vinalert.es>")
    monkeypatch.setenv("URL_WEB", "https://app.vinalert.es")


def test_sin_smtp_host_no_se_conecta_y_lo_escribe_en_el_log(monkeypatch, smtp, caplog):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    with caplog.at_level(logging.WARNING):
        correo.enviar_recuperacion("ana@x.es", "http://localhost:5173/restablecer?token=abc")
    assert smtp.instancias == []
    assert "restablecer?token=abc" in caplog.text


def test_con_starttls_envia_al_destinatario_con_el_enlace(config_smtp, smtp):
    correo.enviar_invitacion("ana@x.es", "https://app.vinalert.es/invitacion?token=xyz", "Roi", "Viña Norte")

    (conexion,) = smtp.instancias
    assert (conexion.host, conexion.port) == ("smtp.ejemplo.es", 587)
    assert conexion.llamadas == ["starttls", ("login", "u", "p")]
    (msg,) = conexion.mensajes
    assert msg["To"] == "ana@x.es"
    texto = msg.get_body(preferencelist=("plain",)).get_content()
    assert "https://app.vinalert.es/invitacion?token=xyz" in texto
    assert "Roi" in texto and "Viña Norte" in texto


def test_el_puerto_465_usa_ssl_sin_starttls(config_smtp, monkeypatch, smtp):
    monkeypatch.setenv("SMTP_PORT", "465")
    correo.enviar_recuperacion("ana@x.es", "https://app.vinalert.es/restablecer?token=1")
    (conexion,) = smtp.instancias
    assert "starttls" not in conexion.llamadas


def test_un_fallo_de_envio_no_se_propaga(config_smtp, monkeypatch, caplog):
    def roto(*a, **k):
        raise OSError("sin red")
    monkeypatch.setattr(correo.smtplib, "SMTP", roto)
    correo.enviar_recuperacion("ana@x.es", "https://app.vinalert.es/restablecer?token=1")
    assert "sin red" in caplog.text


def test_con_smtp_y_sin_url_web_no_arranca(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.ejemplo.es")
    monkeypatch.delenv("URL_WEB", raising=False)
    with pytest.raises(RuntimeError, match="URL_WEB"):
        correo.validar_configuracion()


def test_url_web_por_defecto_en_desarrollo(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("URL_WEB", raising=False)
    assert correo.url_web() == "http://localhost:5173"
