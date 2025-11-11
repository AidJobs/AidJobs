interface AidJobsLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function AidJobsLogo({ className = '', size = 'md' }: AidJobsLogoProps) {
  const sizeClasses = {
    sm: 'w-32 h-16',
    md: 'w-48 h-24',
    lg: 'w-64 h-32',
  };

  return (
    <div className={`${sizeClasses[size]} ${className} mx-auto relative`}>
      <svg
        viewBox="0 0 280 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* AID Text - Bold, outlined, blocky sans-serif style */}
        <text
          x="12"
          y="50"
          fontSize="44"
          fontWeight="700"
          fill="none"
          stroke="#1A1D21"
          strokeWidth="2.5"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          letterSpacing="4"
          className="select-none"
        >
          AID
        </text>
        
        {/* JOBS Text - Script/handwritten style, outlined */}
        <text
          x="10"
          y="92"
          fontSize="36"
          fontWeight="400"
          fill="none"
          stroke="#1A1D21"
          strokeWidth="2"
          fontFamily="Georgia, 'Times New Roman', serif"
          letterSpacing="3"
          className="select-none"
          style={{ fontStyle: 'italic', fontVariant: 'small-caps' }}
        >
          JOBS
        </text>
        
        {/* Star Icon - Reddish-orange outline, positioned to the right of AID */}
        <g transform="translate(180, 22)">
          <path
            d="M14 2.5 L17.5 12 L28 14 L20 21.5 L22.5 32 L14 25.5 L5.5 32 L8 21.5 L0 14 L10.5 12 Z"
            fill="none"
            stroke="#E85D3D"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
