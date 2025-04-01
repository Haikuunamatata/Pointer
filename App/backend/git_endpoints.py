from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import subprocess
import os
from typing import List, Optional
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('git_operations.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/git", tags=["git"])

class GitRepoRequest(BaseModel):
    directory: str
    includeHidden: bool = False

class GitStatusRequest(BaseModel):
    directory: str

class GitInitRequest(BaseModel):
    directory: str

class GitAddRequest(BaseModel):
    directory: str
    files: List[str]

class GitResetRequest(BaseModel):
    directory: str
    files: List[str]

class GitCommitRequest(BaseModel):
    directory: str
    message: str

class GitResetCommitRequest(BaseModel):
    directory: str
    commit: Optional[str] = None

class GitLogRequest(BaseModel):
    directory: str
    limit: int = 50

class GitBranchesRequest(BaseModel):
    directory: str

class GitIdentityRequest(BaseModel):
    directory: str

class GitSetIdentityRequest(BaseModel):
    directory: str
    name: str
    email: str

class GitPushRequest(BaseModel):
    directory: str
    remote: str = "origin"
    branch: str = ""

class GitStashRequest(BaseModel):
    directory: str
    message: Optional[str] = None

class GitStashApplyRequest(BaseModel):
    directory: str
    stash_index: int

def run_git_command(cmd: List[str], cwd: str, operation: str) -> subprocess.CompletedProcess:
    """Run a git command and log its execution."""
    cmd_str = ' '.join(cmd)
    logger.info(f"Executing Git command: {cmd_str} in directory: {cwd}")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            logger.error(f"Git {operation} failed. Command: {cmd_str}")
            logger.error(f"Error output: {result.stderr}")
        else:
            logger.info(f"Git {operation} successful")
            if result.stdout:
                logger.debug(f"Command output: {result.stdout}")
                
        return result
    except Exception as e:
        logger.error(f"Exception during Git {operation}: {str(e)}")
        raise

@router.post("/is-repo")
async def is_git_repo(request: GitRepoRequest):
    """Check if a directory is a Git repository."""
    try:
        directory = request.directory
        
        # Check if .git directory exists
        git_dir = os.path.join(directory, ".git")
        if os.path.exists(git_dir) and os.path.isdir(git_dir):
            return {"isGitRepo": True}
            
        # If not found and we should include hidden files, check using git command
        if request.includeHidden:
            try:
                result = subprocess.run(
                    ["git", "rev-parse", "--is-inside-work-tree"],
                    cwd=directory,
                    capture_output=True,
                    text=True,
                    check=False
                )
                return {"isGitRepo": result.stdout.strip() == "true"}
            except Exception as e:
                return {"isGitRepo": False}
                
        return {"isGitRepo": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/status")
async def git_status(request: GitStatusRequest):
    """Get Git repository status."""
    try:
        directory = request.directory
        
        # Check if it's a git repository first
        is_repo_request = GitRepoRequest(directory=directory, includeHidden=True)
        is_repo_result = await is_git_repo(is_repo_request)
        
        if not is_repo_result["isGitRepo"]:
            return {
                "isGitRepo": False,
                "branch": "",
                "changes": {
                    "staged": [],
                    "unstaged": [],
                    "untracked": []
                }
            }
        
        # Get current branch
        branch_result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        branch = branch_result.stdout.strip()
        
        # Get staged changes
        staged_result = subprocess.run(
            ["git", "diff", "--name-only", "--cached"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        staged = staged_result.stdout.strip().split("\n") if staged_result.stdout.strip() else []
        
        # Get unstaged changes
        unstaged_result = subprocess.run(
            ["git", "diff", "--name-only"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        unstaged = unstaged_result.stdout.strip().split("\n") if unstaged_result.stdout.strip() else []
        
        # Get untracked files
        untracked_result = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        untracked = untracked_result.stdout.strip().split("\n") if untracked_result.stdout.strip() else []
        
        # Check if there are commits to push
        push_result = subprocess.run(
            ["git", "log", "--branches", "--not", "--remotes", "--oneline"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        has_commits_to_push = bool(push_result.stdout.strip())
        
        return {
            "isGitRepo": True,
            "branch": branch,
            "changes": {
                "staged": staged,
                "unstaged": unstaged,
                "untracked": untracked,
                "hasCommitsToPush": has_commits_to_push
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/init")
async def git_init(request: GitInitRequest):
    """Initialize a Git repository."""
    try:
        directory = request.directory
        
        result = subprocess.run(
            ["git", "init"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip()
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/add")
async def git_add(request: GitAddRequest):
    """Stage files to be committed."""
    try:
        directory = request.directory
        files = request.files
        
        if not files:
            return {
                "success": False,
                "data": "",
                "error": "No files specified"
            }
        
        # Use git add command to stage files
        result = subprocess.run(
            ["git", "add", "--"] + files,
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or "Files staged successfully"
        }
    except Exception as e:
        return {
            "success": False, 
            "data": "",
            "error": str(e)
        }

@router.post("/reset")
async def git_reset(request: GitResetRequest):
    """Unstage files."""
    try:
        directory = request.directory
        files = request.files
        
        if not files:
            return {
                "success": False,
                "data": "",
                "error": "No files specified"
            }
        
        # Use git reset to unstage files
        result = subprocess.run(
            ["git", "reset", "HEAD", "--"] + files,
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or "Files unstaged successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/commit")
async def git_commit(request: GitCommitRequest):
    """Commit staged changes."""
    try:
        directory = request.directory
        message = request.message
        
        if not message:
            logger.warning("Commit attempted with empty message")
            return {
                "success": False,
                "data": "",
                "error": "Commit message is required"
            }
        
        # Check if there are any staged changes
        logger.info("Checking for staged changes...")
        staged_result = run_git_command(
            ["git", "diff", "--cached", "--quiet"],
            directory,
            "staged changes check"
        )
        
        if staged_result.returncode == 0:
            logger.warning("Commit attempted with no staged changes")
            return {
                "success": False,
                "data": "",
                "error": "No changes staged for commit"
            }
        
        # Check if user identity is configured
        logger.info("Checking Git user identity...")
        name_result = run_git_command(
            ["git", "config", "user.name"],
            directory,
            "user.name check"
        )
        
        email_result = run_git_command(
            ["git", "config", "user.email"],
            directory,
            "user.email check"
        )
        
        if not name_result.stdout.strip() or not email_result.stdout.strip():
            logger.warning("Git identity not configured")
            return {
                "success": False,
                "data": "",
                "error": "Git user identity not configured. Please run:\ngit config --global user.name 'Your Name'\ngit config --global user.email 'your.email@example.com'"
            }
        
        # Perform the commit
        logger.info(f"Committing changes with message: {message}")
        result = run_git_command(
            ["git", "commit", "-m", message],
            directory,
            "commit"
        )
        
        if result.returncode != 0:
            error_msg = result.stderr.strip()
            if "Please tell me who you are" in error_msg:
                error_msg = "Git user identity not configured. Please run:\ngit config --global user.name 'Your Name'\ngit config --global user.email 'your.email@example.com'"
            logger.error(f"Commit failed: {error_msg}")
            return {
                "success": False,
                "data": "",
                "error": error_msg
            }
        
        logger.info("Commit successful")
        return {
            "success": True,
            "data": result.stdout.strip()
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Exception during commit: {error_msg}")
        return {
            "success": False,
            "data": "",
            "error": error_msg
        }

@router.post("/log")
async def git_log(request: GitLogRequest):
    """Get commit history."""
    try:
        directory = request.directory
        limit = request.limit
        
        # Use git log to get commit history
        result = subprocess.run(
            ["git", "log", f"-{limit}", "--pretty=format:%H|%an|%ad|%s", "--date=iso"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {"logs": []}
        
        logs = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split('|', 3)
                if len(parts) >= 4:
                    logs.append({
                        "hash": parts[0],
                        "author": parts[1],
                        "date": parts[2],
                        "message": parts[3]
                    })
        
        return {"logs": logs}
    except Exception as e:
        print(f"Error getting git log: {str(e)}")
        return {"logs": []}

@router.post("/branches")
async def git_branches(request: GitBranchesRequest):
    """Get list of branches."""
    try:
        directory = request.directory
        
        # Use git branch to get list of branches
        result = subprocess.run(
            ["git", "branch"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {"branches": []}
        
        branches = []
        for line in result.stdout.strip().split('\n'):
            if line:
                # Remove leading '* ' or '  ' from branch name
                branch = line.strip()
                if branch.startswith('* '):
                    branch = branch[2:]
                branches.append(branch)
        
        return {"branches": branches}
    except Exception as e:
        print(f"Error getting git branches: {str(e)}")
        return {"branches": []}

@router.post("/check-identity")
async def check_git_identity(request: GitIdentityRequest):
    """Check Git user identity configuration."""
    try:
        directory = request.directory
        
        # Check user name
        name_result = subprocess.run(
            ["git", "config", "user.name"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        # Check user email
        email_result = subprocess.run(
            ["git", "config", "user.email"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        user_name = name_result.stdout.strip()
        user_email = email_result.stdout.strip()
        
        return {
            "configured": bool(user_name and user_email),
            "userName": user_name or None,
            "userEmail": user_email or None
        }
    except Exception as e:
        print(f"Error checking git identity: {str(e)}")
        return {
            "configured": False,
            "userName": None,
            "userEmail": None
        }

@router.post("/set-identity")
async def set_git_identity(request: GitSetIdentityRequest):
    """Set Git user identity configuration."""
    try:
        directory = request.directory
        name = request.name
        email = request.email
        
        # Set user name
        name_result = subprocess.run(
            ["git", "config", "--global", "user.name", name],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if name_result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": name_result.stderr.strip()
            }
        
        # Set user email
        email_result = subprocess.run(
            ["git", "config", "--global", "user.email", email],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if email_result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": email_result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": "Git identity configured successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/push")
async def git_push(request: GitPushRequest):
    """Push commits to remote repository."""
    try:
        directory = request.directory
        remote = request.remote
        branch = request.branch

        # First check if we have a remote
        logger.info("Checking remote...")
        remote_result = run_git_command(
            ["git", "remote"],
            directory,
            "remote check"
        )

        if not remote_result.stdout.strip():
            logger.warning("No remote repository configured")
            return {
                "success": False,
                "data": "",
                "error": "No remote repository configured. Add a remote first."
            }

        # Check if we have unpushed commits
        logger.info("Checking for unpushed commits...")
        unpushed_result = run_git_command(
            ["git", "log", "@{u}.."],
            directory,
            "unpushed check"
        )

        if not unpushed_result.stdout.strip():
            logger.info("No commits to push")
            return {
                "success": True,
                "data": "Already up to date"
            }

        # Perform the push
        push_cmd = ["git", "push", remote]
        if branch:
            push_cmd.extend([branch])

        logger.info(f"Pushing to {remote}{f'/{branch}' if branch else ''}...")
        result = run_git_command(
            push_cmd,
            directory,
            "push"
        )

        if result.returncode != 0:
            error_msg = result.stderr.strip()
            logger.error(f"Push failed: {error_msg}")
            return {
                "success": False,
                "data": "",
                "error": error_msg
            }

        logger.info("Push successful")
        return {
            "success": True,
            "data": result.stdout.strip() or "Changes pushed successfully"
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Exception during push: {error_msg}")
        return {
            "success": False,
            "data": "",
            "error": error_msg
        }

@router.post("/stash-list")
async def git_stash_list(request: GitRepoRequest):
    """Get list of stashes."""
    try:
        directory = request.directory
        
        # Use git stash list to get list of stashes
        result = subprocess.run(
            ["git", "stash", "list", "--pretty=format:%gd|%gs"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {"stashes": []}
        
        stashes = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split('|', 1)
                if len(parts) >= 2:
                    stashes.append({
                        "index": parts[0].replace('stash@{', '').replace('}', ''),
                        "message": parts[1]
                    })
        
        return {"stashes": stashes}
    except Exception as e:
        print(f"Error getting git stashes: {str(e)}")
        return {"stashes": []}

@router.post("/stash")
async def git_stash(request: GitStashRequest):
    """Create a new stash."""
    try:
        directory = request.directory
        message = request.message
        
        # Build the git stash command
        cmd = ["git", "stash", "push"]
        if message:
            cmd.extend(["-m", message])
        
        result = subprocess.run(
            cmd,
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or "Changes stashed successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/stash-apply")
async def git_stash_apply(request: GitStashApplyRequest):
    """Apply a stash."""
    try:
        directory = request.directory
        stash_index = request.stash_index
        
        result = subprocess.run(
            ["git", "stash", "apply", f"stash@{{{stash_index}}}"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or "Stash applied successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/stash-pop")
async def git_stash_pop(request: GitStashApplyRequest):
    """Apply and remove a stash."""
    try:
        directory = request.directory
        stash_index = request.stash_index
        
        # Use git stash pop to apply and remove the stash
        result = subprocess.run(
            ["git", "stash", "pop", f"stash@{{{stash_index}}}"],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or "Stash applied and removed successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/reset-hard")
async def git_reset_hard(request: GitResetCommitRequest):
    """Perform a hard reset to a specific commit."""
    try:
        directory = request.directory
        commit = request.commit or "HEAD"
        
        # Use git reset --hard to reset to the specified commit
        result = subprocess.run(
            ["git", "reset", "--hard", commit],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or f"Successfully reset to {commit}"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/reset-soft")
async def git_reset_soft(request: GitResetCommitRequest):
    """Perform a soft reset to a specific commit."""
    try:
        directory = request.directory
        commit = request.commit or "HEAD~1"
        
        # Use git reset --soft to reset to the specified commit
        result = subprocess.run(
            ["git", "reset", "--soft", commit],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or f"Successfully soft reset to {commit}"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        }

@router.post("/reset-mixed")
async def git_reset_mixed(request: GitResetCommitRequest):
    """Perform a mixed reset to a specific commit."""
    try:
        directory = request.directory
        commit = request.commit or "HEAD~1"
        
        # Use git reset --mixed to reset to the specified commit
        result = subprocess.run(
            ["git", "reset", "--mixed", commit],
            cwd=directory,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            return {
                "success": False,
                "data": "",
                "error": result.stderr.strip()
            }
        
        return {
            "success": True,
            "data": result.stdout.strip() or f"Successfully mixed reset to {commit}"
        }
    except Exception as e:
        return {
            "success": False,
            "data": "",
            "error": str(e)
        } 