from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, parcela_con_gestion, parcela_con_lectura
from ..models import Tratamiento, Usuario
from ..schemas import TratamientoCreate, TratamientoResp
from ..services.clima_puntual import clima_completo_en_momento, clima_en_momento

router = APIRouter(tags=["tratamientos"])


@router.post("/tratamientos/", response_model=TratamientoResp, status_code=201)
def crear_tratamiento(
    body: TratamientoCreate,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela = parcela_con_gestion(body.parcela_id, current_user, db)

    # Reconstrucción completa de las condiciones climáticas del momento exacto
    # de aplicación (temperatura, viento, racha, dirección, humedad, lluvia, et0, radiación, etc.).
    clima = clima_completo_en_momento(parcela, body.fecha, db)
    # Soporte para tests unitarios que monkeypatchean clima_en_momento
    puntual = clima_en_momento(parcela, body.fecha, db)
    if isinstance(puntual, (tuple, list)) and len(puntual) == 4:
        clima["temp_c_aplicacion"] = puntual[0]
        clima["viento_ms_aplicacion"] = puntual[1]
        clima["clima_fecha_hora"] = puntual[2]
        clima["clima_fuente"] = puntual[3]

    tratamiento = Tratamiento(
        **body.model_dump(),
        **clima,
    )
    db.add(tratamiento)
    db.commit()
    db.refresh(tratamiento)
    return tratamiento




@router.get("/parcelas/{parcela_id}/tratamientos", response_model=List[TratamientoResp])
def listar_tratamientos(
    parcela_id: int,
    tipo: Optional[str] = Query(None, description="Filtrar por tipo de tratamiento"),
    limite: int = Query(100, ge=1, le=500),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    q = db.query(Tratamiento).filter(Tratamiento.parcela_id == parcela_id)
    if tipo:
        q = q.filter(Tratamiento.tipo == tipo)
    return q.order_by(Tratamiento.fecha.desc()).limit(limite).all()


@router.delete("/tratamientos/{tratamiento_id}", status_code=204)
def borrar_tratamiento(
    tratamiento_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    tratamiento = db.query(Tratamiento).filter(Tratamiento.id == tratamiento_id).first()
    if tratamiento is None:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    # Valida el permiso de gestion sobre la parcela; 404 si no es miembro,
    # 403 si es miembro pero solo con rol de lectura.
    parcela_con_gestion(tratamiento.parcela_id, current_user, db)
    db.delete(tratamiento)
    db.commit()
