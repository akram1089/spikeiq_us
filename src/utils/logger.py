import sys
from loguru import logger
from config import settings

def setup_logger():
    """Configure loguru for application logging."""
    logger.remove()
    
    # Console handler
    logger.add(
        sys.stdout,
        level=settings.LOG_LEVEL,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        enqueue=True
    )
    
    # File handler
    logger.add(
        settings.LOG_FILE,
        rotation="10 MB",
        retention="10 days",
        level=settings.LOG_LEVEL,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
        enqueue=True
    )
    
    logger.info(f"Logging configured: level={settings.LOG_LEVEL}, file={settings.LOG_FILE}")
