import re
from datetime import datetime, timedelta
from typing import Tuple, Optional

def parse_time_string(time_string: str) -> Tuple[Optional[timedelta], str]:
    """
    Parse a time string in the format of '1m', '1h', '1d', '1w', '1mo'
    
    Args:
        time_string: A string representing a duration
        
    Returns:
        Tuple containing:
        - timedelta: The duration as a timedelta object (or None if invalid)
        - str: A human-readable string representing the duration
    """
    # Regular expression to match the time format
    time_regex = re.compile(r'^(\d+)([mhdwMo]+)$')
    match = time_regex.match(time_string)
    
    if not match:
        return None, "Invalid time format"
    
    amount = int(match.group(1))
    unit = match.group(2)
    
    # Convert the time to seconds
    if unit == 'm':
        seconds = amount * 60
        human_readable = f"{amount} minute{'s' if amount != 1 else ''}"
    elif unit == 'h':
        seconds = amount * 3600
        human_readable = f"{amount} hour{'s' if amount != 1 else ''}"
    elif unit == 'd':
        seconds = amount * 86400
        human_readable = f"{amount} day{'s' if amount != 1 else ''}"
    elif unit == 'w':
        seconds = amount * 604800
        human_readable = f"{amount} week{'s' if amount != 1 else ''}"
    elif unit in ['mo', 'M']:
        seconds = amount * 2592000  # Approximately 30 days
        human_readable = f"{amount} month{'s' if amount != 1 else ''}"
    else:
        return None, "Invalid time unit"
    
    return timedelta(seconds=seconds), human_readable

def get_future_timestamp(duration: timedelta) -> int:
    """
    Get a timestamp for a future point in time based on the current time plus the duration.
    
    Args:
        duration: A timedelta object representing the duration
        
    Returns:
        int: Unix timestamp for the future time
    """
    future_time = datetime.now() + duration
    return int(future_time.timestamp())

def get_formatted_timestamp(timestamp: int, style: str = 'R') -> str:
    """
    Format a timestamp for Discord's timestamp display.
    
    Args:
        timestamp: Unix timestamp
        style: Discord timestamp style
               'R' for relative time (e.g. "in 2 days")
               'F' for full date and time
               'D' for date only
               'T' for time only
    
    Returns:
        str: Formatted Discord timestamp
    """
    return f"<t:{timestamp}:{style}>" 