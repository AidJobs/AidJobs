from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.config import Capabilities, get_env_presence

load_dotenv()

app = FastAPI(title="AidJobs API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/healthz")
async def healthz():
    return Capabilities.get_status()


@app.get("/admin/config/env")
async def config_env():
    return get_env_presence()
