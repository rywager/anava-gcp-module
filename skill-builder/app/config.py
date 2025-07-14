"""
Application configuration
"""

import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    app_name: str = "anava-skill-builder"
    debug: bool = False
    
    # GCP
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "")
    gcp_region: str = os.getenv("GCP_REGION", "us-central1")
    
    # Firestore
    firestore_collection_conversations: str = "skill_builder_conversations"
    firestore_collection_skills: str = "generated_skills"
    firestore_collection_deployments: str = "skill_deployments"
    
    # MCP Server
    mcp_server_url: str = os.getenv("MCP_SERVER_URL", "http://localhost:8000")
    
    # CORS
    cors_origins: List[str] = [
        "http://localhost:3000",
        "https://anava-vision.web.app",
        "https://anava-vision.firebaseapp.com"
    ]
    
    # Redis (for caching)
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # NLP Model
    nlp_model_name: str = "en_core_web_sm"
    intent_confidence_threshold: float = 0.7
    
    # Security
    secret_key: str = os.getenv("SECRET_KEY", "development-secret-key")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"