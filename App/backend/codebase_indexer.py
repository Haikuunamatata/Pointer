import os
import json
import sqlite3
import hashlib
import time
import platform
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, asdict
import ast
import re
from keyword_extractor import extract_keywords


@dataclass
class FileMetadata:
    path: str
    size: int
    last_modified: float
    file_type: str
    content_hash: str
    line_count: int
    language: str
    
@dataclass
class CodeElement:
    file_path: str
    element_type: str  # 'function', 'class', 'interface', 'component', 'import', 'export'
    name: str
    line_start: int
    line_end: int
    signature: Optional[str] = None
    docstring: Optional[str] = None
    
@dataclass
class ProjectOverview:
    total_files: int
    total_lines: int
    languages: Dict[str, int]  # language -> file count
    main_directories: List[str]
    key_files: List[str]
    framework_info: Dict[str, Any]
    dependencies: List[str]


def get_app_data_path() -> Path:
    """Get the appropriate application data directory based on platform"""
    system = platform.system().lower()
    
    if system == "windows":
        # Windows: Use AppData/Roaming for user-specific settings
        base_path = os.environ.get('APPDATA', os.path.expanduser('~/AppData/Roaming'))
        return Path(base_path) / 'Pointer' / 'data'
    elif system == "darwin":  # macOS
        # macOS: Use Application Support directory - properly expand home directory
        home_dir = Path.home()
        return home_dir / 'Library' / 'Application Support' / 'Pointer' / 'data'
    else:  # Linux and other Unix-like systems
        # Linux: Use XDG data directory or fallback to home - properly expand paths
        xdg_data_home = os.environ.get('XDG_DATA_HOME')
        if xdg_data_home:
            return Path(xdg_data_home) / 'pointer' / 'data'
        else:
            home_dir = Path.home()
            return home_dir / '.local' / 'share' / 'pointer' / 'data'


