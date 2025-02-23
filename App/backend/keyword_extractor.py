import spacy
from typing import List

# Load the spaCy model
nlp = spacy.load('en_core_web_sm')

def extract_keywords(prompt: str) -> List[str]:
    """
    Extract keywords from a given prompt using spaCy.
    
    Args:
        prompt (str): The input prompt to extract keywords from
        
    Returns:
        List[str]: A list of extracted keywords
    """
    # Process the prompt using spaCy
    doc = nlp(prompt.lower())  # Convert to lowercase for consistency
    
    # Extract keywords based on part-of-speech tagging
    # We focus on nouns, proper nouns, verbs, and adjectives
    keywords = [
        token.text for token in doc 
        if token.pos_ in {'NOUN', 'PROPN', 'VERB', 'ADJ'} 
        and not token.is_stop  # Filter out stop words
        and len(token.text) > 2  # Filter out very short words
    ]
    
    # Remove duplicates while preserving order
    seen = set()
    keywords = [x for x in keywords if not (x in seen or seen.add(x))]
    
    return keywords 