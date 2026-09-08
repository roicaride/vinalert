from datetime import date

from app.database import Base
from app.models import LecturaFoliar


def test_lectura_foliar_tiene_los_campos_esperados(db_session, parcela_id):
    lectura = LecturaFoliar(
        parcela_id=parcela_id,
        fecha=date(2026, 7, 28),
        grupo=1,
        chl_medio=29584.0,
        chl_sd=1200.0,
        flav_medio=1271.0,
        flav_sd=120.0,
        nbi_medio=23.28,
        nbi_sd=2.1,
        n_mediciones=61,
        archivo_origen="Libro1.xlsx",
    )
    db_session.add(lectura)
    db_session.commit()
    db_session.refresh(lectura)
    assert lectura.id is not None
    assert lectura.grupo == 1
