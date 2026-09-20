from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import obtener_password_hash, verificar_password, crear_token_acceso
from ..database import get_db
from ..deps import es_superadmin, get_current_user
from ..models import Usuario
from ..schemas import Token, UsuarioCreate, UsuarioResp, UsuarioMeResp

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UsuarioResp, status_code=201)
def register_usuario(body: UsuarioCreate, db: Session = Depends(get_db)) -> Any:
    # body.email ya llega en minusculas (UsuarioCreate); se compara en minusculas
    # tambien contra la BD por las cuentas antiguas guardadas con mayusculas.
    if db.query(Usuario).filter(func.lower(Usuario.email) == body.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email ya registrado")

    user = Usuario(
        nombre=body.nombre,
        email=body.email,
        hashed_password=obtener_password_hash(body.password),
        rol="agricultor",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Any:
    email = form_data.username.strip().lower()
    user = db.query(Usuario).filter(func.lower(Usuario.email) == email).first()
    if not user or not verificar_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=crear_token_acceso({"sub": str(user.id)}), token_type="bearer")


@router.get("/me", response_model=UsuarioMeResp)
def usuario_actual(current_user: Usuario = Depends(get_current_user)) -> Any:
    """
    Quien soy. Sin esto la aplicacion web no puede saber, tras recargar la
    pagina, ni tu nombre ni si eres admin — y por tanto no puede decidir que
    acciones mostrarte.
    """
    return UsuarioMeResp(
        id=current_user.id,
        nombre=current_user.nombre,
        email=current_user.email,
        rol=current_user.rol,
        es_superadmin=es_superadmin(current_user),
    )
