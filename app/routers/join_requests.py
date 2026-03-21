from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_admin_or_above
from app.models import AppUser, EmployeeJoinRequest
from app.schemas import JoinRequestResponse

router = APIRouter(prefix="/join-requests", tags=["Join Requests"])


@router.get("", response_model=list[JoinRequestResponse])
async def get_join_requests(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Admin obtiene las solicitudes pendientes para su tenant."""
    result = await db.execute(
        select(EmployeeJoinRequest)
        .where(
            EmployeeJoinRequest.tenant_id == current_user.tenant_id,
            EmployeeJoinRequest.status == "pending",
        )
        .options(selectinload(EmployeeJoinRequest.user))
        .order_by(EmployeeJoinRequest.created_at.desc())
    )
    requests = result.scalars().all()

    return [
        JoinRequestResponse(
            id=r.id,
            user_id=r.user_id,
            tenant_id=r.tenant_id,
            status=r.status,
            created_at=r.created_at,
            username=r.user.username if r.user else None,
            email=r.user.email if r.user else None,
            tenant_nombre=None,
        )
        for r in requests
    ]


@router.post("/{request_id}/approve")
async def approve_join_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Admin aprueba una solicitud: el empleado queda vinculado al tenant."""
    result = await db.execute(
        select(EmployeeJoinRequest)
        .where(
            EmployeeJoinRequest.id == request_id,
            EmployeeJoinRequest.tenant_id == current_user.tenant_id,
            EmployeeJoinRequest.status == "pending",
        )
        .options(selectinload(EmployeeJoinRequest.user))
    )
    req = result.scalars().first()

    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    req.status = "approved"
    req.user.role = "empleado"
    req.user.tenant_id = req.tenant_id

    await db.commit()
    return {"message": "Empleado aprobado exitosamente"}


@router.post("/{request_id}/reject")
async def reject_join_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_admin_or_above),
):
    """Admin rechaza una solicitud."""
    result = await db.execute(
        select(EmployeeJoinRequest)
        .where(
            EmployeeJoinRequest.id == request_id,
            EmployeeJoinRequest.tenant_id == current_user.tenant_id,
            EmployeeJoinRequest.status == "pending",
        )
    )
    req = result.scalars().first()

    if not req:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    req.status = "rejected"
    await db.commit()
    return {"message": "Solicitud rechazada"}
