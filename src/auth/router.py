from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from loguru import logger
from src.db.clickhouse_client import ch_manager
from src.auth import jwt_handler
from config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Fully-qualified table name — required because ClickHouse's HTTP interface
# does not reliably persist the session database from the connection parameter.
DB = settings.CLICKHOUSE_DB
USERS_TABLE = f"{DB}.users"
security = HTTPBearer()

class AuthRequest(BaseModel):
    username: str
    password: str

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    payload = jwt_handler.decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload

@router.post("/register")
async def register(req: AuthRequest):
    username = req.username.strip()
    if not username or not req.password:
        raise HTTPException(status_code=400, detail="Username and password cannot be empty")
        
    client = ch_manager.get_client()
    try:
        # Check if username exists
        existing = client.query(
            f"SELECT username FROM {USERS_TABLE} WHERE username = %(u)s LIMIT 1",
            parameters={"u": username}
        )
        if existing.result_rows:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Hash and store
        pwd_hash = jwt_handler.hash_password(req.password)
        client.insert(
            USERS_TABLE,
            [[username, pwd_hash]],
            column_names=["username", "password_hash"]
        )
        
        token = jwt_handler.create_access_token({"sub": username})
        return {"access_token": token, "token_type": "bearer", "username": username}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in register: {e}")
        raise HTTPException(status_code=500, detail="Internal server database error")

@router.post("/login")
async def login(req: AuthRequest):
    username = req.username.strip()
    client = ch_manager.get_client()
    try:
        res = client.query(
            f"SELECT username, password_hash FROM {USERS_TABLE} WHERE username = %(u)s LIMIT 1",
            parameters={"u": username}
        )
        if not res.result_rows:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        user_row = res.result_rows[0]
        stored_hash = user_row[1]
        
        if not jwt_handler.verify_password(req.password, stored_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        token = jwt_handler.create_access_token({"sub": username})
        return {"access_token": token, "token_type": "bearer", "username": username}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in login: {e}")
        raise HTTPException(status_code=500, detail="Internal server database error")
