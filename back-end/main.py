from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import mysql.connector
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

db_config = {
    "host": "localhost",
    "user": "root",            
    "password": "password",
    "database": "minesweeper", 
}

def get_db_connection():
    return mysql.connector.connect(**db_config)

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

@app.get("/")
def index():
    return {"name": "Minesweeper", "test": 87}

@app.post("/save_record")
def save_record(record: Record):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        insert_query = "INSERT INTO game_records (username, score, diff) VALUES (%s, %s, %s)"
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
        cursor = connection.cursor(dictionary=True)

        query = "SELECT * FROM game_records WHERE diff = %s ORDER BY score ASC, created_at ASC"
        cursor.execute(query, (difficulty,))

        records = cursor.fetchall()
        
        cursor.close()
        connection.close()

        if not records:
            return []

        players = [Player(**record) for record in records]    
        return players
    
    except Exception as e:
        return {"error": str(e)}
