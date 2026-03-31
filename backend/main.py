import os
import json
import re
import httpx
import bcrypt
from groq import Groq
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
from uuid import uuid4

# Appwrite imports
from appwrite.client import Client as AppwriteClient
from appwrite.services.databases import Databases as AppwriteDatabases
from appwrite.query import Query

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# --- FastAPI App Initialization ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class FamilyMember(BaseModel):
    name: str
    # Frontend currently sends `birthday` (YYYY-MM-DD) rather than `age`.
    # Accept either `age` or `birthday` to be flexible during development.
    age: Optional[int] = None
    birthday: Optional[str] = None
    dietary_preference: str
    health_goals: Optional[str] = ""
    dislikes: Optional[str] = ""
    allergies: Optional[str] = ""
    medical_conditions: Optional[str] = ""
    religious_preferences: Optional[str] = ""
    special_notes: Optional[str] = ""
    religious_rules: Optional[str] = ""

class MealRequest(BaseModel):
    family_members: List[FamilyMember]
    ingredients: List[str]
    mealType: str
    dayOfWeek: str


# --- Appwrite Setup ---
APPWRITE_ENDPOINT = os.getenv('AppwriteEndpoint')
APPWRITE_PROJECT = os.getenv('AppwriteProjectID')
APPWRITE_KEY = os.getenv('DatabaseAPI')
APPWRITE_DB = os.getenv('DatabaseID')
APPWRITE_COLLECTION = 'user_info'

appwrite_client = None
appwrite_db = None
try:
    appwrite_client = AppwriteClient()
    appwrite_client.set_endpoint(APPWRITE_ENDPOINT)
    appwrite_client.set_project(APPWRITE_PROJECT)
    appwrite_client.set_key(APPWRITE_KEY)
    appwrite_db = AppwriteDatabases(appwrite_client)
except Exception as e:
    print(f"Appwrite client init failed: {e}")


# --- Appwrite helper functions ---
def find_user_doc_by_email(email: str):
    if not appwrite_db:
        return None
    try:
        queries = [Query.equal("email", email)]
        res = appwrite_db.list_documents(APPWRITE_DB, APPWRITE_COLLECTION, queries=queries)
        docs = None
        if isinstance(res, dict):
            docs = res.get('documents')
        else:
            try:
                docs = getattr(res, 'documents', None)
            except Exception:
                docs = None
        if docs and len(docs) > 0:
            return docs[0]
        return None
    except Exception as e:
        print(f"Error finding user by email: {e}")
        return None

# --- New endpoints: signup, login, get user, save family ---
class SignupModel(BaseModel):
    name: str
    email: str
    password: str

class LoginModel(BaseModel):
    email: str
    password: str

