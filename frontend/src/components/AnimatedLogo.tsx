interface Props {
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function AnimatedLogo({ size = 48, className = '', animate = true }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="#f7f3ee">
        {animate && <animate attributeName="opacity" values="1;0.9;1" dur="2s" repeatCount="indefinite" />}
      </rect>
      <polygon points="22,14 22,50 48,32" fill="#f97316">
        {animate && (
          <animateTransform attributeName="transform" type="scale" values="1;1.05;1" dur="1.6s" repeatCount="indefinite" />
        )}
      </polygon>
      <rect x="32" y="5" width="28" height="18" rx="5" fill="#2d2a24">
        {animate && <animate attributeName="rx" values="5;7;5" dur="2s" repeatCount="indefinite" />}
      </rect>
      <text x="46" y="18" textAnchor="middle" fill="#f7f3ee"
        fontFamily="Inter,system-ui,sans-serif" fontSize="13" fontWeight="800">24</text>
      <circle cx="10" cy="54" r="4" fill="#f97316">
        {animate && (
          <>
            <animate attributeName="r" values="3;5;3" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="0.8s" repeatCount="indefinite" />
          </>
        )}
      </circle>
    </svg>
  );
}
