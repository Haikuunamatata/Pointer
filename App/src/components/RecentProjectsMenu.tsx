import React, { useState, useEffect } from 'react';
import { RecentProjectsService } from '../services/RecentProjectsService';
import { FileSystemService } from '../services/FileSystemService';

interface RecentProjectsMenuProps {
  onProjectSelected: () => void;
}

export const RecentProjectsMenu: React.FC<RecentProjectsMenuProps> = ({ onProjectSelected }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState(RecentProjectsService.getRecentProjects());

  useEffect(() => {
    // Load last project on startup
    const lastProject = RecentProjectsService.getLastProject();
    if (lastProject) {
      FileSystemService.openSpecificDirectory(lastProject.path);
    }
  }, []);

  const handleProjectClick = async (path: string) => {
    await FileSystemService.openSpecificDirectory(path);
    setIsOpen(false);
    onProjectSelected();
  };

  const handleRemoveProject = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    RecentProjectsService.removeProject(path);
    setProjects(RecentProjectsService.getRecentProjects());
  };

  return (
    <div className="relative" style={{ display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          position: 'relative',
          zIndex: 2001,
        }}
      >
        Recent Projects
        <span style={{ fontSize: '8px', marginTop: '2px' }}>▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          marginTop: '4px',
          width: '200px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          zIndex: 2002,
        }}>
          {projects.length === 0 ? (
            <div style={{
              padding: '8px 12px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
            }}>
              No recent projects
            </div>
          ) : (
            <div>
              {projects.map((project) => (
                <div
                  key={project.path}
                  onClick={() => handleProjectClick(project.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    ':hover': {
                      background: 'var(--bg-hover)',
                    },
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project.name}
                  </span>
                  <button
                    onClick={(e) => handleRemoveProject(e, project.path)}
                    style={{
                      marginLeft: '8px',
                      color: 'var(--error-color)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      fontSize: '14px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 