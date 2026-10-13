"""
Requisitos de una contrasena NUEVA (al aceptar una invitacion, restablecerla o
cambiarla). Las cuentas antiguas con contrasenas de 8 caracteres siguen
entrando: esto solo se exige al elegir una.

La lista no pretende ser exhaustiva: corta las que se prueban primero en
cualquier ataque de diccionario, en espanol y en ingles, y las que han estado
publicadas en este proyecto como valores por defecto.
"""

LONGITUD_MINIMA = 10

_COMUNES = {
    # Publicadas en este repositorio
    "admin123", "vinalert123", "change_me", "clave12345", "vinalert", "viñalert",
    "viñalert123", "vinalert2026", "vinalert1234",
    # Secuencias y teclado
    "1234567890", "12345678910", "0123456789", "123456789a", "1q2w3e4r5t",
    "qwertyuiop", "asdfghjkl", "asdfghjklñ", "zxcvbnm123", "qwerty1234",
    "qwerty12345", "1qaz2wsx3edc", "abcdefghij", "abc1234567", "1111111111",
    "0000000000", "aaaaaaaaaa", "9876543210", "12341234", "1234512345",
    # Ingles
    "password", "password1", "password12", "password123", "password1234",
    "passw0rd123", "iloveyou12", "welcome123", "letmein123", "football12",
    "baseball12", "superman12", "trustno1234", "sunshine12", "princess12",
    "dragon1234", "monkey1234", "master1234", "shadow1234", "michael123",
    "administrator", "admin12345", "admin123456", "rootroot12", "changeme123",
    # Espanol
    "contraseña", "contraseña1", "contraseña12", "contraseña123", "contrasena",
    "contrasena1", "contrasena12", "contrasena123", "contraseña1234",
    "micontraseña", "micontrasena", "tequiero123", "teamo12345", "hola123456",
    "holahola12", "españa1234", "espana1234", "barcelona1", "barcelona12",
    "realmadrid", "realmadrid1", "madrid1234", "galicia123", "vigo123456",
    "pontevedra", "ourense123", "albariño12", "albarino12", "viñedo1234",
    "vinedo1234", "bodega1234", "uva1234567", "vendimia12", "tractor123",
    "agricultor", "agricultor1", "campo12345", "cosecha123", "verano2026",
    "invierno26", "otoño2026", "primavera1", "abcd123456", "usuario123",
    "usuario1234", "bienvenido", "bienvenido1", "bienvenido12",
}


def validar(password: str) -> None:
    """Lanza ValueError con un mensaje para el usuario si no vale."""
    if len(password) < LONGITUD_MINIMA:
        raise ValueError(f"La contraseña debe tener al menos {LONGITUD_MINIMA} caracteres.")
    if password.strip().lower() in _COMUNES:
        raise ValueError("Esa contraseña es demasiado común. Elige otra.")
