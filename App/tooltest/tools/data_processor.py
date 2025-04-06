import json
import re
import base64
import hashlib
from typing import Dict, Any, List, Optional, Union
import datetime

def format_json(json_string: str, indent: int = 2) -> Dict[str, Any]:
    """
    Format and validate a JSON string
    """
    try:
        # Parse JSON string
        parsed_json = json.loads(json_string)
        
        # Format with indentation
        formatted_json = json.dumps(parsed_json, indent=indent)
        
        return {
            "valid": True,
            "formatted": formatted_json,
            "type": "object" if isinstance(parsed_json, dict) else "array" if isinstance(parsed_json, list) else "value"
        }
    except json.JSONDecodeError as e:
        return {
            "valid": False,
            "error": str(e),
            "error_position": e.pos,
            "error_line": e.lineno,
            "error_column": e.colno
        }

def transform_data(data: str, from_format: str, to_format: str) -> Dict[str, Any]:
    """
    Transform data between different formats
    Supported formats: json, csv (simple), yaml (basic)
    """
    try:
        # Parse input data based on from_format
        parsed_data = None
        
        if from_format.lower() == "json":
            parsed_data = json.loads(data)
        elif from_format.lower() == "csv":
            # Simple CSV parser
            lines = [line.strip() for line in data.strip().split('\n')]
            if not lines:
                return {"error": "Empty CSV data"}
            
            headers = [h.strip() for h in lines[0].split(',')]
            result = []
            
            for line in lines[1:]:
                values = [v.strip() for v in line.split(',')]
                row = {}
                for i, header in enumerate(headers):
                    if i < len(values):
                        row[header] = values[i]
                result.append(row)
            
            parsed_data = result
        else:
            return {"error": f"Unsupported 'from' format: {from_format}"}
        
        # Convert to output format
        if to_format.lower() == "json":
            return {
                "result": json.dumps(parsed_data, indent=2),
                "format": "json"
            }
        elif to_format.lower() == "csv":
            if not isinstance(parsed_data, list):
                return {"error": "Can only convert list of objects to CSV"}
            
            # Get all possible headers
            headers = set()
            for item in parsed_data:
                if isinstance(item, dict):
                    headers.update(item.keys())
            
            headers = sorted(list(headers))
            csv_lines = [','.join(headers)]
            
            for item in parsed_data:
                if isinstance(item, dict):
                    values = [str(item.get(h, '')) for h in headers]
                    csv_lines.append(','.join(values))
            
            return {
                "result": '\n'.join(csv_lines),
                "format": "csv"
            }
        else:
            return {"error": f"Unsupported 'to' format: {to_format}"}
    
    except Exception as e:
        return {"error": f"Error transforming data: {str(e)}"}

def encode_decode(text: str, operation: str, encoding: str = "base64") -> Dict[str, Any]:
    """
    Encode or decode text using various algorithms
    """
    try:
        result = None
        
        if encoding.lower() == "base64":
            if operation.lower() == "encode":
                # Convert string to bytes and encode
                result = base64.b64encode(text.encode('utf-8')).decode('utf-8')
            elif operation.lower() == "decode":
                # Decode base64 to bytes and convert to string
                result = base64.b64decode(text.encode('utf-8')).decode('utf-8')
            else:
                return {"error": f"Unsupported operation: {operation}"}
        
        elif encoding.lower() == "url":
            import urllib.parse
            if operation.lower() == "encode":
                result = urllib.parse.quote(text)
            elif operation.lower() == "decode":
                result = urllib.parse.unquote(text)
            else:
                return {"error": f"Unsupported operation: {operation}"}
        
        elif encoding.lower() == "hex":
            if operation.lower() == "encode":
                result = text.encode('utf-8').hex()
            elif operation.lower() == "decode":
                result = bytes.fromhex(text).decode('utf-8')
            else:
                return {"error": f"Unsupported operation: {operation}"}
        
        else:
            return {"error": f"Unsupported encoding: {encoding}"}
        
        return {
            "original": text,
            "result": result,
            "operation": operation,
            "encoding": encoding
        }
    
    except Exception as e:
        return {"error": f"Error in {operation}: {str(e)}"}

def calculate_hash(text: str, algorithm: str = "sha256") -> Dict[str, Any]:
    """
    Calculate hash of text using various algorithms
    """
    try:
        result = None
        
        if algorithm.lower() == "md5":
            result = hashlib.md5(text.encode('utf-8')).hexdigest()
        elif algorithm.lower() == "sha1":
            result = hashlib.sha1(text.encode('utf-8')).hexdigest()
        elif algorithm.lower() == "sha256":
            result = hashlib.sha256(text.encode('utf-8')).hexdigest()
        elif algorithm.lower() == "sha512":
            result = hashlib.sha512(text.encode('utf-8')).hexdigest()
        else:
            return {"error": f"Unsupported hash algorithm: {algorithm}"}
        
        return {
            "text": text,
            "hash": result,
            "algorithm": algorithm
        }
    
    except Exception as e:
        return {"error": f"Error calculating hash: {str(e)}"}

def format_datetime(format_string: str = "%Y-%m-%d %H:%M:%S", timestamp: Optional[float] = None) -> Dict[str, Any]:
    """
    Format current datetime or from timestamp
    """
    try:
        dt = datetime.datetime.fromtimestamp(timestamp) if timestamp else datetime.datetime.now()
        
        formatted = dt.strftime(format_string)
        
        return {
            "formatted": formatted,
            "format": format_string,
            "timestamp": dt.timestamp(),
            "iso8601": dt.isoformat()
        }
    
    except Exception as e:
        return {"error": f"Error formatting datetime: {str(e)}"} 