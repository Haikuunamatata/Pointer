import React from 'react';
import '../styles/LoadingScreen.css';
import logoImage from '../assets/logo.png';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Establishing connection...' }) => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="logo-container">
          <img src={logoImage} alt="Logo" className="logo" />
        </div>
        <div className="spinner"></div>
        <div className="loading-message">{message}</div>
      </div>
    </div>
  );
};

export default LoadingScreen; 