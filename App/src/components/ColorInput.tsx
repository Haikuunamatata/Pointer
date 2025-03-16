import React from 'react';

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  variable: string;
}

export const ColorInput: React.FC<ColorInputProps> = ({ label, value, onChange, variable }) => {
  const defaultValue = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

  return (
    <div style={{ marginBottom: '8px' }}>
      <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', marginBottom: '4px' }}>
        <span style={{ flex: 1 }}>{label}</span>
        <input
          type="color"
          value={value || defaultValue}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '24px',
            height: '24px',
            padding: '0',
            border: '1px solid var(--border-primary)',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        />
        <input
          type="text"
          value={value || defaultValue}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '80px',
            marginLeft: '8px',
            padding: '4px 8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '4px',
            color: 'var(--text-primary)',
            fontSize: '12px',
          }}
        />
      </label>
    </div>
  );
};

export default ColorInput; 