@app.post('/signup')
def signup(data: SignupModel):
    if not appwrite_db:
        raise HTTPException(status_code=500, detail='Appwrite DB not configured')
    # check exists
    existing = find_user_doc_by_email(data.email)
    if existing:
        raise HTTPException(status_code=400, detail='Account already exists')
    try:
        doc_id = uuid4().hex
        hashed_password = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        payload = {
            'name': data.name,
            'email': data.email,
            'password': hashed_password,
            'family_details': json.dumps([]),
        }
        created = appwrite_db.create_document(APPWRITE_DB, APPWRITE_COLLECTION, doc_id, payload)
        return {'ok': True, 'id': created.get('$id') if isinstance(created, dict) else getattr(created, '$id', doc_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to create user: {e}')


@app.post('/login')
def login(data: LoginModel):
    if not appwrite_db:
        raise HTTPException(status_code=500, detail='Appwrite DB not configured')
    doc = find_user_doc_by_email(data.email)
    if not doc:
        raise HTTPException(status_code=400, detail='No account found')
    # doc may have 'password' field
    stored_password = doc.get('password') if isinstance(doc, dict) else None
    if not stored_password or not bcrypt.checkpw(data.password.encode('utf-8'), stored_password.encode('utf-8')):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    # return user without exposing raw family_details string parsing
    user = {
        'id': doc.get('$id'),
        'name': doc.get('name'),
        'email': doc.get('email'),
        'family': json.loads(doc.get('family_details') or '[]')
    }
    return user


@app.get('/user')
def get_user(email: str):
    if not appwrite_db:
        raise HTTPException(status_code=500, detail='Appwrite DB not configured')
    doc = find_user_doc_by_email(email)
    if not doc:
        raise HTTPException(status_code=404, detail='User not found')
    return {
        'id': doc.get('$id'),
        'name': doc.get('name'),
        'email': doc.get('email'),
        'family': json.loads(doc.get('family_details') or '[]'),
        'most_used': doc.get('most_used') or '{}'
    }


@app.post('/save_family')
def save_family(payload: dict):
    if not appwrite_db:
        raise HTTPException(status_code=500, detail='Appwrite DB not configured')
    email = payload.get('email')
    family = payload.get('family')
    if not email or family is None:
        raise HTTPException(status_code=400, detail='Missing email or family data')
    doc = find_user_doc_by_email(email)
    if not doc:
        raise HTTPException(status_code=404, detail='User not found')
    try:
        doc_id = doc.get('$id')
        update_payload = {'family_details': json.dumps(family)}
        updated = appwrite_db.update_document(APPWRITE_DB, APPWRITE_COLLECTION, doc_id, update_payload)
        return {'ok': True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to save family: {e}')


@app.post('/save_ingredients')
def save_ingredients(payload: dict):
    if not appwrite_db:
        raise HTTPException(status_code=500, detail='Appwrite DB not configured')
    email = payload.get('email')
    ingredients = payload.get('ingredients')
    if not email or ingredients is None:
        raise HTTPException(status_code=400, detail='Missing email or ingredients data')
    doc = find_user_doc_by_email(email)
    if not doc:
        raise HTTPException(status_code=404, detail='User not found')
    try:
        # Get existing most_used data or initialize empty dict
        most_used_str = doc.get('most_used') or '{}'
        try:
            most_used = json.loads(most_used_str)
        except Exception:
            most_used = {}
        
        # Increment count for each ingredient
        for ing in ingredients:
            most_used[ing] = most_used.get(ing, 0) + 1
        
        doc_id = doc.get('$id')
        update_payload = {'most_used': json.dumps(most_used)}
        updated = appwrite_db.update_document(APPWRITE_DB, APPWRITE_COLLECTION, doc_id, update_payload)
        return {'ok': True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to save ingredients: {e}')


# --- Groq API Integration ---
try:
    client = Groq(
        api_key=os.getenv('MealFlowAPI'),
        http_client=httpx.Client(verify=False)
    )
except Exception as e:
    client = None
    print(f"Could not initialize Groq client: {e}")


def get_recipe_from_groq(preprompt: str):
    if not client:
        raise HTTPException(status_code=500, detail="Groq client is not initialized. Check API key.")
    try:
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": preprompt}],
            model="moonshotai/kimi-k2-instruct",
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred with the Groq API: {str(e)}")


def build_preprompt(data: MealRequest) -> str:
    def compute_age_from_birthday(bday_str: Optional[str]) -> Optional[int]:
        if not bday_str:
            return None
        try:
            # Expecting ISO format YYYY-MM-DD from frontend
            bd = datetime.fromisoformat(bday_str).date()
        except Exception:
            try:
                bd = datetime.strptime(bday_str, "%Y-%m-%d").date()
            except Exception:
                return None
        today = date.today()
        age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
        return age

    family_details_lines = []
    for m in data.family_members:
        age_val = m.age if getattr(m, 'age', None) is not None else compute_age_from_birthday(getattr(m, 'birthday', None))
        age_display = f"{age_val} yrs" if age_val is not None else "N/A"
        allergies = getattr(m, 'allergies', '') or ''
        medical = getattr(m, 'medical_conditions', '') or ''
        religious = getattr(m, 'religious_preferences', '') or ''
        dislikes = m.dislikes or 'None'
        family_details_lines.append(
            f"- Name: {m.name}, Age: {age_display}, Diet: {m.dietary_preference}, "
            f"Health Goals: {m.health_goals or 'N/A'}, Dislikes: {dislikes}, "
            f"Allergies: {allergies or 'None'}, Medical Conditions: {medical or 'None'}, "
            f"Religious Preferences: {religious or 'None'}, Rules: {m.religious_rules or 'None'}"
        )
    family_details = "\n".join(family_details_lines)
    ingredient_list = ", ".join(data.ingredients) if data.ingredients else "None available"

    preprompt = f"""
You are MealFlow AI, an expert recipe decision engine for Indian households. Your task is to generate a single, suitable Indian meal recipe based on a complex set of constraints.

**CONTEXT:**
- Meal Type: {data.mealType}
- Day of the Week: {data.dayOfWeek}

**INPUT CONSTRAINTS:**
1.  **Family Members & Rules:**
{family_details}

2.  **Available Ingredients:**
{ingredient_list}

IMPORTANT: It is NOT necessary to use every available ingredient. Use a sensible subset — it's fine to use only a small percentage of the listed vegetables when appropriate (e.g., do not force bell peppers into a dal if they don't belong).

**CORE DIRECTIVES & RULES:**
1.  **VEGETARIAN RULE (CRITICAL):** If ANY family member has a diet of 'veg', the main dish for the entire meal MUST be vegetarian. You can ONLY suggest an optional, simple, separate non-veg side dish if it complements the meal and uses available ingredients. Do not make the primary meal non-vegetarian if a vegetarian is present.
2.  **DAY-SPECIFIC RULE (CRITICAL):** You must strictly obey all day-specific and religious rules. Analyze the "Day of the Week" context provided. For example, if today is '{data.dayOfWeek}' and a member's rule is 'No non-veg on Tuesdays', you MUST treat that member as 'veg' for this request, even if their default preference is non-veg.
3.  **INGREDIENT USAGE:** You must ONLY use the ingredients from the "Available Ingredients" list. You are permitted to assume a standard set of basic Indian household spices are available (e.g., turmeric, chili powder, cumin, coriander powder, salt, pepper, garam masala) if they are not listed. Do not use any other unlisted ingredients.
4.  **MEAL TYPE ADHERENCE:** The generated recipe must be appropriate for the specified "Meal Type" ({data.mealType}).
5.  **PER-MEMBER CATERING (CRITICAL):** For EVERY family member listed, you MUST provide a specific, personalized explanation of WHY this recipe works for them. Consider their dietary preference, allergies, medical conditions, health goals, dislikes, religious preferences, and any age-specific needs. This explanation should be simple, warm, and easy to understand for an Indian family cook.

**OUTPUT FORMAT (MANDATORY):**
- You MUST return ONLY a raw JSON object, without any markdown formatting (e.g., ```json), comments, or other text.
- The JSON structure MUST be exactly as follows:
{{
  "meal": {{
    "name": "Generated Meal Name",
    "type": "veg | non-veg",
    "cuisine": "Indian",
    "why_this_meal": "CRITICAL: Include exactly ONE distinct point for EACH family member listed (if 3 members, 3 points). Example for 2 members: 'This meal is vegetarian for Ramesh (matching his diet) and low-carb for Sarah (supporting her weight loss).' Use very simple, warm English suitable for Indian families."
  }},
  "ingredients_used": [
    {{"ingredient": "Name", "category": "vegetable|protein|grain|dairy|spice|other"}}
  ],
  "recipe": {{
    "total_time_minutes": 30,
    "steps": [
      "A single, concise instruction for one action.",
      "Another single action step.",
      "And so on. Do NOT number steps inside this string. Each array element is one step."
    ]
  }},
  "member_specific_recommendations": [
    {{"name": "Member Name", "recommendation": "A specific serving suggestion for this person based on their constraints (allergies, health goals, medical conditions, etc)."}},
    {{"name": "Another Member", "recommendation": "Tailored serving suggestion for this person."}}
  ],
  "member_catered_points": [
    {{"name": "Member Name", "points": ["Point 1 explaining how recipe respects their constraint", "Point 2 based on their health or dietary needs", "Point 3 if applicable"]}},
    {{"name": "Another Member", "points": ["Point 1", "Point 2", "Point 3"]}}
  ],
  "serving_notes": "General notes on how to best serve this meal.",
  "tips": [
    "A useful tip related to the recipe.",
    "Another practical tip."
  ]
}}

**CRITICAL INSTRUCTIONS FOR member_catered_points:**
- You MUST include an entry for EVERY family member — do not skip anyone.
- For each member, provide 2-3 bullet points that specifically explain how the recipe suits THEIR individual constraints.
- Use their constraints in this order of importance: medical conditions, allergies, dietary preference, dislikes, health goals, religious preferences.
- Write in simple, warm, everyday English. Example format:
  - "Less spicy because you have a sensitive digestive system"
  - "High protein because you told us your goal is to build muscle"
  - "No onions today because of your religious fasting preference"
  - "Includes soft rice because you just had dental work"

**RECIPE STEP FORMATTING (CRITICAL):**
- Each string in the "steps" array must represent a SINGLE, distinct action.
- BAD: ["1. Chop onions. 2. Sauté them."]
- GOOD: ["Chop the onions finely.", "In a hot pan with oil, sauté the chopped onions until golden brown."]

ADDITIONAL: When describing why the meal was chosen and the member-catered points, use very simple English (short sentences, everyday words) so the output is easy to read for Indian family cooks.

Begin generation now.
"""
    return preprompt

# --- API Endpoint ---
@app.post("/generate_meal")
async def generate_meal(request_data: MealRequest):
    if not request_data.family_members and not request_data.ingredients:
        raise HTTPException(status_code=400, detail="Please provide family member details or select ingredients.")

    preprompt = build_preprompt(request_data)
    
    try:
        groq_response_str = get_recipe_from_groq(preprompt)
        
        # Clean the response: find JSON object by matching braces carefully
        # Try to extract JSON starting from the first { and match braces
        json_start = groq_response_str.find('{')
        if json_start == -1:
            raise json.JSONDecodeError("No opening brace { found in the AI response.", groq_response_str, 0)
        
        # Try to find valid JSON by incrementally parsing from the start
        for json_end in range(len(groq_response_str), json_start, -1):
            candidate = groq_response_str[json_start:json_end].strip()
            try:
                recipe_json = json.loads(candidate)
                return recipe_json
            except json.JSONDecodeError:
                continue
        
        # If no valid JSON found, raise error with the full response
        raise json.JSONDecodeError(
            "Could not parse any valid JSON from the AI response.",
            groq_response_str,
            0
        )

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to decode recipe JSON from AI. Response: {groq_response_str[:500]}"
        )
    except HTTPException as e:
        raise e # Re-raise exceptions from the Groq call
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

# --- Root Endpoint (for testing) ---
@app.get("/")
def read_root():
    return {"message": "Welcome to the MealFlow API!"}