class CodebaseIndexer:
    """
    Indexes a codebase to provide the AI with comprehensive project understanding from startup.
    """
    
    def __init__(self, workspace_path: str, cache_dir: str = None):
        self.workspace_path = Path(workspace_path)
        
        # Use appdata directory organized by workspace path
        if cache_dir:
            self.cache_dir = Path(cache_dir)
        else:
            app_data = get_app_data_path()
            # Create a sanitized directory name from workspace path
            workspace_hash = self._create_workspace_identifier(self.workspace_path)
            self.cache_dir = app_data / "codebase_indexes" / workspace_hash
        
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.cache_dir / "codebase_index.db"
        self.init_database()
        
        # File type mappings
        self.language_map = {
            '.py': 'python', '.js': 'javascript', '.ts': 'typescript', 
            '.tsx': 'typescriptreact', '.jsx': 'javascriptreact',
            '.java': 'java', '.cpp': 'cpp', '.c': 'c', '.cs': 'csharp',
            '.go': 'go', '.rs': 'rust', '.php': 'php', '.rb': 'ruby',
            '.html': 'html', '.css': 'css', '.scss': 'scss', '.sass': 'sass',
            '.json': 'json', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
            '.md': 'markdown', '.txt': 'text', '.sh': 'shell',
            '.sql': 'sql', '.dockerfile': 'dockerfile'
        }
        
        # Ignore patterns
        self.ignore_patterns = {
            'node_modules', '.git', '__pycache__', '.DS_Store', 
            'dist', 'build', 'coverage', '.next', '.nuxt',
            'vendor', 'target', 'bin', 'obj', '.pointer_cache'
        }
        
    def _create_workspace_identifier(self, workspace_path: Path) -> str:
        """
        Create a unique, filesystem-safe identifier for the workspace.
        Combines sanitized path with hash for uniqueness.
        """
        # Get the absolute path
        abs_path = workspace_path.resolve()
        
        # Create a readable name from the last part of the path
        workspace_name = abs_path.name or "root"
        
        # Sanitize the name for filesystem use
        import string
        valid_chars = f"-_.() {string.ascii_letters}{string.digits}"
        sanitized_name = ''.join(c for c in workspace_name if c in valid_chars)
        sanitized_name = sanitized_name.strip()
        if not sanitized_name:
            sanitized_name = "workspace"
        
        # Create a hash of the full path for uniqueness
        path_hash = hashlib.md5(str(abs_path).encode('utf-8')).hexdigest()[:8]
        
        # Combine sanitized name with hash
        return f"{sanitized_name}_{path_hash}"
    
    def init_database(self):
        """Initialize SQLite database for caching indexed data."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS file_metadata (
                    path TEXT PRIMARY KEY,
                    size INTEGER,
                    last_modified REAL,
                    file_type TEXT,
                    content_hash TEXT,
                    line_count INTEGER,
                    language TEXT,
                    indexed_at REAL
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS code_elements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT,
                    element_type TEXT,
                    name TEXT,
                    line_start INTEGER,
                    line_end INTEGER,
                    signature TEXT,
                    docstring TEXT,
                    FOREIGN KEY (file_path) REFERENCES file_metadata(path)
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS project_overview (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at REAL
                )
            ''')
            
            # Store workspace information
            conn.execute('''
                CREATE TABLE IF NOT EXISTS workspace_info (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at REAL
                )
            ''')
            
            # Store workspace path and cache location
            conn.execute('''
                INSERT OR REPLACE INTO workspace_info (key, value, updated_at)
                VALUES (?, ?, ?)
            ''', ('workspace_path', str(self.workspace_path.resolve()), time.time()))
            
            conn.execute('''
                INSERT OR REPLACE INTO workspace_info (key, value, updated_at)
                VALUES (?, ?, ?)
            ''', ('cache_location', str(self.cache_dir), time.time()))
            
            # Create indexes for better query performance
            conn.execute('CREATE INDEX IF NOT EXISTS idx_code_elements_file ON code_elements(file_path)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_code_elements_name ON code_elements(name)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_code_elements_type ON code_elements(element_type)')
    
    def should_ignore_path(self, path: Path) -> bool:
        """Check if a path should be ignored during indexing."""
        for part in path.parts:
            if part in self.ignore_patterns or part.startswith('.'):
                return True
        return False
    
    def get_file_language(self, file_path: Path) -> str:
        """Determine the programming language of a file."""
        suffix = file_path.suffix.lower()
        return self.language_map.get(suffix, 'unknown')
    
    def calculate_content_hash(self, content: str) -> str:
        """Calculate MD5 hash of file content."""
        return hashlib.md5(content.encode('utf-8')).hexdigest()
    
    def is_file_changed(self, file_path: Path) -> bool:
        """Check if file has changed since last indexing."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute(
                    'SELECT last_modified, content_hash FROM file_metadata WHERE path = ?',
                    (str(file_path.relative_to(self.workspace_path)),)
                )
                result = cursor.fetchone()
                
                if not result:
                    return True  # File not in index
                
                stored_mtime, stored_hash = result
                current_mtime = file_path.stat().st_mtime
                
                # If modification time changed, check content hash
                if current_mtime != stored_mtime:
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                        current_hash = self.calculate_content_hash(content)
                        return current_hash != stored_hash
                    except:
                        return True
                
                return False
        except:
            return True
    
    def extract_python_elements(self, content: str, file_path: str) -> List[CodeElement]:
        """Extract code elements from Python files."""
        elements = []
        try:
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    signature = f"def {node.name}({', '.join([arg.arg for arg in node.args.args])})"
                    docstring = ast.get_docstring(node)
                    elements.append(CodeElement(
                        file_path=file_path,
                        element_type='function',
                        name=node.name,
                        line_start=node.lineno,
                        line_end=node.end_lineno or node.lineno,
                        signature=signature,
                        docstring=docstring
                    ))
                
                elif isinstance(node, ast.ClassDef):
                    base_classes = [base.id for base in node.bases if isinstance(base, ast.Name)]
                    signature = f"class {node.name}({', '.join(base_classes)})" if base_classes else f"class {node.name}"
                    docstring = ast.get_docstring(node)
                    elements.append(CodeElement(
                        file_path=file_path,
                        element_type='class',
                        name=node.name,
                        line_start=node.lineno,
                        line_end=node.end_lineno or node.lineno,
                        signature=signature,
                        docstring=docstring
                    ))
        except Exception as e:
            print(f"Error parsing Python file {file_path}: {e}")
        
        return elements
    
    def extract_js_ts_elements(self, content: str, file_path: str) -> List[CodeElement]:
        """Extract code elements from JavaScript/TypeScript files."""
        elements = []
        lines = content.split('\n')
        
        # Regular expressions for different JS/TS patterns
        patterns = [
            # Functions
            (r'^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)', 'function'),
            (r'^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\s*\([^)]*\)\s*=>', 'function'),
            (r'^\s*(?:export\s+)?(\w+)\s*:\s*(?:async\s+)?\s*\([^)]*\)\s*=>', 'function'),
            
            # Classes
            (r'^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)', 'class'),
            
            # Interfaces (TypeScript)
            (r'^\s*(?:export\s+)?interface\s+(\w+)', 'interface'),
            
            # Type definitions (TypeScript)
            (r'^\s*(?:export\s+)?type\s+(\w+)', 'type'),
            
            # React components
            (r'^\s*(?:export\s+)?const\s+(\w+):\s*React\.FC', 'component'),
            (r'^\s*(?:export\s+)?const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*{', 'component'),
        ]
        
        for i, line in enumerate(lines, 1):
            for pattern, element_type in patterns:
                match = re.search(pattern, line)
                if match:
                    name = match.group(1)
                    elements.append(CodeElement(
                        file_path=file_path,
                        element_type=element_type,
                        name=name,
                        line_start=i,
                        line_end=i,  # We'd need more complex parsing for end lines
                        signature=line.strip()
                    ))
        
        return elements
    
    def extract_code_elements(self, content: str, file_path: str, language: str) -> List[CodeElement]:
        """Extract code elements based on file language."""
        if language == 'python':
            return self.extract_python_elements(content, file_path)
        elif language in ['javascript', 'typescript', 'javascriptreact', 'typescriptreact']:
            return self.extract_js_ts_elements(content, file_path)
        else:
            return []  # Add more language support as needed
    
    def index_file(self, file_path: Path) -> Optional[FileMetadata]:
        """Index a single file and extract its metadata and code elements."""
        try:
            relative_path = str(file_path.relative_to(self.workspace_path))
            
            # Read file content
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            
            # Calculate metadata
            stat = file_path.stat()
            language = self.get_file_language(file_path)
            content_hash = self.calculate_content_hash(content)
            line_count = len(content.split('\n'))
            
            metadata = FileMetadata(
                path=relative_path,
                size=stat.st_size,
                last_modified=stat.st_mtime,
                file_type=file_path.suffix.lower(),
                content_hash=content_hash,
                line_count=line_count,
                language=language
            )
            
            # Extract code elements
            elements = self.extract_code_elements(content, relative_path, language)
            
            # Store in database
            with sqlite3.connect(self.db_path) as conn:
                # Insert/update file metadata
                conn.execute('''
                    INSERT OR REPLACE INTO file_metadata 
                    (path, size, last_modified, file_type, content_hash, line_count, language, indexed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (*asdict(metadata).values(), time.time()))
                
                # Delete old code elements for this file
                conn.execute('DELETE FROM code_elements WHERE file_path = ?', (relative_path,))
                
                # Insert new code elements
                for element in elements:
                    conn.execute('''
                        INSERT INTO code_elements 
                        (file_path, element_type, name, line_start, line_end, signature, docstring)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        element.file_path, element.element_type, element.name,
                        element.line_start, element.line_end, element.signature, element.docstring
                    ))
            
            return metadata
            
        except Exception as e:
            print(f"Error indexing file {file_path}: {e}")
            return None
    
    def generate_project_overview(self) -> ProjectOverview:
        """Generate a comprehensive project overview."""
        with sqlite3.connect(self.db_path) as conn:
            # Get total files and lines
            cursor = conn.execute('SELECT COUNT(*), SUM(line_count) FROM file_metadata')
            total_files, total_lines = cursor.fetchone()
            total_lines = total_lines or 0
            
            # Get languages distribution
            cursor = conn.execute('SELECT language, COUNT(*) FROM file_metadata GROUP BY language')
            languages = dict(cursor.fetchall())
            
            # Get main directories
            cursor = conn.execute('SELECT DISTINCT path FROM file_metadata')
            all_paths = [row[0] for row in cursor.fetchall()]
            directories = set()
            for path in all_paths:
                parts = Path(path).parts
                if len(parts) > 1:
                    directories.add(parts[0])
            main_directories = sorted(list(directories))
            
            # Identify key files
            key_files = []
            for file_path in all_paths:
                filename = Path(file_path).name.lower()
                if filename in ['package.json', 'requirements.txt', 'cargo.toml', 'pom.xml', 
                              'dockerfile', 'docker-compose.yml', 'readme.md', 'main.py', 
                              'index.js', 'index.ts', 'app.py', 'app.js', 'app.ts']:
                    key_files.append(file_path)
            
            # Detect framework/technology info
            framework_info = {}
            dependencies = []
            
            # Check package.json for Node.js projects
            package_json_path = self.workspace_path / 'package.json'
            if package_json_path.exists():
                try:
                    with open(package_json_path, 'r') as f:
                        package_data = json.load(f)
                        deps = {**package_data.get('dependencies', {}), **package_data.get('devDependencies', {})}
                        dependencies.extend(deps.keys())
                        
                        # Detect frameworks
                        if 'react' in deps:
                            framework_info['frontend'] = 'React'
                        elif 'vue' in deps:
                            framework_info['frontend'] = 'Vue'
                        elif 'angular' in deps:
                            framework_info['frontend'] = 'Angular'
                        
                        if 'express' in deps:
                            framework_info['backend'] = 'Express'
                        elif 'fastify' in deps:
                            framework_info['backend'] = 'Fastify'
                        
                        if 'typescript' in deps:
                            framework_info['language'] = 'TypeScript'
                except:
                    pass
            
            # Check requirements.txt for Python projects
            requirements_path = self.workspace_path / 'requirements.txt'
            if requirements_path.exists():
                try:
                    with open(requirements_path, 'r') as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith('#'):
                                dep = line.split('==')[0].split('>=')[0].split('<=')[0]
                                dependencies.append(dep)
                                
                                # Detect frameworks
                                if dep.lower() in ['django', 'flask', 'fastapi']:
                                    framework_info['backend'] = dep.capitalize()
                except:
                    pass
            
            return ProjectOverview(
                total_files=total_files,
                total_lines=total_lines,
                languages=languages,
                main_directories=main_directories,
                key_files=key_files,
                framework_info=framework_info,
                dependencies=dependencies[:20]  # Limit to first 20 dependencies
            )
    
    def get_project_summary(self) -> str:
        """Generate a natural language summary of the project."""
        overview = self.generate_project_overview()
        
        summary_parts = []
        
        # Project scale
        summary_parts.append(f"This is a codebase with {overview.total_files} files and {overview.total_lines:,} lines of code.")
        
        # Languages
        if overview.languages:
            lang_list = [f"{lang} ({count} files)" for lang, count in sorted(overview.languages.items(), key=lambda x: x[1], reverse=True)]
            summary_parts.append(f"Primary languages: {', '.join(lang_list[:5])}.")
        
        # Framework/tech stack
        if overview.framework_info:
            tech_info = []
            if 'frontend' in overview.framework_info:
                tech_info.append(f"Frontend: {overview.framework_info['frontend']}")
            if 'backend' in overview.framework_info:
                tech_info.append(f"Backend: {overview.framework_info['backend']}")
            if 'language' in overview.framework_info:
                tech_info.append(f"Language: {overview.framework_info['language']}")
            if tech_info:
                summary_parts.append(f"Technology stack: {', '.join(tech_info)}.")
        
        # Directory structure
        if overview.main_directories:
            summary_parts.append(f"Main directories: {', '.join(overview.main_directories[:8])}.")
        
        # Key files
        if overview.key_files:
            summary_parts.append(f"Key configuration files: {', '.join(overview.key_files)}.")
        
        return " ".join(summary_parts)
    
    def cleanup_stale_database_entries(self) -> Dict[str, int]:
        """Remove database entries for files that no longer exist."""
        removed_files = 0
        removed_elements = 0
        
        with sqlite3.connect(self.db_path) as conn:
            # Get all file paths from database
            cursor = conn.execute('SELECT path FROM file_metadata')
            db_files = [row[0] for row in cursor.fetchall()]
            
            # Check which files no longer exist
            stale_files = []
            for db_file_path in db_files:
                # Convert relative path back to absolute path
                if os.path.isabs(db_file_path):
                    full_path = Path(db_file_path)
                else:
                    full_path = self.workspace_path / db_file_path
                
                if not full_path.exists() or self.should_ignore_path(full_path):
                    stale_files.append(db_file_path)
            
            # Remove stale entries
            for stale_file in stale_files:
                # Remove code elements first (foreign key constraint)
                cursor = conn.execute('DELETE FROM code_elements WHERE file_path = ?', (stale_file,))
                removed_elements += cursor.rowcount
                
                # Remove file metadata
                cursor = conn.execute('DELETE FROM file_metadata WHERE path = ?', (stale_file,))
                removed_files += cursor.rowcount
            
            conn.commit()
        
        print(f"Database cleanup: Removed {removed_files} stale files and {removed_elements} stale code elements")
        return {
            'removed_files': removed_files,
            'removed_elements': removed_elements,
            'stale_file_paths': stale_files
        }

    def index_workspace(self, force_reindex: bool = False) -> bool:
        """Index the entire workspace."""
        print(f"Starting indexing of workspace: {self.workspace_path}")
        
        # First, clean up stale database entries
        cleanup_result = self.cleanup_stale_database_entries()
        
        indexed_count = 0
        skipped_count = 0
        
        for file_path in self.workspace_path.rglob('*'):
            if file_path.is_file() and not self.should_ignore_path(file_path):
                # Only index text files that we can understand
                if self.get_file_language(file_path) != 'unknown' or file_path.suffix.lower() in ['.md', '.txt', '.json']:
                    if force_reindex or self.is_file_changed(file_path):
                        if self.index_file(file_path):
                            indexed_count += 1
                    else:
                        skipped_count += 1
        
        # Update project overview in database
        overview = self.generate_project_overview()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT OR REPLACE INTO project_overview (key, value, updated_at)
                VALUES (?, ?, ?)
            ''', ('overview', json.dumps(asdict(overview)), time.time()))
        
        print(f"Indexing complete: {indexed_count} files indexed, {skipped_count} files skipped")
        print(f"Cleanup: {cleanup_result['removed_files']} stale files removed from database")
        return True
    
    def search_code_elements(self, query: str, element_types: List[str] = None, limit: int = 50) -> List[Dict]:
        """Search for code elements by name or signature."""
        with sqlite3.connect(self.db_path) as conn:
            where_clauses = ["name LIKE ? OR signature LIKE ?"]
            params = [f"%{query}%", f"%{query}%"]
            
            if element_types:
                where_clauses.append(f"element_type IN ({','.join(['?' for _ in element_types])})")
                params.extend(element_types)
            
            sql = f'''
                SELECT file_path, element_type, name, line_start, line_end, signature, docstring
                FROM code_elements
                WHERE {' AND '.join(where_clauses)}
                ORDER BY name
                LIMIT ?
            '''
            params.append(limit)
            
            cursor = conn.execute(sql, params)
            results = []
            for row in cursor.fetchall():
                results.append({
                    'file_path': row[0],
                    'element_type': row[1],
                    'name': row[2],
                    'line_start': row[3],
                    'line_end': row[4],
                    'signature': row[5],
                    'docstring': row[6]
                })
            
            return results
    
    def get_file_overview(self, file_path: str) -> Optional[Dict]:
        """Get overview of a specific file including its code elements."""
        with sqlite3.connect(self.db_path) as conn:
            # Get file metadata
            cursor = conn.execute(
                'SELECT * FROM file_metadata WHERE path = ?',
                (file_path,)
            )
            file_data = cursor.fetchone()
            
            if not file_data:
                return None
            
            # Get code elements
            cursor = conn.execute(
                'SELECT element_type, name, line_start, signature FROM code_elements WHERE file_path = ? ORDER BY line_start',
                (file_path,)
            )
            elements = [{'type': row[0], 'name': row[1], 'line': row[2], 'signature': row[3]} for row in cursor.fetchall()]
            
            return {
                'path': file_data[0],
                'language': file_data[6],
                'line_count': file_data[5],
                'elements': elements
            }
    
    def get_indexing_info(self) -> Dict[str, Any]:
        """Get information about the current indexing setup."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute('SELECT key, value FROM workspace_info')
                workspace_info = dict(cursor.fetchall())
                
                cursor = conn.execute('SELECT COUNT(*) FROM file_metadata')
                total_files = cursor.fetchone()[0]
                
                cursor = conn.execute('SELECT COUNT(*) FROM code_elements')
                total_elements = cursor.fetchone()[0]
                
                return {
                    'workspace_path': workspace_info.get('workspace_path'),
                    'cache_location': workspace_info.get('cache_location'),
                    'database_path': str(self.db_path),
                    'total_indexed_files': total_files,
                    'total_code_elements': total_elements,
                    'workspace_identifier': self._create_workspace_identifier(self.workspace_path),
                    'cache_directory_exists': self.cache_dir.exists(),
                    'database_exists': self.db_path.exists()
                }
        except Exception as e:
            return {
                'error': str(e),
                'workspace_path': str(self.workspace_path.resolve()),
                'cache_location': str(self.cache_dir),
                'database_path': str(self.db_path)
            }
    
    def cleanup_old_workspace_cache(self) -> Dict[str, Any]:
        """Clean up old .pointer_cache directory in the workspace if it exists."""
        old_cache_dir = self.workspace_path / ".pointer_cache"
        if old_cache_dir.exists():
            try:
                import shutil
                shutil.rmtree(old_cache_dir)
                return {
                    'success': True,
                    'message': f'Removed old cache directory: {old_cache_dir}',
                    'removed_path': str(old_cache_dir)
                }
            except Exception as e:
                return {
                    'success': False,
                    'error': f'Failed to remove old cache directory: {str(e)}',
                    'path': str(old_cache_dir)
                }
        else:
            return {
                'success': True,
                'message': 'No old cache directory found',
                'path': str(old_cache_dir)
            }
    
    def get_ai_context_summary(self) -> Dict[str, Any]:
        """Generate a comprehensive AI-friendly summary of the codebase."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get project overview
                overview = self.generate_project_overview()
                
                # Get most important files (high line count or many code elements)
                cursor = conn.execute('''
                    SELECT fm.path, fm.language, fm.line_count,
                           COUNT(ce.id) as element_count
                    FROM file_metadata fm
                    LEFT JOIN code_elements ce ON fm.path = ce.file_path
                    GROUP BY fm.path
                    ORDER BY (fm.line_count + COUNT(ce.id) * 10) DESC
                    LIMIT 20
                ''')
                important_files = [
                    {
                        'path': row[0],
                        'language': row[1], 
                        'line_count': row[2],
                        'element_count': row[3]
                    }
                    for row in cursor.fetchall()
                ]
                
                # Get most common function/class names (might indicate patterns)
                cursor = conn.execute('''
                    SELECT name, element_type, COUNT(*) as frequency
                    FROM code_elements
                    GROUP BY name, element_type
                    HAVING COUNT(*) > 1
                    ORDER BY COUNT(*) DESC
                    LIMIT 15
                ''')
                common_patterns = [
                    {
                        'name': row[0],
                        'type': row[1],
                        'frequency': row[2]
                    }
                    for row in cursor.fetchall()
                ]
                
                # Get directory structure overview
                cursor = conn.execute('SELECT DISTINCT path FROM file_metadata')
                all_paths = [row[0] for row in cursor.fetchall()]
                
                # Build directory tree summary
                directories = {}
                for path in all_paths:
                    parts = Path(path).parts
                    if len(parts) > 1:
                        dir_name = parts[0]
                        if dir_name not in directories:
                            directories[dir_name] = {'files': 0, 'languages': set()}
                        directories[dir_name]['files'] += 1
                        
                        # Get language from file extension
                        file_lang = self.get_file_language(Path(path))
                        if file_lang != 'unknown':
                            directories[dir_name]['languages'].add(file_lang)
                
                # Convert sets to lists for JSON serialization
                for dir_info in directories.values():
                    dir_info['languages'] = list(dir_info['languages'])
                
                return {
                    'project_summary': self.get_project_summary(),
                    'overview': asdict(overview),
                    'important_files': important_files,
                    'common_patterns': common_patterns,
                    'directory_structure': directories,
                    'workspace_path': str(self.workspace_path),
                    'total_indexed_files': len(all_paths)
                }
                
        except Exception as e:
            return {
                'error': str(e),
                'workspace_path': str(self.workspace_path)
            }
    
    def query_codebase_natural_language(self, query: str) -> Dict[str, Any]:
        """Answer natural language questions about the codebase structure and content."""
        try:
            query_lower = query.lower()
            results = {}
            
            with sqlite3.connect(self.db_path) as conn:
                
                # Handle questions about file counts and languages
                if any(word in query_lower for word in ['how many', 'count', 'total']):
                    if any(word in query_lower for word in ['file', 'files']):
                        cursor = conn.execute('SELECT COUNT(*) FROM file_metadata')
                        total_files = cursor.fetchone()[0]
                        results['total_files'] = total_files
                        
                        # Language breakdown
                        cursor = conn.execute('SELECT language, COUNT(*) FROM file_metadata GROUP BY language ORDER BY COUNT(*) DESC')
                        results['files_by_language'] = dict(cursor.fetchall())
                    
                    if any(word in query_lower for word in ['function', 'class', 'component']):
                        cursor = conn.execute('SELECT element_type, COUNT(*) FROM code_elements GROUP BY element_type ORDER BY COUNT(*) DESC')
                        results['elements_by_type'] = dict(cursor.fetchall())
                
                # Handle questions about specific technologies or frameworks
                tech_keywords = ['react', 'vue', 'angular', 'express', 'fastapi', 'django', 'flask', 'typescript', 'javascript', 'python']
                for tech in tech_keywords:
                    if tech in query_lower:
                        # Search in file content, names, and dependencies
                        cursor = conn.execute('''
                            SELECT DISTINCT fm.path, fm.language
                            FROM file_metadata fm
                            LEFT JOIN code_elements ce ON fm.path = ce.file_path
                            WHERE fm.path LIKE ? OR ce.name LIKE ? OR ce.signature LIKE ?
                            LIMIT 10
                        ''', (f'%{tech}%', f'%{tech}%', f'%{tech}%'))
                        
                        tech_files = [{'path': row[0], 'language': row[1]} for row in cursor.fetchall()]
                        if tech_files:
                            results[f'{tech}_related_files'] = tech_files
                
                # Handle questions about specific file types or directories
                if any(word in query_lower for word in ['component', 'components']):
                    cursor = conn.execute('''
                        SELECT file_path, name, signature FROM code_elements 
                        WHERE element_type IN ('component', 'function') 
                        AND (file_path LIKE '%component%' OR name LIKE '%Component%')
                        LIMIT 15
                    ''')
                    results['components'] = [
                        {'file': row[0], 'name': row[1], 'signature': row[2]}
                        for row in cursor.fetchall()
                    ]
                
                # Handle questions about configuration or setup files
                if any(word in query_lower for word in ['config', 'setup', 'package', 'dependencies']):
                    config_files = []
                    cursor = conn.execute('SELECT path FROM file_metadata WHERE path LIKE ? OR path LIKE ? OR path LIKE ? OR path LIKE ?', 
                                        ('%package.json%', '%requirements.txt%', '%config%', '%setup%'))
                    config_files = [row[0] for row in cursor.fetchall()]
                    results['configuration_files'] = config_files
                
                # Handle questions about large or complex files
                if any(word in query_lower for word in ['large', 'big', 'complex', 'main']):
                    cursor = conn.execute('''
                        SELECT fm.path, fm.line_count, COUNT(ce.id) as element_count
                        FROM file_metadata fm
                        LEFT JOIN code_elements ce ON fm.path = ce.file_path
                        GROUP BY fm.path
                        ORDER BY fm.line_count DESC
                        LIMIT 10
                    ''')
                    results['largest_files'] = [
                        {'path': row[0], 'lines': row[1], 'elements': row[2]}
                        for row in cursor.fetchall()
                    ]
                
                # If no specific patterns matched, provide a general summary
                if not results:
                    overview = self.generate_project_overview()
                    results['general_info'] = {
                        'total_files': overview.total_files,
                        'total_lines': overview.total_lines,
                        'languages': overview.languages,
                        'main_directories': overview.main_directories[:5],
                        'key_files': overview.key_files[:5]
                    }
                
                results['query'] = query
                return results
                
        except Exception as e:
            return {
                'error': str(e),
                'query': query
            }
    
    def get_relevant_context_for_query(self, query: str, max_files: int = 5) -> Dict[str, Any]:
        """Get relevant code context based on a query or task description."""
        try:
            query_lower = query.lower()
            relevant_files = []
            relevant_elements = []
            
            with sqlite3.connect(self.db_path) as conn:
                # Extract keywords from the query (simple approach)
                import re
                keywords = re.findall(r'\b\w{3,}\b', query_lower)
                keywords = [k for k in keywords if k not in ['the', 'and', 'for', 'with', 'this', 'that', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should']]
                
                if keywords:
                    # Search for relevant code elements
                    keyword_pattern = '|'.join(keywords[:5])  # Limit to top 5 keywords
                    
                    cursor = conn.execute('''
                        SELECT ce.file_path, ce.element_type, ce.name, ce.line_start, ce.signature,
                               fm.language, fm.line_count
                        FROM code_elements ce
                        JOIN file_metadata fm ON ce.file_path = fm.path
                        WHERE ce.name REGEXP ? OR ce.signature REGEXP ? OR ce.file_path REGEXP ?
                        ORDER BY 
                            CASE 
                                WHEN ce.name REGEXP ? THEN 3
                                WHEN ce.signature REGEXP ? THEN 2  
                                ELSE 1
                            END DESC
                        LIMIT 20
                    ''', (keyword_pattern, keyword_pattern, keyword_pattern, keyword_pattern, keyword_pattern))
                    
                    relevant_elements = [
                        {
                            'file_path': row[0],
                            'element_type': row[1],
                            'name': row[2],
                            'line_start': row[3],
                            'signature': row[4],
                            'language': row[5],
                            'file_line_count': row[6]
                        }
                        for row in cursor.fetchall()
                    ]
                    
                    # Get unique files from relevant elements
                    file_paths = list(set([elem['file_path'] for elem in relevant_elements]))
                    
                    # Get file overviews for the most relevant files
                    for file_path in file_paths[:max_files]:
                        file_overview = self.get_file_overview(file_path)
                        if file_overview:
                            relevant_files.append(file_overview)
                
                return {
                    'query': query,
                    'keywords_found': keywords[:5],
                    'relevant_files': relevant_files,
                    'relevant_elements': relevant_elements[:15],
                    'suggestions': self._generate_context_suggestions(query_lower, relevant_elements)
                }
                
        except Exception as e:
            return {
                'error': str(e),
                'query': query
            }
    
    def _generate_context_suggestions(self, query_lower: str, relevant_elements: List[Dict]) -> List[str]:
        """Generate helpful suggestions based on the query and found elements."""
        suggestions = []
        
        if not relevant_elements:
            suggestions.append("No specific code elements found. Try using 'get_codebase_overview' for a general summary.")
            return suggestions
        
        # Group elements by type
        element_types = {}
        for elem in relevant_elements:
            elem_type = elem['element_type']
            if elem_type not in element_types:
                element_types[elem_type] = []
            element_types[elem_type].append(elem)
        
        # Generate type-specific suggestions
        for elem_type, elements in element_types.items():
            if len(elements) > 1:
                suggestions.append(f"Found {len(elements)} {elem_type}s that might be relevant. Consider examining: {', '.join([e['name'] for e in elements[:3]])}")
        
        # File-specific suggestions
        files = set([elem['file_path'] for elem in relevant_elements])
        if len(files) > 1:
            suggestions.append(f"Relevant code spans {len(files)} files. Key files: {', '.join(list(files)[:3])}")
        
        # Context-specific suggestions
        if any(word in query_lower for word in ['implement', 'create', 'add', 'build']):
            suggestions.append("For implementation tasks, examine existing similar patterns in the found elements.")
        
        if any(word in query_lower for word in ['debug', 'fix', 'error', 'bug']):
            suggestions.append("For debugging, look at the function signatures and check for similar patterns that might help identify the issue.")
        
        return suggestions 