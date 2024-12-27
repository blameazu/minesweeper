from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "minesweeper.db"

def get_db_connection():
    return sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)

class Record(BaseModel):
    username: str
    score: int
    diff: str

class Player(BaseModel):
    id: Optional[int]
    username: str
    score: int
    diff: str
    created_at: datetime

@app.on_event("startup")
def startup():
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS game_records (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               username TEXT NOT NULL,
               score INTEGER NOT NULL,
               diff TEXT NOT NULL,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    connection.commit()
    cursor.close()
    connection.close()

@app.get("/")
def index():
    return {"name": "Minesweeper", "creater": "Blame"}

@app.post("/save_record")
def save_record(record: Record):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        insert_query = "INSERT INTO game_records (username, score, diff) VALUES (?, ?, ?)"
        cursor.execute(insert_query, (record.username, record.score, record.diff))
        connection.commit()

        cursor.close()
        connection.close()
        return {"message": "Record saved successfully"}

    except Exception as e:
        return {"error": str(e)}

@app.get("/scoreboard/{difficulty}", response_model=List[Player])
async def get_scoreboard(difficulty: str):
    try:
        connection = get_db_connection()
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()

        query = "SELECT * FROM game_records WHERE diff = ? ORDER BY score ASC, created_at ASC"
        cursor.execute(query, (difficulty,))

        records = cursor.fetchall()

        cursor.close()
        connection.close()

        if not records:
            return []

        players = [Player(**dict(record)) for record in records]
        return players

    except Exception as e:
        return {"error": str(e)}
