import os
import json
import csv
from typing import Dict, Any, List, Optional, Union

def read_text_file(file_path: str, start_line: int = 0, max_lines: int = None) -> Dict[str, Any]:
    """
    Read a text file and return its contents
    """
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        total_lines = len(lines)
        
        if start_line >= total_lines:
            return {"error": f"Start line {start_line} is beyond the file length ({total_lines} lines)"}
        
        end_line = total_lines if max_lines is None else min(start_line + max_lines, total_lines)
        content = ''.join(lines[start_line:end_line])
        
        return {
            "file_path": file_path,
            "content": content,
            "start_line": start_line,
            "end_line": end_line - 1,
            "total_lines": total_lines,
            "bytes_read": len(content)
        }
    except Exception as e:
        return {"error": f"Error reading file: {str(e)}"}

def read_csv_file(file_path: str, max_rows: int = 10) -> Dict[str, Any]:
    """
    Read a CSV file and return its contents as a list of dictionaries
    """
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    if not file_path.lower().endswith('.csv'):
        return {"error": f"File {file_path} is not a CSV file"}
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            csv_reader = csv.DictReader(f)
            rows = []
            for i, row in enumerate(csv_reader):
                if i >= max_rows:
                    break
                rows.append(dict(row))
        
        return {
            "file_path": file_path,
            "headers": list(rows[0].keys()) if rows else [],
            "rows": rows,
            "row_count": len(rows),
            "total_rows_read": min(max_rows, len(rows))
        }
    except Exception as e:
        return {"error": f"Error reading CSV file: {str(e)}"}

def read_json_file(file_path: str) -> Dict[str, Any]:
    """
    Read a JSON file and return its contents
    """
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    if not file_path.lower().endswith('.json'):
        return {"error": f"File {file_path} is not a JSON file"}
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return {
            "file_path": file_path,
            "data": data,
            "type": "object" if isinstance(data, dict) else "array" if isinstance(data, list) else "other"
        }
    except Exception as e:
        return {"error": f"Error reading JSON file: {str(e)}"}

def file_info(file_path: str) -> Dict[str, Any]:
    """
    Get information about a file
    """
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    try:
        stats = os.stat(file_path)
        
        # Determine file type based on extension
        _, extension = os.path.splitext(file_path)
        extension = extension.lower()[1:] if extension else ""
        
        return {
            "file_path": file_path,
            "size_bytes": stats.st_size,
            "last_modified": stats.st_mtime,
            "extension": extension,
            "exists": True
        }
    except Exception as e:
        return {"error": f"Error getting file info: {str(e)}"}

def list_directory(directory_path: str, pattern: str = None) -> Dict[str, Any]:
    """
    List files in a directory, optionally filtering by pattern
    """
    if not os.path.exists(directory_path):
        return {"error": f"Directory not found: {directory_path}"}
    
    if not os.path.isdir(directory_path):
        return {"error": f"{directory_path} is not a directory"}
    
    try:
        files = os.listdir(directory_path)
        
        # Filter by pattern if provided
        if pattern:
            import fnmatch
            files = [f for f in files if fnmatch.fnmatch(f.lower(), pattern.lower())]
        
        # Get file info for each item
        file_list = []
        for f in files:
            full_path = os.path.join(directory_path, f)
            is_dir = os.path.isdir(full_path)
            size = os.path.getsize(full_path) if not is_dir else 0
            
            file_list.append({
                "name": f,
                "is_directory": is_dir,
                "size_bytes": size
            })
        
        return {
            "directory": directory_path,
            "file_count": len(file_list),
            "files": file_list
        }
    except Exception as e:
        return {"error": f"Error listing directory: {str(e)}"}

def read_file(file_path: str) -> Dict[str, Any]:
    """
    Read any file and return its contents
    """
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "file_path": file_path,
            "content": content,
            "size_bytes": os.path.getsize(file_path)
        }
    except Exception as e:
        return {"error": f"Error reading file: {str(e)}"} 