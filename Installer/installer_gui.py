import sys
import os
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                           QPushButton, QLabel, QProgressBar, QScrollArea, 
                           QTextEdit, QMessageBox, QFrame)
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QSize
from PyQt5.QtGui import QFont, QPalette, QColor, QIcon, QPixmap, QPainter, QPainterPath
import subprocess
import platform
from pathlib import Path
import time
import shutil
import winreg
import ctypes
from win32com.client import Dispatch

# Installer functions
def print_header(text): print(f"\n=== {text} ===")
def print_success(text): print(f"✓ {text}")
def print_error(text): print(f"× {text}")
def print_warning(text): print(f"! {text}")
def print_info(text): print(text)

def run_command(cmd, shell=True):
    """Run a command and return its output"""
    try:
        result = subprocess.run(
            cmd,
            shell=shell,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        error_msg = f"Command '{cmd}' failed with exit code {e.returncode}\n"
        if e.stdout:
            error_msg += f"stdout:\n{e.stdout}\n"
        if e.stderr:
            error_msg += f"stderr:\n{e.stderr}\n"
        raise Exception(error_msg)

def check_python():
    """Check Python version and requirements"""
    print_header("Checking Python Installation")
    
    # Check Python version
    version = sys.version_info
    min_version = (3, 8)
    
    if version < min_version:
        raise Exception(f"Python {min_version[0]}.{min_version[1]} or higher is required")
    
    print_success(f"Python {version.major}.{version.minor}.{version.micro} detected")
    
    # Check pip installation
    try:
        import pip
        print_success("pip is installed")
    except ImportError:
        raise Exception("pip is not installed")

def check_node():
    """Check Node.js installation"""
    print_header("Checking Node.js Installation")
    
    try:
        node_version = run_command("node --version")
        print_success(f"Node.js {node_version} detected")
        
        npm_version = run_command("npm --version")
        print_success(f"npm {npm_version} detected")
        
    except Exception as e:
        raise Exception("Node.js is not installed or not in PATH. Please install Node.js from https://nodejs.org/")

def install_yarn():
    """Install Yarn package manager"""
    print_header("Installing Yarn")
    
    try:
        # Check if yarn is already installed
        try:
            yarn_version = run_command("yarn --version")
            print_success(f"Yarn {yarn_version} is already installed")
            return
        except:
            pass
        
        # Install yarn globally using npm
        print_info("Installing Yarn globally...")
        run_command("npm install -g yarn")
        
        # Verify installation
        yarn_version = run_command("yarn --version")
        print_success(f"Yarn {yarn_version} installed successfully")
        
    except Exception as e:
        raise Exception(f"Failed to install Yarn: {str(e)}")

def setup_python_venv():
    """Set up Python virtual environment"""
    print_header("Setting up Python Virtual Environment")
    
    venv_path = Path("venv")
    
    # Remove existing venv if it exists
    if venv_path.exists():
        print_info("Removing existing virtual environment...")
        shutil.rmtree(venv_path)
    
    print_info("Creating new virtual environment...")
    try:
        subprocess.run([sys.executable, "-m", "venv", "venv"], check=True)
        print_success("Virtual environment created")
        
        # Install requirements
        pip_cmd = str(venv_path / "Scripts" / "pip") if platform.system() == "Windows" else str(venv_path / "bin" / "pip")
        
        if Path("backend/requirements.txt").exists():
            print_info("Installing Python dependencies...")
            subprocess.run([pip_cmd, "install", "-r", "backend/requirements.txt"], check=True)
            print_success("Python dependencies installed")
        else:
            print_warning("No requirements.txt found, skipping dependency installation")
            
    except Exception as e:
        raise Exception(f"Failed to set up virtual environment: {str(e)}")

def run_yarn_install():
    """Run yarn install to set up Node.js dependencies"""
    print_header("Installing Node.js Dependencies")
    
    try:
        if not Path("package.json").exists():
            raise Exception("package.json not found. Are you in the correct directory?")
        
        print_info("Installing dependencies with Yarn...")
        run_command("yarn install")
        print_success("Node.js dependencies installed successfully")
        
    except Exception as e:
        raise Exception(f"Failed to install Node.js dependencies: {str(e)}")

def setup_install_directory():
    """Set up the installation directory and clone the repository"""
    print_header("Setting up Installation Directory")
    
    install_path = Path("C:/ProgramData/Pointer")
    
    try:
        # Check if directory exists
        if install_path.exists():
            print_info("Cleaning existing installation directory...")
            try:
                # First try to remove any existing Git processes
                if (install_path / ".git").exists():
                    try:
                        run_command("git gc")  # Clean up any loose objects
                        run_command("git prune")  # Remove all unreachable objects
                    except Exception as git_e:
                        print_warning(f"Git cleanup failed: {str(git_e)}")
                
                # Force remove read-only attributes if on Windows
                if platform.system() == "Windows":
                    try:
                        run_command(f'attrib -r -h -s "{install_path}\\*.*" /s /d')
                    except Exception as attr_e:
                        print_warning(f"Failed to remove file attributes: {str(attr_e)}")
                
                # List directory contents before removal
                try:
                    dir_contents = list(install_path.glob('*'))
                    print_info(f"Directory contents: {[str(p.name) for p in dir_contents]}")
                except Exception as list_e:
                    print_warning(f"Failed to list directory contents: {str(list_e)}")
                
                # Remove directory with error handling
                try:
                    shutil.rmtree(install_path, ignore_errors=False)  # Changed to False to get error details
                except Exception as rm_e:
                    print_warning(f"Standard cleanup failed: {str(rm_e)}")
                    print_warning("This error often occurs when files are in use by other programs.")
                    print_warning("Please close any applications that might be using files in C:/ProgramData/Pointer")
                    print_warning("Common programs to check: VS Code, Terminal windows, Node.js processes, Git")
                    
                    # If shutil.rmtree fails, try using system commands
                    if platform.system() == "Windows":
                        try:
                            run_command(f'rd /s /q "{install_path}"')
                        except Exception as rd_e:
                            print_error(f"System cleanup failed: {str(rd_e)}")
                            raise Exception(f"Could not remove directory. Files may be in use.\n\nError details:\n- {str(rm_e)}\n\nPlease:\n1. Close any programs that might be using files in C:/ProgramData/Pointer\n2. Check for running processes (Node.js, Git, VS Code, Terminals)\n3. Try running the installer again")
                    else:
                        run_command(f'rm -rf "{install_path}"')
                
                # Verify directory is gone
                if install_path.exists():
                    remaining = list(install_path.glob('*'))
                    raise Exception(f"Failed to remove existing directory. Files may be in use.\n\nRemaining contents: {[str(p.name) for p in remaining]}\n\nPlease:\n1. Close any programs that might be using these files\n2. Check for running processes (Node.js, Git, VS Code, Terminals)\n3. Try running the installer again")
                    
                print_success("Existing directory cleaned")
            except Exception as e:
                print_error(f"Failed to clean directory: {str(e)}")
                raise
        
        # Wait a moment before creating new directory
        time.sleep(1)
        
        print_info("Creating installation directory...")
        install_path.mkdir(parents=True, exist_ok=True)
        print_success("Installation directory created")
        
        # Change to installation directory
        os.chdir(install_path)
        print_success(f"Changed working directory to {install_path}")
        
        # Clone repository
        print_info("Cloning Pointer repository...")
        run_command("git clone https://github.com/f1shyondrugs/Pointer.git .")
        print_success("Repository cloned successfully")
        
        # Wait and verify repository contents
        max_attempts = 10
        attempt = 0
        while attempt < max_attempts:
            if (install_path / "App").exists() and (install_path / "App" / "package.json").exists():
                print_success("Repository contents verified")
                break
            print_info("Waiting for repository contents to be ready...")
            time.sleep(2)
            attempt += 1
        
        if attempt >= max_attempts:
            raise Exception("Timeout waiting for repository contents")
        
        # Change to App directory where package.json is located
        os.chdir(install_path / "App")
        print_success("Changed to App directory")
        
    except Exception as e:
        raise Exception(f"Failed to set up installation directory: {str(e)}")

def setup_windows_integration():
    """Set up Windows integration for Pointer"""
    print_header("Setting up Windows Integration")
    
    try:
        # Create Start Menu shortcut
        print_info("Creating Start Menu shortcut...")
        shell = Dispatch('WScript.Shell')
        start_menu = shell.SpecialFolders("Programs")
        shortcut = shell.CreateShortCut(os.path.join(start_menu, "Pointer.lnk"))
        shortcut.TargetPath = str(Path("C:/ProgramData/Pointer/App/start.bat"))
        shortcut.WorkingDirectory = str(Path("C:/ProgramData/Pointer/App"))
        shortcut.IconLocation = str(Path("C:/ProgramData/Pointer/App/pointer.ico"))
        shortcut.Save()
        print_success("Created Start Menu shortcut")
        
        # Add backend services to Windows startup
        print_info("Adding backend services to startup...")
        startup_folder = shell.SpecialFolders("Startup")
        backend_shortcut = shell.CreateShortCut(os.path.join(startup_folder, "Pointer Backend.lnk"))
        backend_shortcut.TargetPath = str(Path("C:/ProgramData/Pointer/App/start_backend.bat"))
        backend_shortcut.WorkingDirectory = str(Path("C:/ProgramData/Pointer/App"))
        backend_shortcut.IconLocation = str(Path("C:/ProgramData/Pointer/App/pointer.ico"))
        backend_shortcut.WindowStyle = 7  # Minimized
        backend_shortcut.Save()
        print_success("Added backend services to startup")
        
        # Register in Windows Registry using an elevated PowerShell command
        print_info("Registering application in Windows Registry...")
        try:
            # Prepare the registry commands
            reg_commands = [
                f'New-Item -Path "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths" -Name "Pointer.exe" -Force',
                f'Set-ItemProperty -Path "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Pointer.exe" -Name "(Default)" -Value "{str(Path("C:/ProgramData/Pointer/App/start.bat"))}"',
                f'Set-ItemProperty -Path "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Pointer.exe" -Name "Path" -Value "{str(Path("C:/ProgramData/Pointer/App"))}"'
            ]
            
            # Create a temporary script file
            script_path = Path("register_app.ps1")
            script_content = "\n".join(reg_commands)
            script_path.write_text(script_content, encoding='utf-16')
            
            try:
                # Execute the script with admin privileges
                process = subprocess.run([
                    "powershell.exe",
                    "Start-Process",
                    "powershell.exe",
                    "-Verb", "RunAs",
                    "-WindowStyle", "Hidden",
                    "-Wait",
                    "-ArgumentList",
                    f'-ExecutionPolicy Bypass -File "{script_path.absolute()}"'
                ], capture_output=True, text=True, encoding='utf-8')
                
                if process.returncode == 0:
                    print_success("Registered in Windows Registry")
                    return True
                else:
                    error_msg = process.stderr.strip() if process.stderr else "Unknown error"
                    print_error(f"Failed to register in Windows Registry: {error_msg}")
                    return False
                
            finally:
                # Clean up the temporary script
                if script_path.exists():
                    script_path.unlink()
            
        except Exception as reg_e:
            print_error(f"Failed to register in Windows Registry: {str(reg_e)}")
            return False
        
    except Exception as e:
        raise Exception(f"Failed to set up Windows integration: {str(e)}")

def create_startup_batch():
    """Create the startup batch file"""
    print_header("Creating Startup Scripts")
    
    batch_path = Path("C:/ProgramData/Pointer/App/start_backend.bat")
    start_path = Path("C:/ProgramData/Pointer/App/start.bat")
    
    try:
        # Create backend batch file content with window title
        batch_content = """@echo off
title Pointer Backend Services
start /B /min cmd /c "cd /d C:\\ProgramData\\Pointer\\App && yarn dev:server"
start /B /min cmd /c "cd /d C:\\ProgramData\\Pointer\\App\\backend && python run.py"
exit
"""
        
        # Create start batch file content for Electron with window title
        start_content = """@echo off
title Pointer
start /B /min cmd /c "cd /d C:\\ProgramData\\Pointer\\App && yarn run electron:start"
exit
"""
        
        # Write batch files
        batch_path.write_text(batch_content, encoding='utf-8')
        print_success("Created backend startup batch file")
        
        start_path.write_text(start_content, encoding='utf-8')
        print_success("Created Electron start batch file")
        
        # Make the batch files executable
        if platform.system() == "Windows":
            run_command(f'attrib +x "{batch_path}"')
            run_command(f'attrib +x "{start_path}"')
        else:
            run_command(f'chmod +x "{batch_path}"')
            run_command(f'chmod +x "{start_path}"')
        print_success("Made startup batch files executable")
        
        # Run the backend batch file silently
        print_info("Starting backend services...")
        subprocess.Popen([batch_path], creationflags=subprocess.CREATE_NO_WINDOW)
        print_success("Backend services started")
        
    except Exception as e:
        raise Exception(f"Failed to create startup batch files: {str(e)}")

# Modern style constants
BACKGROUND_COLOR = "#000000"
CARD_COLOR = "#1A1A1A"
ACCENT_COLOR = "#0078FF"
TEXT_COLOR = "#FFFFFF"
BUTTON_HOVER = "#0069E0"
FONT_FAMILY = "Segoe UI" if platform.system() == "Windows" else "SF Pro Display"

def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller"""
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    
    return os.path.join(base_path, relative_path)

class LogoLabel(QLabel):
    def __init__(self, size=40):
        super().__init__()
        self.size = size
        self.setFixedSize(size, size)
    
    def load_png(self, png_path=None):
        if png_path:
            # Get the correct path whether running from source or PyInstaller executable
            resource_path = get_resource_path(png_path)
            if os.path.exists(resource_path):
                pixmap = QPixmap(resource_path)
            else:
                pixmap = self.create_default_icon()
        else:
            pixmap = self.create_default_icon()
        
        # Scale the pixmap to the desired size
        scaled_pixmap = pixmap.scaled(self.size, self.size, Qt.KeepAspectRatio, Qt.SmoothTransformation)
        self.setPixmap(scaled_pixmap)
    
    def create_default_icon(self):
        """Create a default icon if PNG is not found"""
        pixmap = QPixmap(self.size, self.size)
        pixmap.fill(Qt.transparent)
        
        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.Antialiasing)
        
        # Draw circle
        painter.setBrush(QColor(ACCENT_COLOR))
        painter.setPen(Qt.NoPen)
        painter.drawEllipse(4, 4, self.size-8, self.size-8)
        
        # Draw line
        painter.setBrush(QColor(TEXT_COLOR))
        line_width = (self.size-8) * 0.6
        line_height = (self.size-8) * 0.2
        line_x = (self.size - line_width) // 2
        line_y = (self.size - line_height) // 2
        painter.drawRect(int(line_x), int(line_y), int(line_width), int(line_height))
        
        painter.end()
        return pixmap

class ModernProgressBar(QProgressBar):
    def __init__(self):
        super().__init__()
        self.setStyleSheet(f"""
            QProgressBar {{
                background-color: {CARD_COLOR};
                border-radius: 7px;
                text-align: center;
                color: {TEXT_COLOR};
                font-weight: bold;
            }}
            QProgressBar::chunk {{
                background-color: {ACCENT_COLOR};
                border-radius: 7px;
            }}
        """)
        self.setFixedHeight(14)

class ModernButton(QPushButton):
    def __init__(self, text):
        super().__init__(text)
        self.setStyleSheet(f"""
            QPushButton {{
                background-color: {ACCENT_COLOR};
                color: {TEXT_COLOR};
                border: none;
                border-radius: 4px;
                padding: 0px;
                font-weight: bold;
                font-size: 14px;
                min-height: 36px;
            }}
            QPushButton:hover {{
                background-color: {BUTTON_HOVER};
            }}
            QPushButton:pressed {{
                background-color: {ACCENT_COLOR};
            }}
            QPushButton:disabled {{
                background-color: #4A4A4A;
                color: #8E8E8E;
            }}
        """)

class ModernCard(QFrame):
    def __init__(self):
        super().__init__()
        self.setStyleSheet(f"""
            QFrame {{
                background-color: {CARD_COLOR};
                border-radius: 8px;
                padding: 0px;
            }}
        """)

class InstallerThread(QThread):
    progress = pyqtSignal(str, str)  # (message, type)
    step_completed = pyqtSignal(int)  # step number
    finished = pyqtSignal(bool, str)  # (success, message)
    
    def __init__(self):
        super().__init__()
        self.steps_total = 8 if platform.system() == "Windows" else 7  # Added step for Windows integration
        self.current_step = 0
    
    def emit_progress(self, message, type="info"):
        self.progress.emit(message, type)
        
    def next_step(self):
        self.current_step += 1
        self.step_completed.emit(self.current_step)
    
    def run(self):
        try:
            # Override print functions to emit signals
            def print_header(text):
                self.emit_progress(f"\n=== {text} ===", "header")
            
            def print_success(text):
                self.emit_progress(f"✓ {text}", "success")
            
            def print_error(text):
                self.emit_progress(f"× {text}", "error")
            
            def print_warning(text):
                self.emit_progress(f"! {text}", "warning")
            
            def print_info(text):
                self.emit_progress(text, "info")
            
            # Store original print functions
            original_print_header = globals()['print_header']
            original_print_success = globals()['print_success']
            original_print_error = globals()['print_error']
            original_print_warning = globals()['print_warning']
            original_print_info = globals()['print_info']
            
            # Override global print functions
            globals()['print_header'] = print_header
            globals()['print_success'] = print_success
            globals()['print_error'] = print_error
            globals()['print_warning'] = print_warning
            globals()['print_info'] = print_info
            
            try:
                # Run installation steps
                setup_install_directory()  # New first step
                self.next_step()
                
                check_python()
                self.next_step()
                
                check_node()
                self.next_step()
                
                install_yarn()
                self.next_step()
                
                setup_python_venv()
                self.next_step()
                
                run_yarn_install()
                self.next_step()
                
                create_startup_batch()  # Create startup batch file
                self.next_step()
                
                if platform.system() == "Windows":
                    setup_windows_integration()  # Set up Windows integration
                    self.next_step()
                
                # Change directory to the App folder
                app_path = Path("C:/ProgramData/Pointer/App")
                os.chdir(app_path)
                print_success("Changed working directory to App folder")
                
                success_msg = """
Installation completed successfully! 🎉

Pointer has been installed to C:/ProgramData/Pointer
Current working directory is set to C:/ProgramData/Pointer/App

The backend services have been started automatically.

To start the application again later:
1. Run start_backend.bat to start the backend services
2. Run start.bat to launch the Electron app

Both batch files are located at:
C:/ProgramData/Pointer/App/
"""
                self.finished.emit(True, success_msg)
                
            finally:
                # Restore original print functions
                globals()['print_header'] = original_print_header
                globals()['print_success'] = original_print_success
                globals()['print_error'] = original_print_error
                globals()['print_warning'] = original_print_warning
                globals()['print_info'] = original_print_info
            
        except Exception as e:
            error_msg = f"""
Error during installation:

{str(e)}

Common solutions:
1. Close any programs that might be using files in C:/ProgramData/Pointer:
   - VS Code or other editors
   - Terminal windows
   - Node.js processes
   - Git processes
   - The Pointer application itself

2. If the error persists:
   - Make sure you have administrative privileges
   - Check if Git is installed and in your PATH
   - Ensure you have internet access
   - Run the installer again

3. If problems continue, install Node.js and Yarn manually:
   - Node.js: https://nodejs.org/
   - Yarn: https://yarnpkg.com/getting-started/install
"""
            self.finished.emit(False, error_msg)

class InstallerWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Pointer App Installer")
        self.setStyleSheet(f"""
            QMainWindow {{
                background-color: {BACKGROUND_COLOR};
            }}
            QLabel {{
                color: {TEXT_COLOR};
            }}
        """)
        
        # Create main widget and layout
        self.main_widget = QWidget()
        self.setCentralWidget(self.main_widget)
        self.main_layout = QVBoxLayout(self.main_widget)
        self.main_layout.setSpacing(8)
        self.main_layout.setContentsMargins(8, 8, 8, 8)
        
        # Initial minimal view
        self.setup_minimal_view()
        
        # Prepare expanded view widgets
        self.setup_expanded_view()
        
        # Set up installer thread
        self.installer_thread = InstallerThread()
        self.installer_thread.progress.connect(self.update_log)
        self.installer_thread.step_completed.connect(self.progress_bar.setValue)
        self.installer_thread.finished.connect(self.installation_finished)
        
        # Color definitions for different message types
        self.colors = {
            "header": ACCENT_COLOR,
            "success": "#34C759",
            "error": "#FF3B30",
            "warning": "#FFD60A",
            "info": TEXT_COLOR
        }
        
        # Set window size
        self.setFixedSize(400, 140)

    def setup_minimal_view(self):
        # Logo and title card
        self.header_card = ModernCard()
        header_layout = QHBoxLayout(self.header_card)
        header_layout.setSpacing(12)
        header_layout.setContentsMargins(16, 16, 16, 16)
        
        # Logo
        logo = LogoLabel(40)
        logo.load_png("pointer.png")  # Just use the filename, get_resource_path will handle the rest
        header_layout.addWidget(logo)
        
        # Title
        title_layout = QVBoxLayout()
        title = QLabel("Pointer")
        title.setFont(QFont(FONT_FAMILY, 16, QFont.Bold))
        title.setStyleSheet(f"color: {TEXT_COLOR};")
        subtitle = QLabel("Installation Wizard")
        subtitle.setFont(QFont(FONT_FAMILY, 10))
        subtitle.setStyleSheet("color: #8E8E8E;")
        title_layout.addWidget(title)
        title_layout.addWidget(subtitle)
        title_layout.setSpacing(0)
        header_layout.addLayout(title_layout)
        header_layout.addStretch()
        
        self.main_layout.addWidget(self.header_card)
        
        # Install button
        self.install_button = ModernButton("Install")
        self.install_button.clicked.connect(self.start_installation)
        self.main_layout.addWidget(self.install_button)

    def setup_expanded_view(self):
        # Progress card
        self.progress_card = ModernCard()
        progress_layout = QVBoxLayout(self.progress_card)
        
        # Progress label
        progress_label = QLabel("Installation Progress")
        progress_label.setFont(QFont(FONT_FAMILY, 12, QFont.Bold))
        progress_layout.addWidget(progress_label)
        
        # Progress bar
        self.progress_bar = ModernProgressBar()
        self.progress_bar.setMaximum(7)
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setFormat("%v of %m steps completed")
        progress_layout.addWidget(self.progress_bar)
        
        # Log card
        self.log_card = ModernCard()
        log_layout = QVBoxLayout(self.log_card)
        
        # Log label
        log_label = QLabel("Installation Log")
        log_label.setFont(QFont(FONT_FAMILY, 12, QFont.Bold))
        log_layout.addWidget(log_label)
        
        # Log area
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        self.log_area.setMinimumHeight(250)
        self.log_area.setStyleSheet(f"""
            QTextEdit {{
                background-color: #1E1E1E;
                color: {TEXT_COLOR};
                border: none;
                border-radius: 8px;
                padding: 12px;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 13px;
                selection-background-color: {ACCENT_COLOR};
            }}
            QScrollBar:vertical {{
                border: none;
                background-color: {CARD_COLOR};
                width: 14px;
                margin: 0px;
                border-radius: 7px;
            }}
            QScrollBar::handle:vertical {{
                background-color: #4A4A4A;
                min-height: 30px;
                border-radius: 7px;
            }}
            QScrollBar::handle:vertical:hover {{
                background-color: #5A5A5A;
            }}
            QScrollBar::sub-line:vertical, QScrollBar::add-line:vertical {{
                height: 0px;
            }}
        """)
        log_layout.addWidget(self.log_area)

    def adjust_size_minimal(self):
        self.setFixedSize(500, 160)  # Adjusted from 700, 200
        
    def adjust_size_expanded(self):
        self.setFixedSize(500, 600)  # Adjusted from 700, 700
    
    def start_installation(self):
        # Remove the stretch from the bottom
        self.main_layout.removeItem(self.main_layout.itemAt(self.main_layout.count() - 1))
        
        # Add progress and log cards
        self.main_layout.addWidget(self.progress_card)
        self.main_layout.addWidget(self.log_card)
        
        # Adjust window size
        self.adjust_size_expanded()
        
        # Start installation
        self.install_button.setEnabled(False)
        self.install_button.setText("Installing...")
        self.log_area.clear()
        self.progress_bar.setValue(0)
        self.installer_thread.start()
    
    def update_log(self, message, type):
        color = self.colors.get(type, TEXT_COLOR)
        self.log_area.append(f'<span style="color: {color}">{message}</span>')
        scrollbar = self.log_area.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
    
    def installation_finished(self, success, message):
        self.install_button.setEnabled(True)
        self.install_button.setText("Install")
        
        msg = QMessageBox(self)
        msg.setWindowTitle("Installation Complete" if success else "Installation Failed")
        msg.setText(message)
        msg.setStyleSheet(f"""
            QMessageBox {{
                background-color: {CARD_COLOR};
                color: {TEXT_COLOR};
            }}
            QMessageBox QLabel {{
                color: {TEXT_COLOR};
                min-width: 400px;
            }}
            QPushButton {{
                background-color: {ACCENT_COLOR};
                color: {TEXT_COLOR};
                border: none;
                border-radius: 6px;
                padding: 8px 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: {BUTTON_HOVER};
            }}
        """)
        msg.setIcon(QMessageBox.Information if success else QMessageBox.Warning)
        msg.exec_()

def main():
    app = QApplication(sys.argv)
    
    # Enable high DPI scaling
    app.setAttribute(Qt.AA_EnableHighDpiScaling)
    app.setAttribute(Qt.AA_UseHighDpiPixmaps)
    
    window = InstallerWindow()
    window.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main() 