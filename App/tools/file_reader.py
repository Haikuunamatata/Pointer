import os
import json
from typing import Dict, Any, Optional

def read_file(file_path: str) -> Dict[str, Any]:
    """
    Read the contents of a file and return them as a dictionary.
    
    Args:
        file_path (str): Path to the file to read
        
    Returns:
        Dict[str, Any]: Dictionary containing file content and metadata
    """
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File not found: {file_path}"
            }
        
        # Get file extension
        _, file_extension = os.path.splitext(file_path)
        file_extension = file_extension.lower()
        
        # Get file size
        file_size = os.path.getsize(file_path)
        
        # Read file based on extension
        if file_extension == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                content = json.load(f)
                file_type = "json"
        else:
            # Default to text for all other file types
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                file_type = "text"
        
        return {
            "success": True,
            "content": content,
            "metadata": {
                "path": file_path,
                "size": file_size,
                "type": file_type,
                "extension": file_extension
            }
        }
    except json.JSONDecodeError:
        # Handle invalid JSON
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "success": False,
            "error": "Invalid JSON format",
            "content": content,
            "metadata": {
                "path": file_path,
                "size": file_size,
                "type": "text",
                "extension": file_extension
            }
        }
    except UnicodeDecodeError:
        # Handle binary files
        return {
            "success": False,
            "error": "Cannot read binary file as text",
            "metadata": {
                "path": file_path,
                "size": file_size,
                "type": "binary",
                "extension": file_extension
            }
        }
    except Exception as e:
        # Handle all other exceptions
        return {
            "success": False,
            "error": str(e),
            "metadata": {
                "path": file_path
            }
        } 