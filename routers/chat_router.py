from fastapi import APIRouter, Depends
from pydantic import BaseModel
from dependencies import get_current_user
import os, re
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(tags=["chat"])

class ChatRequest(BaseModel):
    pergunta: str

@router.post("/chat")
async def chat(req: ChatRequest, user=Depends(get_current_user)):
    from groq import Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "Você é o Agent Bastos, assistente especializado em inteligência "
                    "de segurança pública e corporativa. Responda de forma objetiva, "
                    "técnica e em português brasileiro."
                )
            },
            {"role": "user", "content": req.pergunta}
        ],
        max_tokens=1024,
        temperature=0.3,
    )
    resposta = completion.choices[0].message.content
    return {"resposta": resposta}