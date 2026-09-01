import { useState, InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function PasswordInput({ label, className = '', ...props }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div>
      {label && <label className="flat-label">{label}</label>}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={`flat-input pr-10 ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
