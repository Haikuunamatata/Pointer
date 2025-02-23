import React from 'react';

const iconColors = {
  js: '#F1DD3F',
  ts: '#3178C6',
  jsx: '#61DAFB',
  tsx: '#61DAFB',
  css: '#2965F1',
  html: '#E44D26',
  json: '#F1DD3F',
  md: '#ffffff',
  py: '#3776AB',
  java: '#E76F00',
  cpp: '#659AD2',
  c: '#659AD2',
  go: '#00ADD8',
  rs: '#DEA584',
  php: '#777BB4',
  rb: '#CC342D',
  sql: '#CC2927',
  yaml: '#FF5F00',
  xml: '#F1662A',
  default: '#8B8B8B'
};

export const getIconForFile = (filename: string): JSX.Element => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const color = iconColors[ext as keyof typeof iconColors] || iconColors.default;

  // Common SVG properties
  const svgProps = {
    width: '16',
    height: '16',
    viewBox: '0 0 16 16',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    style: { minWidth: '16px' }
  };

  switch (ext) {
    case 'js':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <path d="M8.5 7.5c.5-.7 1.2-.9 2-.5m-4.5 4v-1c.3-.5.7-.7 1.2-.7.6 0 1 .2 1.2.7v1" stroke="#000" strokeWidth=".8"/>
        </svg>
      );
    case 'jsx':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <circle cx="8" cy="8" r="2" stroke="#000" strokeWidth=".8"/>
          <path d="M8 4v8M4 8h8" stroke="#000" strokeWidth=".8"/>
        </svg>
      );
    case 'ts':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <path d="M8 7h2m-1 0v4M6 7v4" stroke="#fff" strokeWidth=".8"/>
        </svg>
      );
    case 'tsx':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <circle cx="8" cy="8" r="2" stroke="#fff" strokeWidth=".8"/>
          <path d="M4.5 4.5l7 7M4.5 11.5l7-7" stroke="#fff" strokeWidth=".8"/>
        </svg>
      );
    case 'css':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <path d="M5 7s1-1 3-1 3 1 3 1M5 9s1 1 3 1 3-1 3-1" stroke="#fff" strokeWidth=".8"/>
        </svg>
      );
    case 'html':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <path d="M5 6l3 2-3 2m6-4v4" stroke="#fff" strokeWidth=".8"/>
        </svg>
      );
    case 'json':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <path d="M6 6c0-1 .6-1.5 1.5-1.5s1.5.5 1.5 1.5M6 10c0 1 .6 1.5 1.5 1.5s1.5-.5 1.5-1.5" stroke="#000" strokeWidth=".8"/>
        </svg>
      );
    case 'md':
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <path d="M5 7l2 2 2-2m1-2v6" stroke="#000" strokeWidth=".8"/>
        </svg>
      );
    default:
      return (
        <svg {...svgProps}>
          <path d="M3 3h10v10H3V3z" fill={color}/>
          <path d="M5 5h6M5 8h6m-6 3h6" stroke="#fff" strokeWidth=".8" strokeLinecap="round"/>
        </svg>
      );
  }
};

export const FolderIcon: React.FC<{ isOpen?: boolean }> = ({ isOpen }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d={isOpen 
        ? "M1.5 3h5l1 2h7v8h-13V3z"
        : "M1.5 3h5l1 2h7v7h-13V3z"
      }
      fill="#DCB67A"
      stroke="#B89B5E"
      strokeWidth=".8"
    />
  </svg>
);

export const ChevronIcon: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    style={{
      transform: isExpanded ? 'rotate(90deg)' : 'none',
      transition: 'transform 100ms ease',
    }}
  >
    <path
      d="M6 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
); 