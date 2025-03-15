@echo off
echo Installing Windows requirements...
pip install -r requirements_windows.txt

echo Installing spaCy English language model...
python -m spacy download en_core_web_sm

echo Setup completed! You can now run the application. 