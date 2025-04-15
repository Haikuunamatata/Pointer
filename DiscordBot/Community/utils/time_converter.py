import re
from datetime import datetime, timedelta

class TimeConverter:
    """A utility class for converting between different time formats"""
    
    @staticmethod
    def convert_to_seconds(time_str):
        """
        Convert a time string with format like '1d2h3m4s' to seconds
        
        Parameters:
        -----------
        time_str : str
            The time string to convert
        
        Returns:
        --------
        int or None
            The time in seconds, or None if the format is invalid
        """
        if not time_str:
            return None
            
        # Define regex patterns for each time unit
        day_pattern = r'(\d+)d'
        hour_pattern = r'(\d+)h'
        minute_pattern = r'(\d+)m'
        second_pattern = r'(\d+)s'
        
        # Initialize the total seconds
        total_seconds = 0
        
        # Extract days
        day_match = re.search(day_pattern, time_str)
        if day_match:
            days = int(day_match.group(1))
            total_seconds += days * 86400  # days to seconds
        
        # Extract hours
        hour_match = re.search(hour_pattern, time_str)
        if hour_match:
            hours = int(hour_match.group(1))
            total_seconds += hours * 3600  # hours to seconds
        
        # Extract minutes
        minute_match = re.search(minute_pattern, time_str)
        if minute_match:
            minutes = int(minute_match.group(1))
            total_seconds += minutes * 60  # minutes to seconds
        
        # Extract seconds
        second_match = re.search(second_pattern, time_str)
        if second_match:
            seconds = int(second_match.group(1))
            total_seconds += seconds
        
        # If no patterns matched, return None
        if not day_match and not hour_match and not minute_match and not second_match:
            return None
        
        return total_seconds
    
    @staticmethod
    def seconds_to_dhms(seconds):
        """
        Convert seconds to a string in the format XdYhZmWs
        
        Parameters:
        -----------
        seconds : int
            The time in seconds
        
        Returns:
        --------
        str
            The formatted time string
        """
        days, remainder = divmod(seconds, 86400)
        hours, remainder = divmod(remainder, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        time_parts = []
        if days > 0:
            time_parts.append(f"{days}d")
        if hours > 0:
            time_parts.append(f"{hours}h")
        if minutes > 0:
            time_parts.append(f"{minutes}m")
        if seconds > 0 or not time_parts:
            time_parts.append(f"{seconds}s")
        
        return "".join(time_parts)
    
    @staticmethod
    def get_future_timestamp(seconds_from_now):
        """
        Get a timestamp for a time in the future
        
        Parameters:
        -----------
        seconds_from_now : int
            The number of seconds from now
        
        Returns:
        --------
        float
            The timestamp for the future time
        """
        return (datetime.now() + timedelta(seconds=seconds_from_now)).timestamp()
    
    @staticmethod
    def time_until(timestamp):
        """
        Get the time until a timestamp in seconds
        
        Parameters:
        -----------
        timestamp : float
            The target timestamp
        
        Returns:
        --------
        int
            The number of seconds until the timestamp
        """
        now = datetime.now().timestamp()
        return max(0, int(timestamp - now))
    
    @staticmethod
    def format_time_until(timestamp):
        """
        Format the time until a timestamp in human-readable format
        
        Parameters:
        -----------
        timestamp : float
            The target timestamp
        
        Returns:
        --------
        str
            The formatted time string
        """
        seconds_until = TimeConverter.time_until(timestamp)
        return TimeConverter.seconds_to_dhms(seconds_until)
    
    @staticmethod
    def format_timestamp(timestamp, format_str="%Y-%m-%d %H:%M:%S"):
        """
        Format a timestamp using the given format string
        
        Parameters:
        -----------
        timestamp : float
            The timestamp to format
        format_str : str, optional
            The format string to use
        
        Returns:
        --------
        str
            The formatted timestamp
        """
        dt = datetime.fromtimestamp(timestamp)
        return dt.strftime(format_str)
    
    @staticmethod
    def discord_timestamp(timestamp, format_code="f"):
        """
        Format a timestamp for Discord markdown
        
        Parameters:
        -----------
        timestamp : float
            The timestamp to format
        format_code : str, optional
            The Discord timestamp format code:
            - t: Short time (e.g., 9:00 PM)
            - T: Long time (e.g., 9:00:00 PM)
            - d: Short date (e.g., 06/25/2021)
            - D: Long date (e.g., June 25, 2021)
            - f: Short date/time (default) (e.g., June 25, 2021 9:00 PM)
            - F: Long date/time (e.g., Friday, June 25, 2021 9:00 PM)
            - R: Relative time (e.g., 2 hours ago)
        
        Returns:
        --------
        str
            The Discord formatted timestamp
        """
        return f"<t:{int(timestamp)}:{format_code}>" 