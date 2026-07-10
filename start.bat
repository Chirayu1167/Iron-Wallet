@echo off
echo.
echo  IronWallet - Setting up local environment...
echo.

:: ═══════════════════════════════════════════════
::   PASTE YOUR TWILIO CREDENTIALS HERE
::   (or copy .env.example to .env and set them there)
:: ═══════════════════════════════════════════════
set ACCOUNT_SID=
set AUTH_TOKEN=
set TWILIO_PHONE=
:: ═══════════════════════════════════════════════

:: Create local venv inside THIS folder if it doesn't exist
if not exist ".venv" (
    echo  Creating local virtual environment...
    python -m venv .venv
)

:: Install packages into the LOCAL venv
echo  Installing dependencies...
.venv\Scripts\pip install numpy scikit-learn joblib fastapi "uvicorn[standard]" pydantic twilio python-multipart httpx --quiet

echo.
echo  Starting IronWallet server...
echo  Open http://localhost:8000 in your browser
echo.

:: Run uvicorn from the LOCAL venv
.venv\Scripts\uvicorn otp_server:app --host 0.0.0.0 --port 8000 --reload
