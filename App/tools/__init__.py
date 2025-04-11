"""
Tools module for providing various tool functions to the AI assistant.
"""

from tools.file_reader import read_file
from tools.web_tools import web_search, fetch_webpage

__all__ = [
    'read_file',
    'web_search',
    'fetch_webpage'
] 