import io
from typing import Any, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, parcela_con_gestion, parcela_con_lectura
from ..models import LecturaFoliar, Usuario
from ..schemas import LecturaFoliarResp
from ..services.foliar_parser import FormatoExcelInvalido, parsear_excel_foliar

MAX_BYTES_EXCEL = 5 * 1024 * 1024

router = APIRouter(prefix="/parcelas/{parcela_id}/foliar", tags=["foliar"])


@router.post("/upload", response_model=List[LecturaFoliarResp], status_code=201)
def subir_excel_foliar(
    parcela_id: int,
    archivo: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_gestion(parcela_id, current_user, db)

    # Se lee como mucho un byte mas del limite: basta para saber si se pasa
    # sin cargar en memoria un archivo de cualquier tamano.
    datos = archivo.file.read(MAX_BYTES_EXCEL + 1)
    if len(datos) > MAX_BYTES_EXCEL:
        raise HTTPException(
            status_code=413,
            detail="El archivo pesa más de 5 MB. Un Excel del medidor foliar ocupa mucho menos: revisa que sea el correcto.",
        )
    try:
        bloques = parsear_excel_foliar(io.BytesIO(datos))
    except FormatoExcelInvalido as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    registros = [
        LecturaFoliar(parcela_id=parcela_id, archivo_origen=archivo.filename, **bloque)
        for bloque in bloques
    ]
    db.add_all(registros)
    db.commit()
    for r in registros:
        db.refresh(r)
    return registros


@router.get("/", response_model=List[LecturaFoliarResp])
def listar_lecturas_foliares(
    parcela_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    parcela_con_lectura(parcela_id, current_user, db)
    return (
        db.query(LecturaFoliar)
        .filter(LecturaFoliar.parcela_id == parcela_id)
        .order_by(LecturaFoliar.fecha.desc(), LecturaFoliar.grupo.asc())
        .all()
    )
