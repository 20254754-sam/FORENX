import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

export function Activity(props: IconProps) {
  return <Icon {...props}><path d="M3 12h4l3-7 4 14 3-7h4" /></Icon>;
}

export function Archive(props: IconProps) {
  return <Icon {...props}><path d="M4 7h16M6 7v12h12V7M9 11h6M5 4h14l1 3H4l1-3Z" /></Icon>;
}

export function Barcode(props: IconProps) {
  return <Icon {...props}><path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" /></Icon>;
}

export function Box(props: IconProps) {
  return <Icon {...props}><path d="M4 8 12 4l8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8M12 12v8" /></Icon>;
}

export function Database(props: IconProps) {
  return <Icon {...props}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></Icon>;
}

export function FileText(props: IconProps) {
  return <Icon {...props}><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></Icon>;
}

export function FlaskConical(props: IconProps) {
  return <Icon {...props}><path d="M10 3h4M11 3v6l-5 9a2 2 0 0 0 1.7 3h8.6a2 2 0 0 0 1.7-3l-5-9V3" /><path d="M8 17h8" /></Icon>;
}

export function Home(props: IconProps) {
  return <Icon {...props}><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" /></Icon>;
}

export function Lock(props: IconProps) {
  return <Icon {...props}><rect x="5" y="10" width="14" height="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>;
}

export function Printer(props: IconProps) {
  return <Icon {...props}><path d="M7 8V4h10v4M7 17H5v-7h14v7h-2M7 14h10v7H7v-7Z" /></Icon>;
}

export function QrCode(props: IconProps) {
  return <Icon {...props}><path d="M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2v2h-2v-2ZM18 14h2v6h-6v-2h4v-4Z" /></Icon>;
}

export function RotateCcw(props: IconProps) {
  return <Icon {...props}><path d="M4 7v6h6" /><path d="M5 13a7 7 0 1 0 2-7" /></Icon>;
}

export function ScanLine(props: IconProps) {
  return <Icon {...props}><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M5 12h14" /></Icon>;
}

export function Settings(props: IconProps) {
  return <Icon {...props}><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></Icon>;
}

export function ShieldCheck(props: IconProps) {
  return <Icon {...props}><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></Icon>;
}

export function Signature(props: IconProps) {
  return <Icon {...props}><path d="M3 18h18M5 15c3-7 5-9 6-8 2 2-6 10-3 10 2 0 4-4 5-3 1 0 1 3 3 3 1 0 2-1 3-2" /></Icon>;
}

export function Users(props: IconProps) {
  return <Icon {...props}><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0" /><path d="M17 11a3 3 0 1 0-1-5.8M17 14a5 5 0 0 1 5 5" /></Icon>;
}
