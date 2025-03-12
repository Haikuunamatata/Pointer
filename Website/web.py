from flask import Flask, render_template, request, send_from_directory
from user_agents import parse
import os

app = Flask(__name__)

DOWNLOADS = {
    'windows': {
        'filename': 'pointer-windows.exe',
        'display_name': 'Pointer for Windows',
        'icon': 'fa-windows'
    },
    'macos': {
        'filename': 'pointer-macos.dmg',
        'display_name': 'Pointer for macOS',
        'icon': 'fa-apple'
    },
    'linux': {
        'filename': 'pointer-linux.AppImage',
        'display_name': 'Pointer for Linux',
        'icon': 'fa-linux'
    }
}

def detect_os(user_agent_string):
    user_agent = parse(user_agent_string)
    os_family = user_agent.os.family.lower()
    
    if 'ios' in os_family or 'iphone' in os_family or 'ipad' in os_family:
        return 'macos'
    elif 'windows' in os_family:
        return 'windows'
    elif 'mac os' in os_family or 'macos' in os_family or 'darwin' in os_family:
        return 'macos'
    elif 'android' in os_family:
        return 'linux'
    elif 'linux' in os_family or 'ubuntu' in os_family or 'debian' in os_family or 'fedora' in os_family:
        return 'linux'
    
    if user_agent.is_pc:
        if user_agent.os.family == 'Mac OS X':
            return 'macos'
        elif user_agent.os.family == 'Linux':
            return 'linux'
        else:
            return 'windows'
    elif user_agent.is_mobile:
        if user_agent.device.brand == 'Apple':
            return 'macos'
        else:
            return 'linux'
            
    return 'windows'

@app.route('/downloads')
def downloads():
    user_agent = request.headers.get('User-Agent')
    user_os = detect_os(user_agent)
    return render_template('downloads.html',
                         detected_os=user_os,
                         downloads=DOWNLOADS)

@app.route('/download/<platform>')
def download_file(platform):
    if platform not in DOWNLOADS:
        return "Invalid platform", 404
    
    filename = DOWNLOADS[platform]['filename']
    return send_from_directory('downloads', filename)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/robots.txt')
def robots():
    return send_from_directory('.', 'robots.txt')

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=5000)