
import React from 'react';

interface RealisticRobotProps {
  className?: string;
  isPointing?: boolean;
  size?: number;
  onlyHead?: boolean;
}

const RealisticRobot: React.FC<RealisticRobotProps> = ({ className, isPointing = false, size = 64, onlyHead = false }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg 
        viewBox="0 0 200 200" 
        className="w-full h-full drop-shadow-[0_5px_15px_rgba(0,209,255,0.4)]"
      >
        <defs>
          <linearGradient id="robotWhite" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#FFFFFF', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#E2E8F0', stopOpacity: 1 }} />
          </linearGradient>
          {/* Flownexion Logo Gradients */}
          <linearGradient id="logoTop" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#00D1FF', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#0070FF', stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="logoMid" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#7C3AED', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#A855F7', stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="logoBot" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#00D1FF', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#0070FF', stopOpacity: 1 }} />
          </linearGradient>
        </defs>

        <g transform={onlyHead ? "translate(0, 40)" : "translate(0, 0)"}>
          {!onlyHead && (
            <>
              {/* Small Chibi Legs */}
              <g transform="translate(0, 10)">
                <rect x="82" y="165" width="12" height="15" rx="6" fill="#94A3B8" />
                <rect x="106" y="165" width="12" height="15" rx="6" fill="#94A3B8" />
              </g>

              {/* Left Arm - Relaxed */}
              <path d="M65 130 Q45 140 50 160" fill="none" stroke="#94A3B8" strokeWidth="10" strokeLinecap="round" />
              <circle cx="50" cy="160" r="6" fill="#64748B" />

              {/* Right Arm - Waving/Beckoning "Pick me!" Gesture */}
              <g className={isPointing ? "animate-bounce origin-center" : ""}>
                <path d="M135 130 Q165 110 155 85" fill="none" stroke="#94A3B8" strokeWidth="10" strokeLinecap="round" />
                <circle cx="155" cy="85" r="8" fill="#64748B" />
                {isPointing && (
                  <g className="animate-pulse">
                    <path d="M170 70 L180 60 M175 90 L190 95 M160 65 L165 50" stroke="#00D1FF" strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}
              </g>

              {/* Body */}
              <rect x="65" y="115" width="70" height="55" rx="25" fill="url(#robotWhite)" />
              
              {/* FLOWNEXION LOGO ON CHEST */}
              <g transform="translate(82, 128) scale(0.18)">
                <path d="M0 20 L180 0 L200 40 L20 60 Z" fill="url(#logoTop)" />
                <path d="M20 65 L200 45 L180 85 L0 105 Z" fill="url(#logoMid)" />
                <path d="M40 110 L160 100 L120 180 L80 180 Z" fill="url(#logoBot)" />
              </g>
            </>
          )}

          {/* HEAD - Large and Dominant (Chibi Style) */}
          <g>
            {/* Main Head Shape */}
            <rect x="45" y="30" width="110" height="95" rx="45" fill="url(#robotWhite)" />
            
            {/* Face Visor */}
            <rect x="55" y="45" width="90" height="55" rx="25" fill="#0F172A" />
            
            {/* Big, Friendly Glowing Eyes */}
            <g className="animate-pulse">
              <circle cx="82" cy="70" r="10" fill="#00D1FF" />
              <circle cx="118" cy="70" r="10" fill="#00D1FF" />
              <circle cx="85" cy="67" r="3" fill="white" fillOpacity="0.8" />
              <circle cx="121" cy="67" r="3" fill="white" fillOpacity="0.8" />
            </g>
            
            {/* Friendly Smile */}
            <path d="M90 88 Q100 95 110 88" fill="none" stroke="#00D1FF" strokeWidth="3" strokeLinecap="round" opacity="0.8" />

            {/* Antenna */}
            <line x1="100" y1="30" x2="100" y2="10" stroke="#94A3B8" strokeWidth="4" />
            <circle cx="100" cy="10" r="6" fill="#00D1FF">
              <animate attributeName="r" values="5;8;5" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;1;0.6" dur="1.2s" repeatCount="indefinite" />
            </circle>
          </g>
        </g>
      </svg>
    </div>
  );
};

export default RealisticRobot;
