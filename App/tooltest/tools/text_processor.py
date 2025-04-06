import os
import re
from typing import Dict, Any, List, Optional

def count_words(text: str) -> int:
    """Count the number of words in a text."""
    words = re.findall(r'\b\w+\b', text.lower())
    return len(words)

def get_word_frequency(text: str, top_n: int = 5) -> Dict[str, int]:
    """Get the frequency of words in a text."""
    words = re.findall(r'\b\w+\b', text.lower())
    word_freq = {}
    
    for word in words:
        if len(word) > 2:  # Ignore very short words
            word_freq[word] = word_freq.get(word, 0) + 1
    
    # Sort by frequency and return top N
    sorted_freq = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    return dict(sorted_freq[:top_n])

def get_sentiment(text: str) -> str:
    """
    Very basic sentiment analysis
    Returns: "positive", "negative", or "neutral"
    """
    positive_words = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'happy', 'love', 'best']
    negative_words = ['bad', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'sad', 'poor']
    
    text_lower = text.lower()
    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)
    
    if positive_count > negative_count:
        return "positive"
    elif negative_count > positive_count:
        return "negative"
    else:
        return "neutral"

def analyze_text(text_content: str, analysis_type: str = "all", top_n: int = 5) -> Dict[str, Any]:
    """
    Analyze text based on the specified analysis type
    """
    result = {}
    
    if analysis_type in ["word_count", "all"]:
        result["word_count"] = count_words(text_content)
    
    if analysis_type in ["word_frequency", "all"]:
        result["word_frequency"] = get_word_frequency(text_content, top_n)
    
    if analysis_type in ["sentiment", "all"]:
        result["sentiment"] = get_sentiment(text_content)
        
    if analysis_type in ["summary", "all"]:
        # Very basic summary: first 100 characters
        result["summary"] = text_content[:100] + "..." if len(text_content) > 100 else text_content
    
    return result

def analyze_file(file_path: str, analysis_type: str = "all", top_n: int = 5) -> Dict[str, Any]:
    """
    Analyze a text file
    """
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            text_content = f.read()
        
        result = analyze_text(text_content, analysis_type, top_n)
        result["file_path"] = file_path
        result["file_size_bytes"] = os.path.getsize(file_path)
        
        return result
    except Exception as e:
        return {"error": f"Error analyzing file: {str(e)}"} 